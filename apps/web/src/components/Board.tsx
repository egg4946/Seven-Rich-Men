import { Fragment, useEffect, useRef } from 'react'
import { SUITS, cardId, cellAt, type Board as BoardState, type Suit } from '@srm/game-core'
import { sameCell, type BoardMark } from '../game/selection'
import { cx } from '../ui/cx'
import { RANKS, SUIT_NAME, SUIT_SYMBOL, isRedSuit, rankLabel } from '../ui/labels'
import { BoardCard, type BoardEnter } from './PlayingCard'

const MARK_STYLE: Record<BoardMark['variant'], string> = {
  target: 'border-2 border-primary-500 bg-primary-50 text-primary-700 hover:bg-primary-100',
  chosen: 'border-2 border-primary-500 bg-primary-500 text-white hover:bg-primary-600',
  with: 'border-2 border-dashed border-primary-500 bg-white text-primary-700 hover:bg-primary-50',
  blocked: 'border border-dashed border-slate-300 bg-slate-100 text-slate-400',
}

const DANGER_STYLE = 'border-2 border-red-500 bg-red-50 text-red-700 hover:bg-red-100'

/**
 * 場(4スート × 13ランク)。
 * カードを選ぶと、出せるマスに印が付き、押すとそこに出せる(出すボタン・ダブルクリック・上スワイプと同じ操作)。
 * 印の無いマスは表示専用。375px 幅でも13列が横スクロールなしで収まるよう、モバイルは余白を詰める。
 */
export function Board({
  board,
  marks,
  onMark,
}: {
  board: BoardState
  marks: BoardMark[]
  onMark: (mark: BoardMark) => void
}) {
  // 前に描いた場。新しく置かれたカードだけ着地の演出をする
  const previous = useRef<BoardState | null>(null)
  useEffect(() => {
    previous.current = board
  }, [board])
  const before = previous.current
  // Qボンバーや脱落で同時に置かれたカードは、少しずつずらして着地させる(最初の表示は配るように速く)
  let landed = 0
  const enterOf = (suit: Suit, rank: number): BoardEnter | null => {
    if (before && cellAt(before, suit, rank) !== null) return null
    return { delay: Math.min(landed++ * (before ? 0.07 : 0.035), 0.9), ring: before !== null }
  }

  return (
    <div className="grid grid-cols-[1rem_repeat(13,minmax(0,1fr))] gap-0.5 sm:grid-cols-[1.25rem_repeat(13,minmax(0,1fr))] sm:gap-1 md:grid-cols-[2rem_repeat(13,minmax(0,1fr))] md:gap-1.5">
      <span aria-hidden="true" />
      {RANKS.map((rank) => (
        <span key={rank} aria-hidden="true" className="text-center text-xxs leading-normal text-slate-500 md:text-xs">
          {rankLabel(rank)}
        </span>
      ))}

      {SUITS.map((suit) => {
        const placed = RANKS.filter((rank) => cellAt(board, suit, rank) !== null)
        return (
          <Fragment key={suit}>
            <span
              className={cx(
                'flex items-center justify-center text-sm md:text-lg',
                isRedSuit(suit) ? 'text-red-600' : 'text-slate-900',
              )}
            >
              <span aria-hidden="true">{SUIT_SYMBOL[suit]}</span>
              <span className="sr-only">
                {SUIT_NAME[suit]}:
                {placed.length > 0 ? `${placed.map(rankLabel).join('、')} が場にあります` : '場にカードはありません'}
              </span>
            </span>

            {RANKS.map((rank) => {
              const cell = cellAt(board, suit, rank)
              const mark = cell ? undefined : marks.find((m) => sameCell(m.cell, { suit, rank }))
              const pressable = mark && mark.variant !== 'blocked'
              const markClass = cx(
                'flex h-full w-full items-center justify-center rounded-md text-xs font-semibold leading-none',
                mark ? (mark.danger ? DANGER_STYLE : MARK_STYLE[mark.variant]) : 'border border-dashed border-slate-200',
                pressable &&
                  'cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:outline-none',
              )
              return (
                <div key={rank} aria-hidden={pressable ? undefined : true} className="h-8 sm:h-9 md:h-14">
                  {cell ? (
                    <BoardCard
                      id={cardId(suit, rank)}
                      forced={cell.forced}
                      joker={cell.joker}
                      enter={enterOf(suit, rank)}
                    />
                  ) : pressable ? (
                    <button type="button" aria-label={mark.label} onClick={() => onMark(mark)} className={markClass}>
                      {mark.variant === 'chosen' ? 'JK' : rankLabel(rank)}
                    </button>
                  ) : (
                    <span title={mark?.label} className={markClass}>
                      {mark ? rankLabel(rank) : ''}
                    </span>
                  )}
                </div>
              )
            })}
          </Fragment>
        )
      })}
    </div>
  )
}
