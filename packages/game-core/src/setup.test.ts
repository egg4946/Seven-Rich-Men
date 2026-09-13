import { describe, expect, it } from 'vitest'
import { cellAt } from './board.js'
import { rankOf } from './cards.js'
import { applyAction } from './game.js'
import { whoMustAct } from './legal.js'
import { seededRng } from './rng.js'
import { createGame } from './setup.js'
import { act, makeState, p, turnOf } from './testing.js'
import { JOKER, SUITS, type GameState } from './types.js'

function seeds(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isCpu: true }))
}

function countBoard(state: GameState): number {
  return SUITS.reduce((sum, suit) => sum + state.board[suit].filter((c) => c !== null).length, 0)
}

/** 配札時の枚数 = 今の手札 + その人が場に置いた7 */
function dealtSizes(state: GameState): number[] {
  return state.players
    .map((player) => {
      const sevens = SUITS.filter((suit) => cellAt(state.board, suit, 7)?.placedBy === player.id)
      return player.hand.length + sevens.length
    })
    .sort((a, b) => a - b)
}

/** 全員が手札の先頭から必要枚数を渡す */
function giveAll(state: GameState): GameState {
  let next = state
  for (const id of whoMustAct(state)) {
    const pending = next.pending
    if (pending?.type !== 'giveSevens') break
    const count = pending.required[id] ?? 0
    next = act(next, { type: 'GIVE_SEVENS', playerId: id, cards: p(next, id).hand.slice(0, count) })
  }
  return next
}

describe('配札', () => {
  it('53枚すべてが手札か場にある', () => {
    const state = createGame({ players: seeds(4), rng: seededRng(42) })
    const inHands = state.players.reduce((sum, player) => sum + player.hand.length, 0)
    expect(inHands + countBoard(state)).toBe(53)
    expect(state.players.some((player) => player.hand.includes(JOKER))).toBe(true)
  })

  it('4枚の7が場に置かれ、手札に7は残らない', () => {
    const state = createGame({ players: seeds(4), rng: seededRng(42) })
    for (const suit of SUITS) expect(cellAt(state.board, suit, 7)).not.toBeNull()
    expect(state.players.every((player) => player.hand.every((id) => rankOf(id) !== 7))).toBe(true)
  })

  it('端数はランダムな人に1枚ずつ配られる', () => {
    expect(dealtSizes(createGame({ players: seeds(4), rng: seededRng(1) }))).toEqual([13, 13, 13, 14])
    expect(dealtSizes(createGame({ players: seeds(5), rng: seededRng(1) }))).toEqual([10, 10, 11, 11, 11])
    expect(dealtSizes(createGame({ players: seeds(6), rng: seededRng(1) }))).toEqual([8, 9, 9, 9, 9, 9])
  })

  it('同じシードなら同じ配札になる', () => {
    const a = createGame({ players: seeds(4), rng: seededRng(7) })
    const b = createGame({ players: seeds(4), rng: seededRng(7) })
    expect(a.players.map((x) => x.hand)).toEqual(b.players.map((x) => x.hand))
  })

  it('人数は3〜6人', () => {
    expect(() => createGame({ players: seeds(2), rng: seededRng(1) })).toThrow()
    expect(() => createGame({ players: seeds(7), rng: seededRng(1) })).toThrow()
  })
})

describe('7渡し', () => {
  it('出した7の枚数だけ渡す必要がある', () => {
    const state = createGame({ players: seeds(4), rng: seededRng(42) })
    expect(state.pending?.type).toBe('giveSevens')
    if (state.pending?.type !== 'giveSevens') return
    const total = Object.values(state.pending.required).reduce((a, b) => a + b, 0)
    expect(total).toBe(4)
  })

  it('枚数が違うと拒否される', () => {
    const state = createGame({ players: seeds(4), rng: seededRng(42) })
    const id = whoMustAct(state)[0]!
    const result = applyAction(state, { type: 'GIVE_SEVENS', playerId: id, cards: [] })
    expect(result.ok).toBe(false)
  })

  it('全員そろうまで待ち、同時に次の人へ渡し、♦7を出した人から始まる', () => {
    const start = createGame({ players: seeds(4), rng: seededRng(42) })
    if (start.pending?.type !== 'giveSevens') throw new Error('pending')
    const givers = whoMustAct(start)

    const gifts = new Map<string, string[]>()
    let state = start
    givers.forEach((id, i) => {
      const count = start.pending?.type === 'giveSevens' ? (start.pending.required[id] ?? 0) : 0
      const cards = p(start, id).hand.slice(0, count)
      gifts.set(id, cards)
      state = act(state, { type: 'GIVE_SEVENS', playerId: id, cards })
      if (i < givers.length - 1) expect(state.phase).toBe('pending')
    })

    expect(state.phase).toBe('turn')
    state.players.forEach((player, i) => {
      const receiver = state.players[(i + 1) % state.players.length]!
      for (const card of gifts.get(player.id) ?? []) {
        expect(receiver.hand).toContain(card)
      }
    })
    expect(turnOf(state)).toBe(cellAt(state.board, 'D', 7)?.placedBy)
  })

  it('もらったカードをそのまま渡すことはできない(選んだ時点の手札から渡る)', () => {
    const state = giveAll(createGame({ players: seeds(4), rng: seededRng(3) }))
    const inHands = state.players.reduce((sum, player) => sum + player.hand.length, 0)
    expect(inHands + countBoard(state)).toBe(53)
  })

  it('渡した結果、手札がジョーカーだけになったら強制敗北する', () => {
    let state = makeState({ hands: [[JOKER, 'H1'], ['C2', 'C3'], ['D1', 'D2']] })
    state.board.D[6] = { placedBy: 'p2', forced: false }
    state.phase = 'pending'
    state.pending = { type: 'giveSevens', required: { p0: 1 }, chosen: {} }

    state = act(state, { type: 'GIVE_SEVENS', playerId: 'p0', cards: ['H1'] })
    expect(p(state, 'p0').status).toBe('defeated')
    expect(state.jokerRemoved).toBe(true)
    expect(p(state, 'p1').hand).toContain('H1')
    expect(turnOf(state)).toBe('p2')
  })
})
