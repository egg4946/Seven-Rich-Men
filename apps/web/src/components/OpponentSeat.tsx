import type { OpponentView } from '@srm/game-core'
import { useFx } from '../fx/store'
import { cx } from '../ui/cx'
import { STATUS_LABEL } from '../ui/labels'
import { Badge, STATUS_TONE } from './Badge'
import { MiniCard } from './PlayingCard'

export function OpponentSeat({ opponent, isTurn }: { opponent: OpponentView; isTurn: boolean }) {
  const out = opponent.status !== 'playing'
  // パス・出したカードなど、この人が今したことを一瞬だけ席の上に出す(内容はログと通知にもある)
  const pop = useFx((s) => s.seatPops[opponent.id])
  return (
    <article
      aria-label={`${opponent.name}${isTurn ? '(手番)' : ''}`}
      className={cx(
        'relative min-w-36 flex-1 rounded-xl border px-3 py-1.5 leading-normal shadow-sm transition-colors md:min-w-40 md:py-2',
        isTurn ? 'border-primary-500 ring-2 ring-primary-500/30' : 'border-slate-200',
        out ? 'bg-gray-50' : 'bg-white',
      )}
    >
      {isTurn && (
        <span
          aria-hidden="true"
          className="fx-turn-ring pointer-events-none absolute -inset-px rounded-xl border-2 border-primary-500"
        />
      )}
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate text-sm font-semibold text-slate-900">{opponent.name}</h3>
        {isTurn ? (
          <span key="turn" className="fx-stamp inline-flex">
            <Badge tone="accent">手番</Badge>
          </span>
        ) : out ? (
          <span key={opponent.status} className="fx-stamp inline-flex">
            <Badge tone={STATUS_TONE[opponent.status]}>{STATUS_LABEL[opponent.status]}</Badge>
          </span>
        ) : null}
      </div>

      <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-body">
        <div className="flex gap-1">
          <dt>手札</dt>
          <dd key={opponent.handCount} className="fx-bump font-semibold text-slate-900">
            {opponent.handCount}枚
          </dd>
        </div>
        <div className="flex gap-1">
          {/* スマホでは1行に収めて席を低くする */}
          <dt>
            パス<span className="max-sm:hidden">残り</span>
          </dt>
          <dd className="font-semibold text-slate-900">{opponent.passesLeft}</dd>
        </div>
        {opponent.skips > 0 && (
          <div className="flex gap-1">
            <dt>スキップ</dt>
            <dd className="font-semibold text-slate-900">{opponent.skips}</dd>
          </div>
        )}
      </dl>

      {opponent.revealed.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          <span className="sr-only">公開中のカード</span>
          {opponent.revealed.map((id) => (
            <MiniCard key={id} id={id} />
          ))}
        </div>
      )}

      {pop && (
        <span key={pop.seq} aria-hidden="true" className={cx('fx-pop', `fx-tone-${pop.tone}`)}>
          {pop.text}
        </span>
      )}
    </article>
  )
}
