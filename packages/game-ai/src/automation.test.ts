import { describe, expect, it } from 'vitest'
import { createGame, seededRng, type GameState } from '@srm/game-core'
import { cpuDelayMs } from './automation.js'

function newGame(): GameState {
  return createGame({
    titles: null,
    players: Array.from({ length: 3 }, (_, i) => ({ id: `p${i}`, name: `CPU${i}`, isCpu: true })),
    rng: seededRng(1),
  })
}

describe('CPU の待ち時間', () => {
  const game = { ...newGame(), pending: null }

  it('速いはもとの速さのまま(普通の手番は0.7〜1.2秒)', () => {
    expect(cpuDelayMs(game, 'fast', () => 0)).toBe(700)
    expect(cpuDelayMs(game, 'fast', () => 1)).toBe(1200)
  })

  it('遅い > ふつう > 速い の順に長く待つ', () => {
    for (const r of [0, 0.5, 1]) {
      const slow = cpuDelayMs(game, 'slow', () => r)
      const normal = cpuDelayMs(game, 'normal', () => r)
      const fast = cpuDelayMs(game, 'fast', () => r)
      expect(slow).toBeGreaterThan(normal)
      expect(normal).toBeGreaterThan(fast)
    }
  })

  it('速さを指定しなければ ふつう(オンラインの CPU)', () => {
    expect(cpuDelayMs(game, undefined, () => 0.5)).toBe(cpuDelayMs(game, 'normal', () => 0.5))
  })
})
