import { describe, expect, it } from 'vitest'
import { jokerReactionOptions } from './actions.js'
import { cellAt } from './board.js'
import { applyAction } from './game.js'
import { legalActions, whoMustAct } from './legal.js'
import { act, makeState, p, turnOf } from './testing.js'
import { JOKER, type Action } from './types.js'

const S4 = { suit: 'S', rank: 4 } as const
/** ♠5〜7 が場にあり、♠4 と ♠8 が列の端 */
const RUN = ['S5', 'S6', 'S7']

function jokerUses(actions: Action[]): Extract<Action, { type: 'USE_JOKER' }>[] {
  return actions.filter((a): a is Extract<Action, { type: 'USE_JOKER' }> => a.type === 'USE_JOKER')
}

describe('ジョーカーを置ける場所', () => {
  it('7から繋がった列の端で、そのカードを他人が持っているマスだけ', () => {
    const state = makeState({
      hands: [[JOKER, 'S3', 'S8', 'C1'], ['S4', 'H1'], ['D1']],
      placed: RUN,
    })
    // S8 は自分が持っているので不可。S4 は単独か、外側の S3 と一緒に置ける。
    expect(jokerUses(legalActions(state, 'p0'))).toEqual([
      { type: 'USE_JOKER', playerId: 'p0', cell: S4, withCard: null },
      { type: 'USE_JOKER', playerId: 'p0', cell: S4, withCard: 'S3' },
    ])
  })

  it('誰も持っていないマスには置けない', () => {
    const state = makeState({ hands: [[JOKER, 'C1'], ['S4', 'H1'], ['D1']], placed: RUN })
    const result = applyAction(state, {
      type: 'USE_JOKER',
      playerId: 'p0',
      cell: { suit: 'S', rank: 8 },
      withCard: null,
    })
    expect(result.ok).toBe(false)
  })

  it('飛び地の隣には置けない', () => {
    const state = makeState({
      hands: [[JOKER, 'C1'], ['S9', 'S11', 'H1'], ['D1']],
      placed: ['S7', 'S8'],
    })
    state.board.S[9] = { placedBy: 'x', forced: true } // ♠10 が飛び地
    const cells = jokerUses(legalActions(state, 'p0')).map((a) => `${a.cell.suit}${a.cell.rank}`)
    expect(cells).toEqual(['S9'])
  })

  it('外側のマスが埋まっていれば、一緒に出すカードは選べない', () => {
    const state = makeState({ hands: [[JOKER, 'C1'], ['S4', 'H1'], ['D1']], placed: RUN })
    state.board.S[2] = { placedBy: 'x', forced: true } // ♠3 が飛び地
    expect(jokerUses(legalActions(state, 'p0'))).toEqual([
      { type: 'USE_JOKER', playerId: 'p0', cell: S4, withCard: null },
    ])
  })
})

describe('ジョーカーの解決', () => {
  it('持ち主がカードを出し、ジョーカーをもらうか選ぶ', () => {
    let state = makeState({ hands: [[JOKER, 'S3', 'C1'], ['S4', 'H1'], ['D1']], placed: RUN })
    state = act(state, { type: 'USE_JOKER', playerId: 'p0', cell: S4, withCard: 'S3' })

    expect(cellAt(state.board, 'S', 4)).toEqual({ placedBy: 'p1', forced: true })
    expect(cellAt(state.board, 'S', 3)).toEqual({ placedBy: 'p0', forced: true })
    expect(state.pending).toEqual({ type: 'jokerTake', holder: 'p1' })

    const taken = act(state, { type: 'JOKER_TAKE', playerId: 'p1', take: true })
    expect(p(taken, 'p1').hand).toContain(JOKER)
    expect(turnOf(taken)).toBe('p1')

    const declined = act(state, { type: 'JOKER_TAKE', playerId: 'p1', take: false })
    expect(declined.jokerRemoved).toBe(true)
    expect(turnOf(declined)).toBe('p1')
  })

  it('出させたカードの効果は発動しない', () => {
    let state = makeState({ hands: [[JOKER, 'C1'], ['S8', 'H1'], ['D1']], placed: ['S7'] })
    state = act(state, { type: 'USE_JOKER', playerId: 'p0', cell: { suit: 'S', rank: 8 }, withCard: null })
    expect(p(state, 'p1').skips).toBe(0)
    expect(state.pending?.type).toBe('jokerTake')
  })

  it('出させられて手札が0枚になった持ち主は強制敗北し、ジョーカーは除外', () => {
    let state = makeState({ hands: [[JOKER, 'C1'], ['S4'], ['D1']], placed: RUN })
    state = act(state, { type: 'USE_JOKER', playerId: 'p0', cell: S4, withCard: null })
    expect(state.log).toContainEqual({ type: 'DEFEATED', playerId: 'p1', reason: 'jokerForced' })
    expect(state.jokerRemoved).toBe(true)
    expect(turnOf(state)).toBe('p2')
  })
})

