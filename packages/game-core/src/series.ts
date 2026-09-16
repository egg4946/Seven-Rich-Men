import { isJoker, rankOf } from './cards.js'
import type { CardId, ExchangePair, FourPlayerExchange, PlayerId, Title } from './types.js'

/**
 * ラウンド制(docs/RULES.md §9)。
 * 1ラウンド = 1つの GameState。ラウンドをまたぐ情報(ポイント・前回の順位)はここで持つ。
 */

export type RoundCount = 1 | 3 | 5 | 'endless'
export type Seating = 'fixed' | 'random'

export interface SeriesRules {
  rounds: RoundCount
  /** 席順。シングル(rounds: 1)では使わない */
  seating: Seating
  /** 4人戦の交換。4人戦以外では使わない */
  fourPlayerExchange: FourPlayerExchange
}

export const DEFAULT_SERIES_RULES: SeriesRules = { rounds: 1, seating: 'fixed', fourPlayerExchange: 'double' }

export interface Series {
  rules: SeriesRules
  /** 今の(終わっていれば直前の)ラウンド。1から数える */
  round: number
  /** 結果を記録し終えたラウンドの数 */
  completed: number
  scores: Record<PlayerId, number>
  /** 直前に終わったラウンドの順位。次のラウンドの身分を決める */
  lastRanking: PlayerId[] | null
  /** 全ラウンドが終わった(エンドレスはホストが終了した) */
  finished: boolean
}

// --- カードの強さ(§9-2) -------------------------------------------------

/** 強い順。ジョーカーはこの上 */
const STRENGTH_ORDER = [7, 8, 6, 9, 5, 10, 4, 3, 11, 12, 2, 13, 1]

/** 大きいほど強い。ジョーカーが最強 */
export function cardStrength(id: CardId): number {
  if (isJoker(id)) return STRENGTH_ORDER.length + 1
  const index = STRENGTH_ORDER.indexOf(rankOf(id) ?? 0)
  return index < 0 ? 0 : STRENGTH_ORDER.length - index
}

/**
 * 強い順に count 枚渡すときの選び方。
 * fixed は必ず渡すカード。choices は同じ強さのカードで、その中から pick 枚を本人が選ぶ。
 */
export function tributeOptions(
  hand: readonly CardId[],
  count: number,
): { fixed: CardId[]; choices: CardId[]; pick: number } {
  const sorted = hand.slice().sort((a, b) => cardStrength(b) - cardStrength(a))
  const last = sorted[Math.min(count, sorted.length) - 1]
  if (last === undefined) return { fixed: [], choices: [], pick: 0 }
  const threshold = cardStrength(last)
  const fixed = sorted.filter((id) => cardStrength(id) > threshold)
  const choices = sorted.filter((id) => cardStrength(id) === threshold)
  const pick = Math.min(count, sorted.length) - fixed.length
  // 同じ強さのカードを全部渡すなら、選ぶ余地はない
  if (choices.length === pick) return { fixed: [...fixed, ...choices], choices: [], pick: 0 }
  return { fixed, choices, pick }
}

/** 選んだカードが「強い順に count 枚」になっているか */
export function isValidTribute(hand: readonly CardId[], count: number, cards: readonly CardId[]): boolean {
  if (cards.length !== count || new Set(cards).size !== cards.length) return false
  const { fixed, choices } = tributeOptions(hand, count)
  return fixed.every((id) => cards.includes(id)) && cards.every((id) => fixed.includes(id) || choices.includes(id))
}

// --- 身分とポイント(§9-1, §9-3) -----------------------------------------

const TITLE_TABLE: Record<number, Title[]> = {
  3: ['fugo', 'heimin', 'hinmin'],
  4: ['daifugo', 'fugo', 'hinmin', 'daihinmin'],
  5: ['daifugo', 'fugo', 'heimin', 'hinmin', 'daihinmin'],
  6: ['daifugo', 'fugo', 'heimin', 'heimin', 'hinmin', 'daihinmin'],
}
const FOUR_SINGLE: Title[] = ['fugo', 'heimin', 'heimin', 'hinmin']

