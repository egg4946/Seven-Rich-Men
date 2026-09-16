import {
  JOKER,
  RANK,
  RANK_MAX,
  RANK_MIN,
  SUITS,
  canPlace,
  cellAt,
  isJoker,
  parseCard,
  rankOf,
  removeCards,
  type Action,
  type CardId,
  type PlayerView,
  type Rank,
  type Rng,
} from '@srm/game-core'

/**
 * CPU の思考。
 *
 * 入力は GameState ではなく PlayerView。人間と同じ情報しか見ないため、他人の手札を
 * 覗くことはできない。切断したプレイヤーの代打や、時間切れ時の自動選択にもそのまま使う。
 */

export type CpuLevel = 'easy' | 'normal'

export interface CpuOptions {
  level?: CpuLevel
  /** 同点の手をばらけさせる乱数。省略時は Math.random */
  rng?: Rng
}

/** 自滅する手 */
const SUICIDE = -1000

export function decideAction(view: PlayerView, options: CpuOptions = {}): Action | null {
  const random = () => (options.rng ? options.rng.next() : Math.random())
  const me = view.you.id

  if (view.pending?.type === 'exchange') {
    const choice = view.pending.yours
    if (!choice) return null
    // 下位は同じ強さの中から、上位は手札全体から、残したくないものを渡す
    const picked = rankByKeepValue(view.you.hand)
      .filter((id) => choice.choices.includes(id))
      .slice(0, choice.pick)
    return { type: 'EXCHANGE', playerId: me, cards: [...choice.fixed, ...picked] }
  }

  if (view.pending?.type === 'giveSevens') {
    const count = view.pending.yourCount
    if (count === 0) return null
    const cards = rankByKeepValue(view.you.hand).slice(0, count)
    return { type: 'GIVE_SEVENS', playerId: me, cards }
  }

  const actions = view.legalActions
  if (actions.length === 0) return null
  if (options.level === 'easy') return actions[Math.floor(random() * actions.length)] ?? null

  let best: Action | null = null
  let bestScore = -Infinity
  for (const action of actions) {
    const score = scoreAction(view, action) + random() * 0.5
    if (score > bestScore) {
      bestScore = score
      best = action
    }
  }
  return best
}

function scoreAction(view: PlayerView, action: Action): number {
  const hand = view.you.hand
  switch (action.type) {
    case 'EXCHANGE':
    case 'GIVE_SEVENS':
      return 0
    case 'PLACE':
      return scorePlacement(view, action.card)
    case 'USE_JOKER':
      return scoreJoker(view, action.withCard)
    case 'PASS':
      // パス切れの脱落は避けたいが、自滅よりはまし
      return view.you.passesLeft > 0 ? -12 - (3 - view.you.passesLeft) * 6 : -500
    case 'DECLARE':
      // スキップは「無料のパス」。置ける手が少ない時ほど価値がある。
      return placeableCount(view) <= 1 || view.you.passesLeft <= 1 ? 30 : -5
    case 'BOMB_RANK':
      return bombValue(view, action.rank)
    case 'TEN_DISCARD': {
      const rest = removeCards(hand, [action.card])
      if (leavesOnlyJoker(rest)) return SUICIDE
      // ジョーカーは抱えるほど危ないので、少ない手札では手放す
      if (isJoker(action.card)) return hand.length <= 4 ? 20 : -3
      return -keepValue(hand, action.card)
    }
    case 'REACT': {
      if (action.effect === 'skip') return 0
      if (action.effect === 'fourStop') return placeableCount(view) <= 1 ? 10 : -10
      // ジョーカーは禁止アガリの危険があるので、手札に余裕がある時だけ奪う
      return hand.length >= 4 ? 5 + (action.effect === 'sandstorm' ? 1 : 0) : -10
    }
    case 'JOKER_TAKE':
      return action.take ? (hand.length >= 3 ? 5 : -10) : 0
  }
}

// --- 配置の評価 --------------------------------------------------------

