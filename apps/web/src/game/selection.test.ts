import { describe, expect, it } from 'vitest'
import {
  JOKER,
  MAX_PASSES,
  createEmptyBoard,
  putCard,
  viewFor,
  type CardId,
  type GameState,
  type Player,
  type PlayerView,
} from '@srm/game-core'
import { boardMarks, playableCards, quickAction, selectionMode } from './selection'

/** 手札と場を指定して、p0 から見た視点を作る */
function viewOf(opts: { hands: CardId[][]; placed: CardId[]; turnIndex?: number }): PlayerView {
  const players: Player[] = opts.hands.map((hand, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    isCpu: false,
    hand: hand.slice(),
    passesLeft: MAX_PASSES,
    skips: 0,
    status: 'playing',
    used: { sandstorm: [], threeSpade: [], fourStop: [], rokurokubi: [], ambulance: [] },
  }))
  const board = createEmptyBoard()
  for (const id of opts.placed) putCard(board, id, 'setup', false)
  const state: GameState = {
    players,
    board,
    turnIndex: opts.turnIndex ?? 0,
    direction: 1,
    phase: 'turn',
    pending: null,
    jokerRemoved: false,
    version: 0,
    finishOrder: [],
    eliminatedOrder: [],
    defeatedOrder: [],
    ranking: [],
    log: [],
  }
  const view = viewFor(state, 'p0')
  if (!view) throw new Error('p0 がいない')
  return view
}

/** ♠5〜7 が場にあり、♠4 と ♠8 が列の端 */
const RUN: CardId[] = ['S5', 'S6', 'S7']

describe('出せるカードのハイライト', () => {
  const hands: CardId[][] = [[JOKER, 'S1', 'S4', 'H8'], ['S8', 'H1'], ['D1']]

  it('自分の手番では、合法手にあるカードだけを出せるとする', () => {
    const view = viewOf({ hands, placed: [...RUN, 'H7'] })
    expect(selectionMode(view).type).toBe('turn')
    expect(playableCards(view, selectionMode(view))).toEqual(new Set(['S4', 'H8', JOKER]))
  })

  it('自分の手番でなくても、今の場で出せないカードは暗くする', () => {
    const view = viewOf({ hands, placed: [...RUN, 'H7'], turnIndex: 1 })
    expect(selectionMode(view).type).toBe('none')
    expect(playableCards(view, selectionMode(view))).toEqual(new Set(['S4', 'H8', JOKER]))
  })

  it('ジョーカーは、置けるマスが全て自分の手札なら暗くする', () => {
    const view = viewOf({ hands: [[JOKER, 'S4', 'S8', 'H1'], ['H2'], ['D1']], placed: RUN, turnIndex: 1 })
    expect(playableCards(view, selectionMode(view))?.has(JOKER)).toBe(false)
  })

  it('10捨て・7渡しでは、どのカードも選べるので暗くしない', () => {
    const view = viewOf({ hands, placed: RUN })
    expect(playableCards(view, { type: 'ten' })).toBeNull()
    expect(playableCards(view, { type: 'give', count: 1 })).toBeNull()
  })
})

describe('ダブルクリック・上スワイプで出す', () => {
  it('出せるカードは、そのまま通常配置する', () => {
    const view = viewOf({ hands: [['S4', 'S1'], ['S8'], ['D1']], placed: RUN })
    expect(quickAction(view, selectionMode(view), 'S4')).toEqual({ type: 'PLACE', playerId: 'p0', card: 'S4' })
  })

  it('出せないカード・ジョーカー・強制敗北する手は、選択に回す', () => {
    const view = viewOf({ hands: [[JOKER, 'S4'], ['S8'], ['D1']], placed: RUN })
    const mode = selectionMode(view)
    expect(quickAction(view, mode, JOKER)).toBeNull()
    // ♠4 を出すとジョーカーだけが残る
    expect(quickAction(view, mode, 'S4')).toBeNull()
    expect(quickAction(viewOf({ hands: [['S1', 'S4'], ['S8'], ['D1']], placed: RUN }), mode, 'S1')).toBeNull()
  })

  it('10捨てでは、選んだカードを出す。ジョーカーは除外されるので選択に回す', () => {
    const base = viewOf({ hands: [[JOKER, 'S1', 'H9'], ['S8'], ['D1']], placed: RUN })
    const view: PlayerView = {
      ...base,
      phase: 'pending',
      pending: { type: 'tenDiscard', by: 'p0' },
      legalActions: base.you.hand.map((card) => ({ type: 'TEN_DISCARD', playerId: 'p0', card })),
    }
    expect(quickAction(view, { type: 'ten' }, 'S1')).toEqual({ type: 'TEN_DISCARD', playerId: 'p0', card: 'S1' })
    expect(quickAction(view, { type: 'ten' }, JOKER)).toBeNull()
  })
})

describe('場のマスを押して出す', () => {
  it('選んだカードを出せるなら、そのマスを押すと出せる', () => {
    const view = viewOf({ hands: [['S4', 'S1'], ['S8'], ['D1']], placed: RUN })
    expect(boardMarks(view, selectionMode(view), ['S4'], null)).toEqual([
      {
        cell: { suit: 'S', rank: 4 },
        variant: 'target',
        action: { type: 'PLACE', playerId: 'p0', card: 'S4' },
        danger: false,
        label: '♠4 を出す',
      },
    ])
    expect(boardMarks(view, selectionMode(view), ['S1'], null)).toEqual([])
  })

  it('ジョーカーは、置けるマスと、自分の手札なので置けないマスを示す', () => {
    // ♠8 は自分の手札なので置けない。♠4 は外側の ♠3 と一緒にも置けるので、押すと位置の選択になる
    const view = viewOf({ hands: [[JOKER, 'S3', 'S8', 'C1'], ['S4', 'H1'], ['D1']], placed: RUN })
    const mode = selectionMode(view)
    expect(boardMarks(view, mode, [JOKER], null)).toMatchObject([
      { cell: { suit: 'S', rank: 4 }, variant: 'target', action: null },
      { cell: { suit: 'S', rank: 8 }, variant: 'blocked', action: null },
    ])

    expect(boardMarks(view, mode, [JOKER], { suit: 'S', rank: 4 })).toMatchObject([
      {
        cell: { suit: 'S', rank: 4 },
        variant: 'chosen',
        action: { type: 'USE_JOKER', cell: { suit: 'S', rank: 4 }, withCard: null },
      },
      {
        cell: { suit: 'S', rank: 3 },
        variant: 'with',
        action: { type: 'USE_JOKER', cell: { suit: 'S', rank: 4 }, withCard: 'S3' },
      },
      { cell: { suit: 'S', rank: 8 }, variant: 'blocked' },
    ])
  })

  it('一緒に出すカードがなければ、ジョーカーの位置を押すとそのまま置く', () => {
    const view = viewOf({ hands: [[JOKER, 'C1'], ['S4', 'H1'], ['D1']], placed: RUN })
    expect(boardMarks(view, selectionMode(view), [JOKER], null)).toMatchObject([
      {
        cell: { suit: 'S', rank: 4 },
        variant: 'target',
        action: { type: 'USE_JOKER', cell: { suit: 'S', rank: 4 }, withCard: null },
      },
    ])
  })
})