/** 順位(上位から)から身分を決める */
export function titlesFor(ranking: readonly PlayerId[], fourPlayerExchange: FourPlayerExchange): Record<PlayerId, Title> {
  const table =
    ranking.length === 4 && fourPlayerExchange === 'single' ? FOUR_SINGLE : (TITLE_TABLE[ranking.length] ?? [])
  const titles: Record<PlayerId, Title> = {}
  ranking.forEach((id, i) => {
    titles[id] = table[i] ?? 'heimin'
  })
  return titles
}

/** 大富豪↔大貧民は2枚、富豪↔貧民は1枚 */
export function exchangePairs(titles: Record<PlayerId, Title>): ExchangePair[] {
  const holder = (title: Title) => Object.keys(titles).find((id) => titles[id] === title)
  const pairs: ExchangePair[] = []
  const add = (upper: Title, lower: Title, count: number) => {
    const u = holder(upper)
    const l = holder(lower)
    if (u && l) pairs.push({ upper: u, lower: l, count })
  }
  add('daifugo', 'daihinmin', 2)
  add('fugo', 'hinmin', 1)
  return pairs
}

/** n人戦なら 1位 n−1点 … 最下位 0点 */
export function roundPoints(ranking: readonly PlayerId[]): Record<PlayerId, number> {
  const points: Record<PlayerId, number> = {}
  ranking.forEach((id, i) => {
    points[id] = ranking.length - 1 - i
  })
  return points
}

// --- 進行 ----------------------------------------------------------------

export function startSeries(rules: SeriesRules, playerIds: readonly PlayerId[]): Series {
  return {
    rules: { ...rules },
    round: 1,
    completed: 0,
    scores: Object.fromEntries(playerIds.map((id) => [id, 0])),
    lastRanking: null,
    finished: false,
  }
}

/** ラウンドの結果を記録する。同じラウンドを二重に記録しない */
export function recordRound(series: Series, ranking: readonly PlayerId[]): Series {
  if (series.finished || series.completed >= series.round) return series
  const points = roundPoints(ranking)
  const scores = { ...series.scores }
  for (const id of ranking) scores[id] = (scores[id] ?? 0) + (points[id] ?? 0)
  const { rounds } = series.rules
  return {
    ...series,
    completed: series.round,
    scores,
    lastRanking: ranking.slice(),
    finished: rounds !== 'endless' && series.round >= rounds,
  }
}

/** 次のラウンドへ進めるか(今のラウンドの結果を記録済みで、まだ終わっていない) */
export function canStartNextRound(series: Series): boolean {
  return !series.finished && series.completed >= series.round
}

export function nextRound(series: Series): Series {
  if (!canStartNextRound(series)) return series
  return { ...series, round: series.round + 1 }
}

/** エンドレスをここで終える(ラウンドの合間だけ) */
export function endSeries(series: Series): Series {
  if (series.finished || series.completed < series.round) return series
  return { ...series, finished: true }
}

/** 今のラウンドの身分。1ラウンド目は null */
export function seriesTitles(series: Series): Record<PlayerId, Title> | null {
  return series.lastRanking ? titlesFor(series.lastRanking, series.rules.fourPlayerExchange) : null
}

/** ポイントの多い順。同点なら直前のラウンドの順位が上の人を上にする */
export function standings(series: Series): PlayerId[] {
  const last = series.lastRanking ?? []
  const lastRank = (id: PlayerId) => {
    const i = last.indexOf(id)
    return i < 0 ? last.length : i
  }
  return Object.keys(series.scores).sort(
    (a, b) => (series.scores[b] ?? 0) - (series.scores[a] ?? 0) || lastRank(a) - lastRank(b),
  )
}
