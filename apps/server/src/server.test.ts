import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { io as connect, type Socket } from 'socket.io-client'
import type { ClientToServerEvents, GameUpdate, RoomView, ServerToClientEvents } from '@srm/protocol'
import { createAppServer } from './server.js'

type Client = Socket<ServerToClientEvents, ClientToServerEvents>

const cleanups: (() => Promise<void> | void)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

/** 制限時間と CPU の考える時間を短くしたサーバーを、空いているポートで起動する */
async function boot(): Promise<string> {
  const app = createAppServer({
    timerBaseMs: 40,
    timerReserveMs: 0,
    cpuDelayScale: 0.01,
    lobbyGraceMs: 1000,
    emptyRoomTtlMs: 1000,
    corsOrigins: [],
  })
  await new Promise<void>((resolve) => app.httpServer.listen(0, resolve))
  cleanups.push(() => app.close())
  const { port } = app.httpServer.address() as AddressInfo
  return `http://localhost:${port}`
}

function client(url: string): Client {
  const socket: Client = connect(url, { transports: ['websocket'], forceNew: true })
  cleanups.push(() => {
    socket.close()
  })
  return socket
}

function waitFor<T>(socket: Client, event: 'room:state' | 'game:update', match: (payload: T) => boolean): Promise<T> {
  return new Promise((resolve) => {
    const listener = (payload: T) => {
      if (!match(payload)) return
      socket.off(event, listener as never)
      resolve(payload)
    }
    socket.on(event, listener as never)
  })
}

describe('Socket.IO サーバー', () => {
  it('2人が同じ部屋に入り、互いの手札を見られないまま最後まで遊べる', async () => {
    const url = await boot()
    const alice = client(url)
    const bob = client(url)
    const aliceUpdates: GameUpdate[] = []
    alice.on('game:update', (update) => aliceUpdates.push(update))

    const joinedA = await alice.emitWithAck('room:join', {
      roomName: 'Room-1',
      playerName: 'アリス',
      token: 'alice-token-0000000',
    })
    // 大文字・小文字が違っても同じ部屋に入る
    const joinedB = await bob.emitWithAck('room:join', {
      roomName: 'room-1',
      playerName: 'ボブ',
      token: 'bob-token-000000000',
    })
    expect(joinedA.ok && joinedB.ok).toBe(true)
    if (!joinedA.ok || !joinedB.ok) return
    expect(joinedB.data.members.map((m) => m.name)).toEqual(['アリス', 'ボブ'])

    const aliceEnded = waitFor<RoomView>(alice, 'room:state', (room) => room.phase === 'result')
    const bobEnded = waitFor<RoomView>(bob, 'room:state', (room) => room.phase === 'result')
    const bobLast = new Promise<GameUpdate>((resolve) => {
      let last: GameUpdate | null = null
      bob.on('game:update', (update) => {
        last = update
        if (update.view.phase === 'ended') resolve(last)
      })
    })

    expect(await alice.emitWithAck('room:start')).toEqual({ ok: true, data: null })
    await Promise.all([aliceEnded, bobEnded])

    const finalA = aliceUpdates.at(-1)?.view
    const finalB = (await bobLast).view
    expect(finalA?.phase).toBe('ended')
    expect(finalA?.ranking).toHaveLength(4)
    expect(finalB.ranking).toEqual(finalA?.ranking)

    // アリスに届いたデータは、すべてアリスの視点で、他人の手札を含まない
    expect(aliceUpdates.length).toBeGreaterThan(10)
    for (const update of aliceUpdates) {
      expect(update.view.you.id).toBe(joinedA.data.you)
      for (const opponent of update.view.opponents) expect(opponent).not.toHaveProperty('hand')
    }
  }, 30_000)

  it('切断しても、同じトークンで入り直せば同じ席に戻れる', async () => {
    const url = await boot()
    const alice = client(url)
    const bob = client(url)
    const joined = await alice.emitWithAck('room:join', {
      roomName: 'reconnect',
      playerName: 'アリス',
      token: 'alice-token-1111111',
    })
    await bob.emitWithAck('room:join', { roomName: 'reconnect', playerName: 'ボブ', token: 'bob-token-111111111' })
    if (!joined.ok) throw new Error(joined.error)
    await alice.emitWithAck('room:start')
    alice.disconnect()

    const again = client(url)
    const update = waitFor<GameUpdate>(again, 'game:update', () => true)
    const rejoined = await again.emitWithAck('room:join', {
      roomName: 'reconnect',
      playerName: 'アリス',
      token: 'alice-token-1111111',
    })
    expect(rejoined).toMatchObject({ ok: true, data: { you: joined.data.you, phase: 'playing' } })
    expect((await update).view.you.id).toBe(joined.data.you)
  }, 30_000)

  it('形式の正しくない入力と、部屋に入る前の操作は拒否される', async () => {
    const url = await boot()
    const socket = client(url)
    expect(await socket.emitWithAck('room:join', { roomName: '', playerName: 'x', token: 'short' })).toMatchObject({
      ok: false,
      code: 'invalid',
    })
    expect(await socket.emitWithAck('room:start')).toMatchObject({ ok: false, code: 'not_found' })
    expect(
      await socket.emitWithAck('game:act', {
        matchId: 'match',
        version: 0,
        action: { type: 'PASS', playerId: 'someone' },
      }),
    ).toMatchObject({ ok: false, code: 'not_found' })
  })
})
