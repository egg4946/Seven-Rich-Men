import type { OpponentView } from '@srm/game-core'
import { cx } from '../ui/cx'
import { STATUS_LABEL } from '../ui/labels'
import { Badge, STATUS_TONE } from './Badge'
import { MiniCard } from './PlayingCard'

export function OpponentSeat({ opponent, isTurn }: { opponent: OpponentView; isTurn: boolean }) {
  const out = opponent.status !== 'playing'
  return (
    <article
      aria-label={`${opponent.name}${isTurn ? '(手番)' : ''}`}
      className={cx(
        'min-w-36 flex-1 rounded-xl border px-3 py-1.5 leading-normal shadow-sm transition-colors md:min-w-40 md:py-2',
        isTurn ? 'border-primary-500 ring-2 ring-primary-500/30' : 'border-slate-200',
        out ? 'bg-gray-50' : 'bg-white',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate text-sm font-semibold text-slate-900">{opponent.name}</h3>
        {isTurn ? (
          <Badge tone="accent">手番</Badge>
        ) : out ? (
          <Badge tone={STATUS_TONE[opponent.status]}>{STATUS_LABEL[opponent.status]}</Badge>
        ) : null}
      </div>

      <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-body">
        <div className="flex gap-1">
          <dt>手札</dt>
          <dd className="font-semibold text-slate-900">{opponent.handCount}枚</dd>
        </div>
        <div className="flex gap-1">
          <dt>パス残り</dt>
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
    </article>
  )
}
