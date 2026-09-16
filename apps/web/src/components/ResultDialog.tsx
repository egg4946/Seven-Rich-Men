import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { roundPoints, titlesFor, type DefeatReason, type PlayerStatus, type PlayerView } from '@srm/game-core'
import type { SeriesView } from '@srm/protocol'
import { particleCount, useFx } from '../fx/store'
import { cx } from '../ui/cx'
import { DEFEAT_REASON, STATUS_LABEL, TITLE_LABEL } from '../ui/labels'
import { Badge, STATUS_TONE, TITLE_TONE } from './Badge'
import { Dialog } from './Dialog'
import { Particles } from './fx/Particles'

export function ResultDialog({
  open,
  view,
  series,
  onClose,
  actions,
}: {
  open: boolean
  view: PlayerView
  /** ラウンド制の進み具合。シングルでは結果にポイントを出さない */
  series: SeriesView | null
  onClose: () => void
  actions: ReactNode
}) {
  const level = useFx((s) => s.level)
  const reasons = new Map<string, DefeatReason>()
  for (const event of view.log) {
    if (event.type === 'DEFEATED') reasons.set(event.playerId, event.reason)
  }
  const players = new Map<string, { name: string; status: PlayerStatus }>([
    [view.you.id, { name: view.you.name, status: view.you.status }],
    ...view.opponents.map((o) => [o.id, { name: o.name, status: o.status }] as [string, { name: string; status: PlayerStatus }]),
  ])
  const displayName = (id: string) => {
    const name = players.get(id)?.name ?? id
    return id === view.you.id && name !== 'あなた' ? `${name}(あなた)` : name
  }
  const myRank = view.ranking.indexOf(view.you.id) + 1

  // ラウンド制で、このラウンドの結果が記録済みのときだけポイントを出す
  const multiRound = !!series && series.rules.rounds !== 1 && series.completed === series.round
  const points = roundPoints(view.ranking)
  const nextTitles = multiRound && !series.finished ? titlesFor(view.ranking, series.rules.fourPlayerExchange) : null
  const winner = multiRound && series.finished ? (series.standings[0] ?? null) : null

  let title = myRank > 0 ? `あなたは ${myRank}位 でした` : '結果'
  if (winner) title = winner === view.you.id ? 'あなたの優勝です!' : `優勝は ${displayName(winner)}`
  else if (multiRound) title = `ラウンド${series.round}:あなたは ${myRank}位`
  const celebrate = winner ? winner === view.you.id : myRank === 1

  return (
    <>
      <Dialog open={open} title={title} onClose={onClose} footer={actions}>
        {multiRound && (
          <h3 className="mb-2 text-sm font-semibold text-slate-900">
            {series.finished ? `ラウンド${series.round}(最終ラウンド)の順位` : 'このラウンドの順位'}
          </h3>
        )}
        <ol className="space-y-2">
          {view.ranking.map((id, index) => {
            const player = players.get(id)
            if (!player) return null
            const isYou = id === view.you.id
            const survived = player.status === 'playing'
            const reason = reasons.get(id)
            const nextTitle = nextTitles?.[id]
            return (
              <li
                key={id}
                // 1位から順に少しずつずらして出す
                style={{ animationDelay: `${120 + index * 90}ms` }}
                className={cx(
                  'fx-rise flex items-center gap-3 rounded-lg border px-4 py-3',
                  isYou ? 'border-primary-200 bg-primary-50' : 'border-slate-200',
                )}
              >
                <span
                  className={cx('w-10 shrink-0 text-base font-bold', index === 0 ? 'fx-gold-text' : 'text-slate-900')}
                >
                  {index + 1}位
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-900">{displayName(id)}</span>
                  {reason && <span className="block text-xs text-slate-500">{DEFEAT_REASON[reason]}</span>}
                  {nextTitle && (
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                      次のラウンド:
                      <Badge tone={TITLE_TONE[nextTitle]} className="px-2 py-0">
                        {TITLE_LABEL[nextTitle]}
                      </Badge>
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <Badge tone={survived ? 'neutral' : STATUS_TONE[player.status]}>
                    {survived ? '生き残り' : STATUS_LABEL[player.status]}
                  </Badge>
                  {multiRound && <span className="text-xs font-semibold text-slate-700">+{points[id] ?? 0}点</span>}
                </span>
              </li>
            )
          })}
        </ol>

        {multiRound && (
          <section aria-labelledby="standings-heading" className="mt-5">
            <h3 id="standings-heading" className="mb-2 text-sm font-semibold text-slate-900">
              {series.finished ? '最終結果(合計ポイント)' : '合計ポイント'}
            </h3>
            <ol className="divide-y divide-slate-200 rounded-lg border border-slate-200">
              {series.standings.map((id, index) => (
                <li
                  key={id}
                  className={cx(
                    'flex items-center gap-3 px-4 py-2 text-sm',
                    id === view.you.id && 'bg-primary-50',
                  )}
                >
                  <span className={cx('w-10 shrink-0 font-bold', index === 0 ? 'fx-gold-text' : 'text-slate-900')}>
                    {index + 1}位
                  </span>
                  <span className="min-w-0 flex-1 truncate text-slate-900">{displayName(id)}</span>
                  <span className="shrink-0 font-semibold text-slate-900">{series.scores[id] ?? 0}点</span>
                </li>
              ))}
            </ol>
            {!series.finished && (
              <p className="mt-2 text-xs text-slate-500">
                {series.rules.rounds === 'endless'
                  ? '終了した時点の合計ポイントで優勝が決まります。'
                  : `全${series.rules.rounds}ラウンドの合計ポイントで優勝が決まります。同点なら最後のラウンドの順位で決めます。`}
              </p>
            )}
          </section>
        )}
      </Dialog>
      {open &&
        celebrate &&
        createPortal(
          <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-1/3 z-[60]">
            <Particles variant="confetti" count={particleCount(48, level)} />
          </div>,
          document.body,
        )}
    </>
  )
}
