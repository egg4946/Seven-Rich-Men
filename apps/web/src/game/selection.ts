import {
  JOKER,
  RANK_MAX,
  RANK_MIN,
  SUITS,
  canPlace,
  cardId,
  parseCard,
  removeCards,
  type Action,
  type Board,
  type CardId,
  type Cell,
  type PlayerView,
} from '@srm/game-core'
import { cardName } from '../ui/labels'

export type JokerUse = Extract<Action, { type: 'USE_JOKER' }>

/** 手札をどう選ばせるか */
export type SelectionMode =
  /** 選べない */
  | { type: 'none' }
  /** 自分の手番。出すカードを1枚選ぶ */
  | { type: 'turn' }
  /** 7渡し。count 枚選ぶ */
  | { type: 'give'; count: number }
  /** 10捨て。もう1枚を選ぶ */
  | { type: 'ten' }
  /**
   * カード交換。fixed は必ず渡すカード(選択済みとして見せる)、choices から pick 枚を選ぶ。
   * 上位(大富豪・富豪)は手札全部から選ぶ。
   */
  | { type: 'exchange'; role: 'upper' | 'lower'; fixed: CardId[]; choices: CardId[]; pick: number }

export function selectionMode(view: PlayerView): SelectionMode {
  if (view.phase === 'ended') return { type: 'none' }
  const pending = view.pending
  if (pending?.type === 'exchange') {
    const yours = pending.yours
    return yours && yours.pick > 0
      ? { type: 'exchange', role: yours.role, fixed: yours.fixed, choices: yours.choices, pick: yours.pick }
      : { type: 'none' }
  }
  if (pending?.type === 'giveSevens') {
    return pending.yourCount > 0 ? { type: 'give', count: pending.yourCount } : { type: 'none' }
  }
  if (pending?.type === 'tenDiscard') {
    return pending.by === view.you.id ? { type: 'ten' } : { type: 'none' }
  }
  if (!pending && view.you.status === 'playing' && view.turnPlayerId === view.you.id) {
    return { type: 'turn' }
  }
  return { type: 'none' }
}

/**
 * 視点データから「答えるべき場面」を識別するキー(game-core の decisionKey と同じ規則)。
 * これが変わったら、選択中のカードをリセットする。
 */
export function viewDecisionKey(view: PlayerView): string {
  const turns = view.log.reduce((n, e) => n + (e.type === 'TURN_STARTED' ? 1 : 0), 0)
  return `${turns}|${view.phase}|${view.pending?.type ?? 'turn'}`
}

export function leavesOnlyJoker(hand: CardId[]): boolean {
  return hand.length === 1 && hand[0] === JOKER
}

export function sameCell(a: Cell, b: Cell): boolean {
  return a.suit === b.suit && a.rank === b.rank
}

/** 7から繋がった列の端(通常配置・ジョーカーを置けるマス)のカード */
function openEndCards(board: Board): CardId[] {
  const ids: CardId[] = []
  for (const suit of SUITS) {
    for (let rank = RANK_MIN; rank <= RANK_MAX; rank++) {
      const id = cardId(suit, rank)
      if (canPlace(board, id)) ids.push(id)
    }
  }
  return ids
}

/**
 * 手札のうち、出せるカード。これ以外は暗く表示する。
 * 自分の手番以外も、今の場で出せるかを示す(手番中だけ暗くすると、ハイライトが効いたり効かなかったりに見える)。
 * 7渡し・10捨てはどのカードも選べるので null(暗くしない)。
 */
export function playableCards(view: PlayerView, mode: SelectionMode): Set<CardId> | null {
  if (mode.type === 'give' || mode.type === 'ten') return null
  // 下位の交換は、渡せる(強い順の)カード以外を暗くする
  if (mode.type === 'exchange') return mode.role === 'lower' ? new Set([...mode.fixed, ...mode.choices]) : null
  // 交換の選択待ちの間は、まだ7も置かれていないので暗くしない
  if (view.pending?.type === 'exchange') return null
  if (view.phase === 'ended' || view.you.status !== 'playing') return null

  const playable = new Set<CardId>()
  if (mode.type === 'turn') {
    for (const action of view.legalActions) {
      if (action.type === 'PLACE') playable.add(action.card)
      if (action.type === 'USE_JOKER') playable.add(JOKER)
    }
    return playable
  }

  const hand = view.you.hand
  for (const id of hand) {
    if (canPlace(view.board, id)) playable.add(id)
  }
  // 自分の手札にないカードは、対戦中の誰かが持っている(抜けた人の手札は残らない)
  if (hand.includes(JOKER) && openEndCards(view.board).some((id) => !hand.includes(id))) {
    playable.add(JOKER)
  }
  return playable
}

/**
 * ダブルクリック・上スワイプで、確かめずにそのまま出してよい操作。
 * ジョーカー(置く位置を選ぶ)や、出すと強制敗北する手は null を返し、選択して案内に回す。
 */
