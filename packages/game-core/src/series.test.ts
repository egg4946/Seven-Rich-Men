import { describe, expect, it } from 'vitest'
import { applyAction } from './game.js'
import { whoMustAct } from './legal.js'
import { seededRng } from './rng.js'
import {
  cardStrength,
  endSeries,
  exchangePairs,
  isValidTribute,
  nextRound,
  recordRound,
  roundPoints,
  seriesTitles,
  standings,
  startSeries,
  titlesFor,
  tributeOptions,
  type SeriesRules,
} from './series.js'
import { createGame } from './setup.js'
import { act, p } from './testing.js'
import { JOKER, RANK, type GameState, type Title } from './types.js'
import { viewFor } from './view.js'

function seeds(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isCpu: true }))
}

const ids = (n: number) => seeds(n).map((s) => s.id)

describe('カードの強さ', () => {
  it('ジョーカー > 7 > 8 > 6 > 9 > 5 > 10 > 4 > 3 > J > Q > 2 > K > A', () => {
    const order = [JOKER, 'S7', 'S8', 'S6', 'S9', 'S5', 'S10', 'S4', 'S3', 'S11', 'S12', 'S2', 'S13', 'S1']
    const strengths = order.map(cardStrength)
    expect(strengths).toEqual(strengths.slice().sort((a, b) => b - a))
    expect(new Set(strengths).size).toBe(order.length)
  })

  it('スートで差はない', () => {
    expect(cardStrength('S8')).toBe(cardStrength('H8'))
  })
})

describe('強い順に渡すカードの選び方', () => {
  it('迷う余地がなければ全部 fixed', () => {
    expect(tributeOptions([JOKER, 'S8', 'H1', 'C2'], 2)).toEqual({ fixed: [JOKER, 'S8'], choices: [], pick: 0 })
  })

  it('同じ強さのカードが複数あれば、その中から選ぶ', () => {
    const options = tributeOptions([JOKER, 'S8', 'H8', 'C2'], 2)
    expect(options.fixed).toEqual([JOKER])
    expect(options.choices.sort()).toEqual(['H8', 'S8'])
    expect(options.pick).toBe(1)
    expect(isValidTribute([JOKER, 'S8', 'H8', 'C2'], 2, [JOKER, 'H8'])).toBe(true)
    expect(isValidTribute([JOKER, 'S8', 'H8', 'C2'], 2, ['S8', 'H8'])).toBe(false)
    expect(isValidTribute([JOKER, 'S8', 'H8', 'C2'], 2, [JOKER, 'C2'])).toBe(false)
  })
})

describe('身分', () => {
  const titles = (n: number, style: 'double' | 'single' = 'double') => Object.values(titlesFor(ids(n), style))

  it('人数ごとの身分(§9-1)', () => {
    expect(titles(3)).toEqual<Title[]>(['fugo', 'heimin', 'hinmin'])
    expect(titles(4)).toEqual<Title[]>(['daifugo', 'fugo', 'hinmin', 'daihinmin'])
    expect(titles(4, 'single')).toEqual<Title[]>(['fugo', 'heimin', 'heimin', 'hinmin'])
    expect(titles(5)).toEqual<Title[]>(['daifugo', 'fugo', 'heimin', 'hinmin', 'daihinmin'])
    expect(titles(6)).toEqual<Title[]>(['daifugo', 'fugo', 'heimin', 'heimin', 'hinmin', 'daihinmin'])
  })

  it('交換の組は、大富豪↔大貧民が2枚、富豪↔貧民が1枚', () => {
    expect(exchangePairs(titlesFor(['a', 'b', 'c', 'd'], 'double'))).toEqual([
      { upper: 'a', lower: 'd', count: 2 },
      { upper: 'b', lower: 'c', count: 1 },
    ])
    expect(exchangePairs(titlesFor(['a', 'b', 'c', 'd'], 'single'))).toEqual([{ upper: 'a', lower: 'd', count: 1 }])
    expect(exchangePairs(titlesFor(['a', 'b', 'c'], 'double'))).toEqual([{ upper: 'a', lower: 'c', count: 1 }])
  })
})

