import { describe, expect, it } from 'vitest'
import { SUITS, createGame, seededRng, titlesFor, type GameState } from '@srm/game-core'
import { playOut } from './simulate.js'

function newGame(seed: number, playerCount: number, withTitles = false): GameState {
  const ids = Array.from({ length: playerCount }, (_, i) => `p${i}`)
  return createGame({
    titles: withTitles ? titlesFor(ids, seed % 2 === 0 ? 'double' : 'single') : null,
    players: Array.from({ length: playerCount }, (_, i) => ({
      id: `p${i}`,
      name: `CPU${i}`,
      isCpu: true,
    })),
    rng: seededRng(seed),
  })
}

function cardsAccountedFor(state: GameState): number {
  const onBoard = SUITS.reduce(
    (sum, suit) => sum + state.board[suit].filter((cell) => cell !== null && !cell.joker).length,
    0,
  )
  const inHands = state.players.reduce((sum, p) => sum + p.hand.length, 0)
  return onBoard + inHands + (state.jokerRemoved ? 1 : 0)
}

describe('CPU同士の通し実行', () => {
  const seeds = [1, 2, 3, 7, 42, 99, 123, 2024, 31337, 65535]

  for (const playerCount of [3, 4, 5, 6]) {
    it(`${playerCount}人: 不正な手を選ばず、必ず終局し、順位が全員分確定する`, () => {
      for (const seed of seeds) {
        const { state } = playOut(newGame(seed, playerCount), { rng: seededRng(seed) })
        expect(state.phase).toBe('ended')
        expect(new Set(state.ranking).size).toBe(playerCount)
      }
    })
  }

  for (const playerCount of [3, 4, 5, 6]) {
    it(`${playerCount}人: 2ラウンド目以降(カード交換あり)も不正な手を選ばず終局する`, () => {
      for (const seed of seeds) {
        const { state } = playOut(newGame(seed, playerCount, true), { rng: seededRng(seed) })
        expect(state.phase).toBe('ended')
        expect(state.log.some((e) => e.type === 'CARDS_EXCHANGED')).toBe(true)
        expect(cardsAccountedFor(state)).toBe(53)
      }
    })
  }

  it('終局時、53枚すべてが盤面・手札・除外のどこかにある', () => {
    for (const seed of seeds) {
      const { state } = playOut(newGame(seed, 4), { rng: seededRng(seed) })
      expect(cardsAccountedFor(state)).toBe(53)
    }
  })

  it('CPUは禁止アガリ(ジョーカーで手札0)をしない', () => {
    for (const seed of seeds) {
      const { state } = playOut(newGame(seed, 4), { rng: seededRng(seed) })
      expect(state.log.some((e) => e.type === 'DEFEATED' && e.reason === 'jokerFinish')).toBe(false)
    }
  })

  it('easy(ランダム)でも不正な手にならず終局する', () => {
    for (const seed of seeds) {
      const { state } = playOut(newGame(seed, 4), { rng: seededRng(seed), level: 'easy' })
      expect(state.phase).toBe('ended')
    }
  })
})
