import type { DefeatReason, GameState } from '@srm/game-core'
import { HUMAN_ID } from '../game/controller'
import { cx } from '../ui/cx'
import { DEFEAT_REASON, STATUS_LABEL } from '../ui/labels'
import { Badge, STATUS_TONE } from './Badge'
import { Button } from './Button'
import { Dialog } from './Dialog'

export function ResultDialog({
  open,
  game,
  onClose,
  onRematch,
  onLeave,
}: {
  open: boolean
  game: GameState
  onClose: () => void
  onRematch: () => void
  onLeave: () => void
}) {
  const reasons = new Map<string, DefeatReason>()
  for (const event of game.log) {
    if (event.type === 'DEFEATED') reasons.set(event.playerId, event.reason)
  }
  const myRank = game.ranking.indexOf(HUMAN_ID) + 1

  return (
    <Dialog
      open={open}
      title={myRank > 0 ? `あなたは ${myRank}位 でした` : '結果'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onLeave}>
            タイトルに戻る
          </Button>
          <Button onClick={onRematch}>もう一度遊ぶ</Button>
        </>
      }
    >
      <ol className="space-y-2">
        {game.ranking.map((id, index) => {
          const player = game.players.find((p) => p.id === id)
          if (!player) return null
          const survived = player.status === 'playing'
          const reason = reasons.get(id)
          return (
            <li
              key={id}
              className={cx(
                'flex items-center gap-3 rounded-lg border px-4 py-3',
                id === HUMAN_ID ? 'border-primary-200 bg-primary-50' : 'border-slate-200',
              )}
            >
              <span className="w-10 shrink-0 text-base font-bold text-slate-900">{index + 1}位</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-slate-900">
                  {player.name}
                  {id === HUMAN_ID && player.name !== 'あなた' ? '(あなた)' : ''}
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
