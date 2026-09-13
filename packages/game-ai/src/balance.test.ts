import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createGame, seededRng, type GameState } from '@srm/game-core'
import { playOut } from './simulate.js'

/**
 * 多数の試合を回して、engine が破綻しないことと、極端な偏りが無いことを確認する。
 * 環境変数 SRM_BALANCE_OUT にパスを指定すると、統計をJSONで書き出す。
 */

const GAMES = 300

function play(seed: number): { state: GameState; steps: number } {
  const state = createGame({
    players: Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `CPU${i}`, isCpu: true })),
    rng: seededRng(seed),
  })
  return playOut(state, { rng: seededRng(seed * 7919) })
}

describe(`${GAMES}戦の統計`, () => {
  const results = Array.from({ length: GAMES }, (_, i) => play(i + 1))
  const perGame = (predicate: (state: GameState) => number) =>
    results.reduce((sum, r) => sum + predicate(r.state), 0) / GAMES
  const events = (type: string, extra?: (e: Record<string, unknown>) => boolean) => (state: GameState) =>
    state.log.filter((e) => e.type === type && (!extra || extra(e as Record<string, unknown>))).length
  const gamesWith = (predicate: (state: GameState) => boolean) =>
    results.filter((r) => predicate(r.state)).length / GAMES

  const stats = {
    games: GAMES,
    steps: perGame(() => 0) + results.reduce((s, r) => s + r.steps, 0) / GAMES,
    bombs: perGame(events('BOMB_DECLARED')),
    jokerUses: perGame(events('JOKER_USED')),
    sandstorm: perGame(events('DECLARED', (e) => e.effect === 'sandstorm')),
    threeSpade: perGame(events('DECLARED', (e) => e.effect === 'threeSpade')),
    fourStop: perGame(events('DECLARED', (e) => e.effect === 'fourStop')),
    rokurokubi: perGame(events('DECLARED', (e) => e.effect === 'rokurokubi')),
    ambulance: perGame(events('DECLARED', (e) => e.effect === 'ambulance')),
    reverses: perGame(events('DIRECTION_CHANGED')),
    skipped: perGame(events('SKIPPED')),
    finished: perGame(events('FINISHED')),
    eliminated: perGame(events('ELIMINATED')),
    defeatedBomb: perGame(events('DEFEATED', (e) => e.reason === 'bomb')),
    defeatedJokerForced: perGame(events('DEFEATED', (e) => e.reason === 'jokerForced')),
    defeatedOnlyJoker: perGame(events('DEFEATED', (e) => e.reason === 'onlyJoker')),
    defeatedJokerFinish: perGame(events('DEFEATED', (e) => e.reason === 'jokerFinish')),
    gamesWithDefeat: gamesWith((s) => s.defeatedOrder.length > 0),
    jokerRemoved: gamesWith((s) => s.jokerRemoved),
  }

  const out = process.env.SRM_BALANCE_OUT
  if (out) writeFileSync(out, JSON.stringify(stats, null, 2), 'utf8')

  it('全ての試合が終局する', () => {
    expect(results.every((r) => r.state.phase === 'ended')).toBe(true)
  })

  it('Qボンバーは1試合で最大4回', () => {
    expect(stats.bombs).toBeLessThanOrEqual(4)
  })

  it('試合が極端に長くならない', () => {
    expect(stats.steps).toBeLessThan(500)
  })
})