function scorePlacement(view: PlayerView, card: CardId): number {
  const cell = parseCard(card)
  if (!cell) return SUICIDE
  const rest = removeCards(view.you.hand, [card])
  if (leavesOnlyJoker(rest)) return SUICIDE

  let score = 6 + Math.abs(cell.rank - RANK.START) * 3

  // この配置で解放されるマス
  for (const neighbor of [cell.rank - 1, cell.rank + 1]) {
    if (neighbor < RANK_MIN || neighbor > RANK_MAX) continue
    if (cellAt(view.board, cell.suit, neighbor) !== null) continue
    if (rest.includes(`${cell.suit}${neighbor}`)) score += 14
    else score -= 6 // 自分が持っていない = 誰かを助ける
  }

  switch (cell.rank) {
    case RANK.SKIP_NEXT:
      score += 6
      break
    case RANK.EIGHT_CUT:
      // 次の自分の手番が飛ぶ。置ける手が残っていれば損、無ければ無料のパス。
      score += placeableAfter(view, rest) <= 1 ? 6 : -10
      break
    case RANK.TEN_DISCARD:
      if (rest.length >= 2) score += 8
      break
    case RANK.BOMB:
      score += Math.max(...allRanks().map((rank) => bombValue(view, rank, rest))) / 2
      break
  }
  return score
}

function scoreJoker(view: PlayerView, withCard: CardId | null): number {
  const rest = removeCards(view.you.hand, withCard ? [JOKER, withCard] : [JOKER])
  if (rest.length === 0) return SUICIDE // 禁止アガリ
  // ジョーカーは抱え続けると「ジョーカーだけ」になって負ける。手札が減るほど早く使う。
  let score = -8 + Math.max(0, 8 - view.you.hand.length) * 4
  if (withCard) score += 12
  return score
}

// --- Qボンバー ----------------------------------------------------------

/**
 * 七並べでは相手の手札を減らすのは基本的に利敵行為。得をするのは
 * 「相手を空にして強制敗北させられそうなとき」と「自分の被害が小さいとき」。
 */
function bombValue(view: PlayerView, rank: Rank, hand: CardId[] = view.you.hand): number {
  const mine = hand.filter((id) => rankOf(id) === rank).length
  const rest = hand.filter((id) => rankOf(id) !== rank)
  if (mine > 0 && (rest.length === 0 || leavesOnlyJoker(rest))) return SUICIDE

  let score = -mine * 20
  const onBoard = SUITS.filter((suit) => cellAt(view.board, suit, rank) !== null).length
  const unseen = Math.max(0, 4 - onBoard - mine)
  if (unseen === 0) return score

  for (const opponent of view.opponents) {
    if (opponent.status !== 'playing') continue
    if (opponent.handCount <= 2) score += 40
    else if (opponent.handCount <= 4) score += 12
    else score -= 6
  }
  return score
}

// --- 7渡し・10捨ての評価 -----------------------------------------------

/** 手元に残したい度合い。低いものから手放す。 */
function keepValue(hand: CardId[], card: CardId): number {
  if (isJoker(card)) return hand.length >= 8 ? 4 : -4
  const rank = rankOf(card) ?? RANK.START
  let value = 10 - Math.abs(rank - RANK.START) * 2
  if (rank === RANK.BOMB) value += 8
  if (rank === RANK.TEN_DISCARD) value += 5
  if (rank === RANK.SKIP_NEXT) value += 4
  const sameRank = hand.filter((id) => rankOf(id) === rank).length
  if ((rank === RANK.FOUR_STOP || rank === RANK.ROKUROKUBI || rank === RANK.REVERSE) && sameRank >= 2) {
    value += 6
  }
  if (rank === RANK.SANDSTORM && sameRank >= 3) value += 6
  return value
}

function rankByKeepValue(hand: CardId[]): CardId[] {
  return hand.slice().sort((a, b) => keepValue(hand, a) - keepValue(hand, b))
}

// --- 補助 ----------------------------------------------------------------

function leavesOnlyJoker(hand: CardId[]): boolean {
  return hand.length === 1 && hand[0] === JOKER
}

function placeableCount(view: PlayerView): number {
  return view.you.hand.filter((id) => canPlace(view.board, id)).length
}

/** 置いた後の手札のうち、今の盤面で置けるもの(置いたカードによる解放は無視した概算) */
function placeableAfter(view: PlayerView, rest: CardId[]): number {
  return rest.filter((id) => canPlace(view.board, id)).length
}

function allRanks(): Rank[] {
  return Array.from({ length: RANK_MAX }, (_, i) => i + RANK_MIN)
}