export function quickAction(view: PlayerView, mode: SelectionMode, card: CardId): Action | null {
  if (leavesOnlyJoker(removeCards(view.you.hand, [card]))) return null
  if (mode.type === 'turn') {
    return view.legalActions.find((a) => a.type === 'PLACE' && a.card === card) ?? null
  }
  // 10捨てで出したジョーカーはゲームから除外されるので、警告を読んでから出してもらう
  if (mode.type === 'ten' && card !== JOKER) {
    return view.legalActions.find((a) => a.type === 'TEN_DISCARD' && a.card === card) ?? null
  }
  return null
}

/** ジョーカーを置けるマス(そのマスのカード)ごとの、合法な使い方 */
export function jokerTargets(view: PlayerView): Map<CardId, JokerUse[]> {
  const groups = new Map<CardId, JokerUse[]>()
  for (const action of view.legalActions) {
    if (action.type !== 'USE_JOKER') continue
    const target = cardId(action.cell.suit, action.cell.rank)
    groups.set(target, [...(groups.get(target) ?? []), action])
  }
  return groups
}

/** 列の端だが、自分の手札のカードなのでジョーカーを置けないマス(§6 ジョーカー) */
export function jokerBlockedCards(view: PlayerView): CardId[] {
  const hand = view.you.hand
  if (!hand.includes(JOKER)) return []
  return openEndCards(view.board).filter((id) => hand.includes(id))
}

/** ジョーカーを使うと手札が0枚になる(禁止アガリ) */
export function jokerFinishes(hand: CardId[], use: JokerUse): boolean {
  return removeCards(hand, use.withCard ? [JOKER, use.withCard] : [JOKER]).length === 0
}

/** 場のマスに付ける印 */
export interface BoardMark {
  cell: Cell
  /**
   * target: 押すと出せる(置ける)マス / chosen: ジョーカーを置く位置として選んだマス /
   * with: ジョーカーと一緒に出すカードのマス / blocked: 自分の手札なのでジョーカーを置けないマス
   */
  variant: 'target' | 'chosen' | 'with' | 'blocked'
  /** 押したときの操作。ジョーカーの位置を選ぶだけのとき・押せないときは null */
  action: Action | null
  /** 出すと強制敗北する */
  danger: boolean
  /** 読み上げ用の説明 */
  label: string
}

/**
 * 選んだカードを、場のどのマスを押せば出せるか。
 * ジョーカーに一緒に出せるカードがあるときは、位置を押すと jokerCell として選ばれ、
 * 「ジョーカーだけ置く(同じマス)」と「一緒に出す(その外側のマス)」を選べるようになる。
 */
export function boardMarks(
  view: PlayerView,
  mode: SelectionMode,
  selected: CardId[],
  jokerCell: Cell | null,
): BoardMark[] {
  const card = selected[0]
  if (card === undefined || (mode.type !== 'turn' && mode.type !== 'ten')) return []
  const hand = view.you.hand

  if (card !== JOKER) {
    const cell = parseCard(card)
    const action = view.legalActions.find(
      (a) => (a.type === 'PLACE' || a.type === 'TEN_DISCARD') && a.card === card,
    )
    if (!cell || !action) return []
    return [
      {
        cell,
        variant: 'target',
        action,
        danger: leavesOnlyJoker(removeCards(hand, [card])),
        label: `${cardName(card)} を出す`,
      },
    ]
  }
  if (mode.type !== 'turn') return []

  const marks: BoardMark[] = []
  for (const [target, uses] of jokerTargets(view)) {
    const cell = parseCard(target)
    const alone = uses.find((use) => use.withCard === null)
    if (!cell || !alone) continue
    const together = uses.find((use) => use.withCard !== null)

    if (jokerCell && sameCell(jokerCell, cell)) {
      marks.push({
        cell,
        variant: 'chosen',
        action: alone,
        danger: jokerFinishes(hand, alone),
        label: `ジョーカーだけを ${cardName(target)} のマスに置く`,
      })
      const withCell = together?.withCard ? parseCard(together.withCard) : null
      if (together?.withCard && withCell) {
        marks.push({
          cell: withCell,
          variant: 'with',
          action: together,
          danger: jokerFinishes(hand, together),
          label: `ジョーカーを ${cardName(target)} のマスに置き、${cardName(together.withCard)} も一緒に出す`,
        })
      }
      continue
    }

    marks.push({
      cell,
      variant: 'target',
      action: together ? null : alone,
      danger: !together && jokerFinishes(hand, alone),
      label: `ジョーカーを ${cardName(target)} のマスに置く`,
    })
  }

  for (const id of jokerBlockedCards(view)) {
    const cell = parseCard(id)
    if (!cell) continue
    marks.push({
      cell,
      variant: 'blocked',
      action: null,
      danger: false,
      label: `${cardName(id)} は自分の手札なので、ジョーカーは置けません`,
    })
  }
  return marks
}