describe('ポイントとシリーズの進行', () => {
  const rules: SeriesRules = { rounds: 3, seating: 'fixed', fourPlayerExchange: 'double' }

  it('n人戦なら 1位 n−1点 … 最下位 0点', () => {
    expect(roundPoints(['a', 'b', 'c', 'd'])).toEqual({ a: 3, b: 2, c: 1, d: 0 })
  })

  it('決まったラウンド数で終わり、ポイントを合計する', () => {
    let series = startSeries(rules, ['a', 'b', 'c'])
    expect(seriesTitles(series)).toBeNull()
    series = recordRound(series, ['a', 'b', 'c'])
    series = recordRound(series, ['c', 'b', 'a']) // 同じラウンドの二重記録は無視
    expect(series.scores).toEqual({ a: 2, b: 1, c: 0 })
    expect(seriesTitles(series)).toEqual({ a: 'fugo', b: 'heimin', c: 'hinmin' })

    series = recordRound(nextRound(series), ['c', 'a', 'b'])
    expect(series.finished).toBe(false)
    series = recordRound(nextRound(series), ['b', 'c', 'a'])
    expect(series.round).toBe(3)
    expect(series.finished).toBe(true)
    expect(series.scores).toEqual({ a: 3, b: 3, c: 3 })
    expect(nextRound(series).round).toBe(3)
  })

  it('同点なら最後のラウンドの順位が上の人を上にする', () => {
    let series = startSeries(rules, ['a', 'b', 'c'])
    series = recordRound(series, ['a', 'b', 'c'])
    series = recordRound(nextRound(series), ['c', 'b', 'a'])
    // a: 2, b: 2, c: 2 → 最後の順位 c, b, a
    expect(standings(series)).toEqual(['c', 'b', 'a'])
  })

  it('エンドレスは、ラウンドの合間にだけ終えられる', () => {
    let series = startSeries({ ...rules, rounds: 'endless' }, ['a', 'b', 'c'])
    expect(endSeries(series).finished).toBe(false)
    series = recordRound(series, ['a', 'b', 'c'])
    expect(series.finished).toBe(false)
    expect(endSeries(series).finished).toBe(true)
  })
})

describe('カード交換', () => {
  /** p0 が大富豪、p3 が大貧民の4人戦 */
  function exchangeGame(seed: number): GameState {
    return createGame({ players: seeds(4), rng: seededRng(seed), titles: titlesFor(ids(4), 'double') })
  }

  it('7を置く前に交換の選択待ちになる', () => {
    const state = exchangeGame(1)
    expect(state.pending?.type).toBe('exchange')
    expect(state.board.S.every((cell) => cell === null)).toBe(true)
    expect(state.titles).toMatchObject({ p0: 'daifugo', p3: 'daihinmin' })
    expect(whoMustAct(state)).toEqual(expect.arrayContaining(['p0', 'p1']))
  })

  it('下位は強い順でないカードを渡せない', () => {
    const state = exchangeGame(1)
    if (!whoMustAct(state).includes('p3')) return
    const weakest = p(state, 'p3')
      .hand.slice()
      .sort((a, b) => cardStrength(a) - cardStrength(b))
      .slice(0, 2)
    expect(applyAction(state, { type: 'EXCHANGE', playerId: 'p3', cards: weakest }).ok).toBe(false)
  })

  it('同時に受け渡し、そのあとで7を置いて7渡しになる', () => {
    let state = exchangeGame(5)
    const before = new Map(state.players.map((player) => [player.id, player.hand.slice()]))
    const gifts = new Map<string, string[]>()
    for (const id of whoMustAct(state)) {
      const view = viewFor(state, id)!
      if (view.pending?.type !== 'exchange' || !view.pending.yours) throw new Error('pending')
      const { fixed, choices, pick } = view.pending.yours
      const cards = [...fixed, ...choices.slice(0, pick)]
      gifts.set(id, cards)
      state = act(state, { type: 'EXCHANGE', playerId: id, cards })
    }
    const pending = createGame({ players: seeds(4), rng: seededRng(5), titles: titlesFor(ids(4), 'double') }).pending
    if (pending?.type !== 'exchange') throw new Error('pending')
    for (const [id, cards] of Object.entries(pending.chosen)) gifts.set(id, cards)

    expect(state.pending?.type).toBe('giveSevens')
    expect(state.log.filter((e) => e.type === 'CARDS_EXCHANGED')).toHaveLength(2)
    for (const [upper, lower] of [
      ['p0', 'p3'],
      ['p1', 'p2'],
    ] as const) {
      const expectedUpper = [...before.get(upper)!, ...gifts.get(lower)!].filter((id) => !gifts.get(upper)!.includes(id))
      const hand = p(state, upper).hand
      for (const card of expectedUpper) {
        if (Number(card.slice(1)) === RANK.START) continue // 7は場に置かれている
        expect(hand).toContain(card)
      }
      for (const card of gifts.get(upper)!) expect(p(state, lower).hand.concat(sevensOf(state, lower))).toContain(card)
    }
  })

  it('交換で他人が選んだカードは見えない', () => {
    let state = exchangeGame(5)
    const view = viewFor(state, 'p0')!
    if (view.pending?.type !== 'exchange' || !view.pending.yours) throw new Error('pending')
    const cards = view.pending.yours.choices.slice(0, 2)
    state = act(state, { type: 'EXCHANGE', playerId: 'p0', cards })
    const other = viewFor(state, 'p3')!
    expect(JSON.stringify(other.pending)).not.toContain(cards[0]!)
    expect(other.pending).toMatchObject({ type: 'exchange' })
  })
})

function sevensOf(state: GameState, id: string): string[] {
  return (['S', 'H', 'D', 'C'] as const)
    .filter((suit) => state.board[suit][RANK.START - 1]?.placedBy === id)
    .map((suit) => `${suit}${RANK.START}`)
}
