import { cardId, parseCard } from './cards.js'
import { RANK, RANK_MAX, RANK_MIN, type Board, type BoardCell, type CardId, type Cell, type Suit } from './types.js'

export function createEmptyBoard(): Board {
  const column = () => Array.from({ length: RANK_MAX }, (): BoardCell | null => null)
  return { S: column(), H: column(), D: column(), C: column() }
}

export function isValidRank(rank: number): boolean {
  return Number.isInteger(rank) && rank >= RANK_MIN && rank <= RANK_MAX
}

export function cellAt(board: Board, suit: Suit, rank: number): BoardCell | null {
  if (!isValidRank(rank)) return null
  return board[suit][rank - 1] ?? null
}

export function isOccupied(board: Board, cell: Cell): boolean {
  return cellAt(board, cell.suit, cell.rank) !== null
}

/**
 * そのスートで、7から途切れずに埋まっているマスの範囲(§3 隣接ルール)。
 * 飛び地は、7からの列が伸びてきて繋がるまで範囲に含まれない。7が無いスートは null。
 */
export function connectedRange(board: Board, suit: Suit): { low: number; high: number } | null {
  if (cellAt(board, suit, RANK.START) === null) return null
  let low: number = RANK.START
  while (low > RANK_MIN && cellAt(board, suit, low - 1) !== null) low--
  let high: number = RANK.START
  while (high < RANK_MAX && cellAt(board, suit, high + 1) !== null) high++
  return { low, high }
}

/**
 * 7から繋がった列の、両端のすぐ外側の空きマスか。
 * 飛び地の隣は対象外。AとKは繋がらない(トンネルなし)。
 */
export function isOpenEnd(board: Board, cell: Cell): boolean {
  if (!isValidRank(cell.rank) || isOccupied(board, cell)) return false
  const range = connectedRange(board, cell.suit)
  if (!range) return false
  return cell.rank === range.low - 1 || cell.rank === range.high + 1
}

/** 通常配置の可否。ジョーカーは通常配置できない。 */
export function canPlace(board: Board, id: CardId): boolean {
  const cell = parseCard(id)
  return cell !== null && isOpenEnd(board, cell)
}

/** マスに書き込む。隣接ルールの検査はしない。 */
export function put(board: Board, cell: Cell, value: BoardCell): void {
  if (!isValidRank(cell.rank)) return
  board[cell.suit][cell.rank - 1] = value
}

/** カードを本来のマスに置く。ジョーカーは置けないので何もしない。 */
export function putCard(board: Board, id: CardId, placedBy: string, forced: boolean): void {
  const cell = parseCard(id)
  if (cell) put(board, cell, { placedBy, forced })
}

/**
 * ジョーカーと一緒に出せるカードのマス(§6 ジョーカー)。
 * ジョーカーを置く列の端から、さらに1つ外側のマス。埋まっている・盤外なら無し。
 */
export function jokerWithCell(board: Board, jokerCell: Cell): Cell | null {
  if (!isOpenEnd(board, jokerCell)) return null
  const range = connectedRange(board, jokerCell.suit)
  if (!range) return null
  const step = jokerCell.rank === range.low - 1 ? -1 : 1
  const cell = { suit: jokerCell.suit, rank: jokerCell.rank + step }
  return isValidRank(cell.rank) && !isOccupied(board, cell) ? cell : null
}

export function cellCardId(cell: Cell): CardId {
  return cardId(cell.suit, cell.rank)
}
