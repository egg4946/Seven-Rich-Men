import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoomManager } from './rooms.js'

const TOKEN_A = 'token-aaaaaaaaaaaa'
const TOKEN_B = 'token-bbbbbbbbbbbb'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('RoomManager', () => {
  it('同じ接続から別のトークンで入り直そうとしても、切断後に部屋は片付けられる', () => {
    const manager = new RoomManager(
      { sendRoom: () => {}, sendGame: () => {} },
      { timerBaseMs: 1000, timerReserveMs: 2000, cpuDelayScale: 0.1, lobbyGraceMs: 5000, emptyRoomTtlMs: 1000 },
    )
    expect(manager.join('s1', { roomName: 'room', playerName: 'A', token: TOKEN_A }).ok).toBe(true)
    expect(manager.join('s1', { roomName: 'room', playerName: 'B', token: TOKEN_B })).toMatchObject({
      ok: false,
      code: 'forbidden',
    })

    manager.disconnect('s1')
    vi.advanceTimersByTime(10_000)
    expect(manager.roomCount).toBe(0)
  })
})
