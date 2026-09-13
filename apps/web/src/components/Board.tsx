import { Fragment } from 'react'
import { SUITS, cardId, cellAt, parseCard, type Board as BoardState, type CardId } from '@srm/game-core'
import { cx } from '../ui/cx'
import { RANKS, SUIT_NAME, SUIT_SYMBOL, isRedSuit, rankLabel } from '../ui/labels'
import { BoardCard } from './PlayingCard'

/**
 * 場(4スート × 13ランク)。表示専用で、操作は手札とパネルで行う。
 * 小さいマスをタップさせないことで、モバイルでも 44px のタップ領域の規則を守る。
 * 375px 幅でも13列が横スクロールなしで収まるよう、モバイルは余白を詰める。
 */
export function Board({ board, highlight }: { board: BoardState; highlight: CardId | null }) {
  const target = highlight ? parseCard(highlight) : null

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
              const isTarget = target?.suit === suit && target.rank === rank
              return (
                <div key={rank} aria-hidden="true" className="h-8 sm:h-9 md:h-14">
                  {cell ? (
                    <BoardCard id={cardId(suit, rank)} forced={cell.forced} joker={cell.joker} />
                  ) : (
                    <span
                      className={cx(
                        'flex h-full w-full items-center justify-center rounded-md text-xs font-semibold leading-none',
                        isTarget
                          ? 'border-2 border-primary-500 bg-primary-50 text-primary-700'
                          : 'border border-dashed border-slate-200',
                      )}
                    >
                      {isTarget ? rankLabel(rank) : ''}
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