describe('禁止アガリ', () => {
  it('ジョーカーと一緒に出して手札が0枚になったら強制敗北。解決は続く', () => {
    let state = makeState({ hands: [[JOKER, 'S3'], ['S4', 'H1'], ['D1']], placed: RUN })
    state = act(state, { type: 'USE_JOKER', playerId: 'p0', cell: S4, withCard: 'S3' })
    expect(state.log).toContainEqual({ type: 'DEFEATED', playerId: 'p0', reason: 'jokerFinish' })
    expect(state.finishOrder).not.toContain('p0')
    expect(state.pending).toEqual({ type: 'jokerTake', holder: 'p1' })
  })

  it('通常配置で手札がジョーカーだけになったら強制敗北', () => {
    let state = makeState({ hands: [[JOKER, 'S8'], ['H1'], ['D1']], placed: ['S7'] })
    state = act(state, { type: 'PLACE', playerId: 'p0', card: 'S8' })
    expect(state.log).toContainEqual({ type: 'DEFEATED', playerId: 'p0', reason: 'onlyJoker' })
    expect(state.jokerRemoved).toBe(true)
    expect(turnOf(state)).toBe('p1')
  })
})

describe('砂嵐・3スペ', () => {
  it('砂嵐でジョーカーを奪う。持ち主は選べない', () => {
    let state = makeState({
      hands: [[JOKER, 'C1', 'C2'], ['S4', 'H1'], ['H3', 'D3', 'C3', 'D1']],
      placed: RUN,
    })
    state = act(state, { type: 'USE_JOKER', playerId: 'p0', cell: S4, withCard: null })
    expect(state.pending?.type).toBe('jokerReaction')
    expect(whoMustAct(state)).toEqual(['p2'])

    state = act(state, { type: 'REACT', playerId: 'p2', effect: 'sandstorm' })
    expect(p(state, 'p2').hand).toContain(JOKER)
    expect(p(state, 'p2').used.sandstorm).toEqual(['H3', 'D3', 'C3'])
    expect(cellAt(state.board, 'S', 4)?.placedBy).toBe('p1')
    expect(state.phase).toBe('turn')
    expect(turnOf(state)).toBe('p1')
  })

  it('全員スキップなら持ち主が選ぶ', () => {
    let state = makeState({
      hands: [[JOKER, 'C1', 'C2'], ['S4', 'H1'], ['H3', 'D3', 'C3', 'D1']],
      placed: RUN,
    })
    state = act(state, { type: 'USE_JOKER', playerId: 'p0', cell: S4, withCard: null })
    state = act(state, { type: 'REACT', playerId: 'p2', effect: 'skip' })
    expect(state.pending).toEqual({ type: 'jokerTake', holder: 'p1' })
  })

  it('押した順ではなく、砂嵐が3スペより優先される', () => {
    let state = makeState({
      hands: [[JOKER, 'C1', 'C2'], ['S4', 'S3', 'H1'], ['H3', 'D3', 'C3', 'D1']],
      placed: RUN,
    })
    state = act(state, { type: 'USE_JOKER', playerId: 'p0', cell: S4, withCard: null })
    state = act(state, { type: 'REACT', playerId: 'p1', effect: 'threeSpade' })
    state = act(state, { type: 'REACT', playerId: 'p2', effect: 'sandstorm' })
    expect(p(state, 'p2').hand).toContain(JOKER)
    expect(p(state, 'p1').used.threeSpade).toEqual([])
  })

  it('ジョーカーを出した本人も砂嵐で回収できる', () => {
    let state = makeState({
      hands: [[JOKER, 'H3', 'D3', 'C3', 'C1'], ['S4', 'H1'], ['D1']],
      placed: RUN,
    })
    state = act(state, { type: 'USE_JOKER', playerId: 'p0', cell: S4, withCard: null })
    state = act(state, { type: 'REACT', playerId: 'p0', effect: 'sandstorm' })
    expect(p(state, 'p0').hand).toContain(JOKER)
    expect(turnOf(state)).toBe('p1')
  })

  it('3スペの宣言者が、出させられて強制敗北した場合はジョーカーを除外する', () => {
    // p1 の手札は ♠3 だけ。ジョーカーで ♠3 を出させられる一方で、3スペを宣言する
    let state = makeState({
      hands: [[JOKER, 'C1', 'C2'], ['S3'], ['D1', 'D2']],
      placed: ['S4', 'S5', 'S6', 'S7'],
    })
    state = act(state, { type: 'USE_JOKER', playerId: 'p0', cell: { suit: 'S', rank: 3 }, withCard: null })
    expect(whoMustAct(state)).toEqual(['p1'])
    state = act(state, { type: 'REACT', playerId: 'p1', effect: 'threeSpade' })

    expect(p(state, 'p1').status).toBe('defeated')
    expect(p(state, 'p1').hand).toEqual([])
    expect(state.jokerRemoved).toBe(true)
    expect(state.log.some((e) => e.type === 'JOKER_MOVED')).toBe(false)
    expect(state.phase).toBe('turn')
    expect(turnOf(state)).toBe('p2')
  })

  it('砂嵐に使った3♠でも、3スペには使える', () => {
    const state = makeState({ hands: [['S3', 'H3', 'D3', 'C1'], ['H1'], ['D1']] })
    p(state, 'p0').used.sandstorm.push('S3', 'H3', 'D3')
    expect(jokerReactionOptions(state, 'p0')).toEqual(['threeSpade'])
  })

  it('10捨てで出したジョーカーには受付が発生しない', () => {
    let state = makeState({
      hands: [['S10', JOKER, 'C1'], ['H3', 'D3', 'C3', 'H1'], ['D1']],
      placed: ['S7', 'S8', 'S9'],
    })
    state = act(state, { type: 'PLACE', playerId: 'p0', card: 'S10' })
    state = act(state, { type: 'TEN_DISCARD', playerId: 'p0', card: JOKER })
    expect(state.phase).toBe('turn')
    expect(state.jokerRemoved).toBe(true)
  })
})
