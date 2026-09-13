import { motion } from 'motion/react'
import { parseCard, type CardId } from '@srm/game-core'
import { cx } from '../ui/cx'
import { RANK_EFFECT_SHORT, SUIT_SYMBOL, cardName, isRedSuit, rankLabel } from '../ui/labels'

/** カードが手札から場へ動く時間。melta の上限 300ms 以内 */
const MOVE = { duration: 0.25, ease: [0, 0, 0.2, 1] } as const

function colorOf(id: CardId): string {
  const cell = parseCard(id)
  if (!cell) return 'text-primary-600'
  return isRedSuit(cell.suit) ? 'text-red-600' : 'text-slate-900'
}

/** 手札のカード。場の同じカードと layoutId を共有し、出したときに場へ移動して見える */
export function HandCard({
  id,
  selected,
  muted,
  revealed,
  onClick,
}: {
  id: CardId
  selected: boolean
  muted: boolean
  revealed: boolean
  onClick?: () => void
}) {
  const cell = parseCard(id)
  const color = colorOf(id)
  const label = [cardName(id), revealed && '公開中', muted && '今は出せません'].filter(Boolean).join('、')
  const className = cx(
    'relative flex h-16 w-11 shrink-0 flex-col justify-between rounded-lg border bg-white p-1 text-left leading-none shadow-sm transition-colors md:h-20 md:w-14 md:p-1.5',
    selected ? 'border-primary-500 ring-2 ring-primary-500' : 'border-slate-200',
    muted && 'opacity-55',
    onClick && 'hover:border-slate-300 focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:outline-none',
  )

  const face = (
    <>
      {/* text-* は行間も持つので、カードの高さに収めるため各行で leading-none を明示する */}
      <span className={cx('shrink-0 text-sm leading-none font-semibold md:text-base md:leading-none', color)}>
        {cell ? rankLabel(cell.rank) : 'JK'}
      </span>
      <span
        aria-hidden="true"
        className={cx('shrink-0 self-center text-xl leading-none md:text-2xl md:leading-none', color)}
      >
        {cell ? SUIT_SYMBOL[cell.suit] : '★'}
      </span>
      <span
        aria-hidden="true"
        className="-mx-1 shrink-0 truncate text-center text-xxs leading-none tracking-normal text-slate-500"
      >
        {cell ? (RANK_EFFECT_SHORT[cell.rank] ?? '') : ''}
      </span>
      {revealed && (
        <span
          aria-hidden="true"
          className="absolute -top-2 right-0 rounded-full border border-slate-200 bg-white px-1 text-xxs leading-normal text-slate-700"
        >
          公開
        </span>
      )}
    </>
  )

  if (!onClick) {
    return (
      <motion.div layoutId={`card-${id}`} transition={MOVE} role="img" aria-label={label} className={className}>
        {face}
      </motion.div>
    )
  }

  return (
    <motion.button
      type="button"
      layoutId={`card-${id}`}
      transition={MOVE}
      animate={{ y: selected ? -8 : 0 }}
      aria-pressed={selected}
      aria-label={label}
      onClick={onClick}
      className={className}
    >
      {face}
    </motion.button>
  )
}

/** 場のマスに置かれたカード */
export function BoardCard({ id, forced, joker }: { id: CardId; forced: boolean; joker?: boolean }) {
  const cell = parseCard(id)
  return (
    <motion.div
      layoutId={joker ? undefined : `card-${id}`}
      transition={MOVE}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cx(
        'flex h-full w-full flex-col items-center justify-center rounded-md border leading-none',
        joker
          ? 'border-primary-300 bg-primary-50 text-primary-700'
          : forced
            ? cx('border-slate-300 bg-slate-50', colorOf(id))
            : cx('border-slate-200 bg-white shadow-sm', colorOf(id)),
      )}
    >
      <span className="text-xs font-semibold md:text-sm">{joker ? 'JK' : cell ? rankLabel(cell.rank) : ''}</span>
      {!joker && cell && (
        <span aria-hidden="true" className="mt-0.5 hidden text-xs md:block">
          {SUIT_SYMBOL[cell.suit]}
        </span>
      )}
    </motion.div>
  )
}

/** 相手の公開中のカード */
export function MiniCard({ id }: { id: CardId }) {
  return (
    <span
      className={cx(
        'inline-flex h-6 min-w-8 items-center justify-center rounded border border-slate-200 bg-white px-1 text-xs font-semibold leading-none',
        colorOf(id),
      )}
    >
      {cardName(id)}
    </span>
  )
}
