import type { GameEvent } from '@srm/game-core'
import { cx } from '../ui/cx'
import { describeEvent, type NameOf } from '../ui/labels'

/** 通知を見逃しても追えるように、すべての出来事を新しい順に残す */
export function LogPanel({ log, nameOf, className }: { log: GameEvent[]; nameOf: NameOf; className?: string }) {
  const lines = log
    .map((event, index) => ({ index, text: describeEvent(event, nameOf) }))
    .filter((line): line is { index: number; text: string } => line.text !== null)
    .reverse()
    .slice(0, 120)

  return (
    <ol aria-label="ログ(新しい順)" className={cx('space-y-1 overflow-y-auto text-sm leading-normal text-body', className)}>
      {lines.map((line) => (
        <li key={line.index}>{line.text}</li>
      ))}
    </ol>
  )
}
