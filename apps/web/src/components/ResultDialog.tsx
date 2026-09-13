import type { ReactNode } from 'react'
import type { DefeatReason, PlayerStatus, PlayerView } from '@srm/game-core'
import { cx } from '../ui/cx'
import { DEFEAT_REASON, STATUS_LABEL } from '../ui/labels'
import { Badge, STATUS_TONE } from './Badge'
import { Dialog } from './Dialog'

export function ResultDialog({
  open,
  view,
  onClose,
  actions,
}: {
  open: boolean
  view: PlayerView
  onClose: () => void
  actions: ReactNode
}) {
  const reasons = new Map<string, DefeatReason>()
  for (const event of view.log) {
    if (event.type === 'DEFEATED') reasons.set(event.playerId, event.reason)
  }
  const players = new Map<string, { name: string; status: PlayerStatus }>([
    [view.you.id, { name: view.you.name, status: view.you.status }],
    ...view.opponents.map((o) => [o.id, { name: o.name, status: o.status }] as [string, { name: string; status: PlayerStatus }]),
  ])
  const myRank = view.ranking.indexOf(view.you.id) + 1

  return (
    <Dialog
      open={open}
      title={myRank > 0 ? `あなたは ${myRank}位 でした` : '結果'}
      onClose={onClose}
      footer={actions}
    >
      <ol className="space-y-2">
        {view.ranking.map((id, index) => {
          const player = players.get(id)
          if (!player) return null
          const isYou = id === view.you.id
          const survived = player.status === 'playing'
          const reason = reasons.get(id)
          return (
            <li
              key={id}
              className={cx(
                'flex items-center gap-3 rounded-lg border px-4 py-3',
                isYou ? 'border-primary-200 bg-primary-50' : 'border-slate-200',
              )}
            >
              <span className="w-10 shrink-0 text-base font-bold text-slate-900">{index + 1}位</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-slate-900">
                  {player.name}
                  {isYou && player.name !== 'あなた' ? '(あなた)' : ''}
                </span>
                {reason && <span className="block text-xs text-slate-500">{DEFEAT_REASON[reason]}</span>}
              </span>
              <Badge tone={survived ? 'neutral' : STATUS_TONE[player.status]}>
                {survived ? '生き残り' : STATUS_LABEL[player.status]}
              </Badge>
            </li>
          )
        })}
      </ol>
    </Dialog>
  )
}
