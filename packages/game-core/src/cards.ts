import { JOKER, RANK_MAX, RANK_MIN, SUITS, type CardId, type Cell, type Rank, type Suit } from './types.js'

export function cardId(suit: Suit, rank: Rank): CardId {
  return `${suit}${rank}`
}

export function isJoker(id: CardId): boolean {
  return id === JOKER
}

/** 通常カードのマス。ジョーカーや不正なIDは null。 */
export function parseCard(id: CardId): Cell | null {
  if (isJoker(id)) return null
  const suit = id[0] as Suit
  const rank = Number(id.slice(1))
  if (!SUITS.includes(suit)) return null
  if (!Number.isInteger(rank) || rank < RANK_MIN || rank > RANK_MAX) return null
  return { suit, rank }
}

export function rankOf(id: CardId): Rank | null {
  return parseCard(id)?.rank ?? null
}

/** 53枚(52枚 + ジョーカー) */
export function fullDeck(): CardId[] {
  const deck: CardId[] = []
  for (const suit of SUITS) {
    for (let rank = RANK_MIN; rank <= RANK_MAX; rank++) deck.push(cardId(suit, rank))
  }
  deck.push(JOKER)
  return deck
}

const SUIT_ORDER: Record<Suit, number> = { S: 0, H: 1, D: 2, C: 3 }

/** スート順 → ランク順、ジョーカーは最後。元配列は変更しない。 */
export function sortCards(ids: readonly CardId[]): CardId[] {
  return ids.slice().sort((a, b) => {
    const ca = parseCard(a)
    const cb = parseCard(b)
    if (!ca) return cb ? 1 : 0
    if (!cb) return -1
    return SUIT_ORDER[ca.suit] - SUIT_ORDER[cb.suit] || ca.rank - cb.rank
  })
}

/** 手札から指定のカードを1枚ずつ取り除いた配列 */
export function removeCards(hand: readonly CardId[], cards: readonly CardId[]): CardId[] {
  const rest = hand.slice()
  for (const card of cards) {
    const i = rest.indexOf(card)
    if (i >= 0) rest.splice(i, 1)
  }
  return rest
}

/** デバッグ・ログ用の短い表記。例: ♠7, ♥Q, JOKER */
export function cardLabel(id: CardId): string {
  const cell = parseCard(id)
  if (!cell) return id
  const suits: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' }
  const ranks: Record<number, string> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }
  return `${suits[cell.suit]}${ranks[cell.rank] ?? cell.rank}`
}
