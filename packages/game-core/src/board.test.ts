import { describe, expect, it } from 'vitest'
import { canPlace, connectedRange, createEmptyBoard, jokerWithCell, putCard } from './board.js'
import { RANK_MAX, RANK_MIN, type Board, type CardId, type Suit } from './types.js'

function boardWith(placed: CardId[], forced: CardId[] = []): Board {
  const board = createEmptyBoard()
  for (const id of placed) putCard(board, id, 'x', false)
  for (const id of forced) putCard(board, id, 'x', true)
  return board
}

function placeable(board: Board, suit: Suit): CardId[] {
  const ids: CardId[] = []
  for (let rank = RANK_MIN; rank <= RANK_MAX; rank++) {
    if (canPlace(board, `${suit}${rank}`)) ids.push(`${suit}${rank}`)
  }
  return ids
}

describe('通常配置は、7から繋がった列の両端だけ', () => {
  it('7・8・9・K が場にあるとき、出せるのは6と10だけ', () => {
    const board = boardWith(['S7', 'S8', 'S9'], ['S13'])
    expect(placeable(board, 'S')).toEqual(['S6', 'S10'])
  })

  it('飛び地の隣には出せない', () => {
    const board = boardWith(['S7'], ['S3'])
    expect(canPlace(board, 'S2')).toBe(false)
    expect(canPlace(board, 'S4')).toBe(false)
    expect(placeable(board, 'S')).toEqual(['S6', 'S8'])
  })

  it('列が飛び地まで伸びると、飛び地も列の一部になる', () => {
    const board = boardWith(['S7', 'S8', 'S9', 'S10', 'S11'], ['S13'])
    expect(placeable(board, 'S')).toEqual(['S6', 'S12'])
    putCard(board, 'S12', 'x', false)
    expect(connectedRange(board, 'S')).toEqual({ low: 7, high: 13 })
    expect(placeable(board, 'S')).toEqual(['S6'])
  })

  it('AとKは繋がらない(トンネルなし)', () => {
    const board = boardWith(['H7', 'H8', 'H9', 'H10', 'H11', 'H12', 'H13'])
    expect(canPlace(board, 'H1')).toBe(false)
    expect(placeable(board, 'H')).toEqual(['H6'])
  })

  it('別のスートには影響しない', () => {
    const board = boardWith(['S7', 'S8', 'H7'])
    expect(placeable(board, 'H')).toEqual(['H6', 'H8'])
  })

  it('7が場に無いスートには出せない', () => {
    const board = boardWith(['D6'])
    expect(placeable(board, 'D')).toEqual([])
  })
})

describe('ジョーカーと一緒に出すカードのマス', () => {
  it('ジョーカーを置く列の端から、さらに外側のマス', () => {
    const board = boardWith(['S5', 'S6', 'S7'])
    expect(jokerWithCell(board, { suit: 'S', rank: 4 })).toEqual({ suit: 'S', rank: 3 })
    expect(jokerWithCell(board, { suit: 'S', rank: 8 })).toEqual({ suit: 'S', rank: 9 })
  })

  it('外側が埋まっていれば一緒に出せない', () => {
    const board = boardWith(['S5', 'S6', 'S7'], ['S3'])
    expect(jokerWithCell(board, { suit: 'S', rank: 4 })).toBeNull()
  })

  it('Aの外側は無い', () => {
    const board = boardWith(['S2', 'S3', 'S4', 'S5', 'S6', 'S7'])
    expect(jokerWithCell(board, { suit: 'S', rank: 1 })).toBeNull()
  })

  it('列の端でないマスは対象外', () => {
    const board = boardWith(['S7'], ['S3'])
    expect(jokerWithCell(board, { suit: 'S', rank: 4 })).toBeNull()
  })
})
