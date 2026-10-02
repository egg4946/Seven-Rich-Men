import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGame, seededRng, viewFor, type PlayerView } from '@srm/game-core'
import type { RoomView } from '@srm/protocol'
import type { OnlineHandlers } from '../online/client'
import { loadCpuSpeed, useGameStore } from './store'

const online = vi.hoisted(() => ({
  handlers: null as OnlineHandlers | null,
  act: vi.fn(async () => ({ ok: true, data: null })),
  cancelJoin: vi.fn(),
  saveLastRoom: vi.fn(),
}))

vi.mock('../online/client', () => ({
  createOnlineClient: (handlers: OnlineHandlers) => {
    online.handlers = handlers
    return {
      join: async () => ({ ok: true, data: null }),
      cancelJoin: online.cancelJoin,
      leave: async () => {},
      settings: async () => ({ ok: true, data: null }),
      start: async () => ({ ok: true, data: null }),
      next: async () => ({ ok: true, data: null }),
      end: async () => ({ ok: true, data: null }),
      act: online.act,
    }
  },
  loadLastRoom: () => null,
  saveLastRoom: online.saveLastRoom,
}))

function roomOf(matchId: string): RoomView {
  return {
    name: 'room',
    phase: 'playing',
    you: 'p1',
    hostId: 'p1',
    members: [{ id: 'p1', name: 'A', isHost: true, connected: true, seated: true }],
    settings: { seats: 3, cpuLevel: 'normal', rounds: 1, seating: 'fixed', fourPlayerExchange: 'double' },
    matchId,
    series: null,
  }
}

function viewWith(version: number, hand: string[]): PlayerView {
  const game = createGame({
    players: [
      { id: 'p1', name: 'A', isCpu: false },
      { id: 'cpu1', name: 'C1', isCpu: true },
      { id: 'cpu2', name: 'C2', isCpu: true },
    ],
    rng: seededRng(1),
  })
  const base = viewFor(game, 'p1')!
  return { ...base, version, you: { ...base.you, hand } }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(async () => {
  await useGameStore.getState().leaveRoom()
  vi.useRealTimers()
})

describe('CPUの速さ', () => {
  function stubStorage(saved: string | null) {
    const items = new Map<string, string>(saved === null ? [] : [['srm:cpuSpeed', saved]])
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => items.get(k) ?? null,
      setItem: (k: string, v: string) => void items.set(k, v),
    })
    return items
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('保存した速さを読み込み、なければ・おかしな値なら ふつう', () => {
    stubStorage('slow')
    expect(loadCpuSpeed()).toBe('slow')
    stubStorage(null)
    expect(loadCpuSpeed()).toBe('normal')
    stubStorage('turbo')
    expect(loadCpuSpeed()).toBe('normal')
  })

  it('切り替えた速さを保存する', () => {
    const items = stubStorage(null)
    useGameStore.getState().setCpuSpeed('fast')
    expect(useGameStore.getState().cpuSpeed).toBe('fast')
    expect(items.get('srm:cpuSpeed')).toBe('fast')
  })
})

describe('入室', () => {
  it('サーバーの起動待ちをやめたら、リロード後に入り直す部屋も忘れる', () => {
    online.saveLastRoom.mockClear()
    useGameStore.getState().cancelJoin()
    expect(online.cancelJoin).toHaveBeenCalledTimes(1)
    expect(online.saveLastRoom).toHaveBeenCalledWith(null)
  })
})

describe('オンライン対戦の受信', () => {
  it('通知を取りこぼして再戦をまたいでも、新しい対戦の画面に切り替わる', async () => {
    expect(await useGameStore.getState().joinRoom('A', 'room')).toBeNull()
    const handlers = online.handlers!
    const oldView = viewWith(80, ['S1'])

    handlers.onRoom(roomOf('match-1'))
    handlers.onGame({ matchId: 'match-1', view: oldView, timer: null })
    expect(useGameStore.getState().view?.you.hand).toEqual(['S1'])

    // 終局と再戦の通知を受け取れないまま再接続した
    handlers.onRoom(roomOf('match-2'))
    handlers.onGame({ matchId: 'match-2', view: viewWith(0, ['S6', 'C1']), timer: null })
    expect(useGameStore.getState().view?.you.hand).toEqual(['S6', 'C1'])

    // 前の対戦の更新が遅れて届いても上書きしない
    handlers.onGame({ matchId: 'match-1', view: oldView, timer: null })
    expect(useGameStore.getState().view?.you.hand).toEqual(['S6', 'C1'])
  })

  it('応答を待っている間の連打は、同じ画面から二重に送らない', async () => {
    expect(await useGameStore.getState().joinRoom('A', 'room')).toBeNull()
    online.handlers!.onRoom(roomOf('match-1'))
    online.handlers!.onGame({ matchId: 'match-1', view: viewWith(3, ['S1']), timer: null })
    online.act.mockClear()

    const pass = { type: 'PASS', playerId: 'p1' } as const
    useGameStore.getState().act(pass)
    useGameStore.getState().act(pass)
    expect(online.act).toHaveBeenCalledTimes(1)
    expect(online.act).toHaveBeenCalledWith({ matchId: 'match-1', version: 3, action: pass })

    // 応答が届いたあとは、また送れる
    await online.act.mock.results[0]!.value
    useGameStore.getState().act(pass)
    expect(online.act).toHaveBeenCalledTimes(2)
  })
})
