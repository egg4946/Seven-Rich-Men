import { useGameStore } from '../game/store'
import { cx } from '../ui/cx'

/** 雀魂式の制限時間。基本時間は primary、持ち時間に入ったら amber + 文字で示す */
export function TimerBar() {
  const timer = useGameStore((s) => s.timer)
  const now = useGameStore((s) => s.now)
  const reserve = useGameStore((s) => s.reserveLeftMs)
  if (!timer) return null

  const elapsed = Math.max(0, now - timer.startedAt)
  const baseLeft = Math.max(0, timer.baseMs - elapsed)
  const reserveLeft = Math.max(0, reserve - Math.max(0, elapsed - timer.baseMs))
  const inReserve = baseLeft === 0
  const ratio = inReserve ? (reserve > 0 ? reserveLeft / reserve : 0) : baseLeft / Math.max(1, timer.baseMs)
  const seconds = Math.ceil((inReserve ? reserveLeft : baseLeft) / 1000)

  return (
    <div className="flex items-center gap-3">
      <div
        role="progressbar"
        aria-label="制限時間"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
        className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200"
      >
        <div
          className={cx('h-full rounded-full', inReserve ? 'bg-amber-500' : 'bg-primary-500')}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <p className="shrink-0 text-xs tabular-nums text-body">
        {inReserve ? (
          <>
            持ち時間 <span className="font-semibold text-amber-700">{seconds}秒</span>
          </>
        ) : (
          <>
            残り <span className="font-semibold text-slate-900">{seconds}秒</span>
            <span className="text-slate-500"> + 持ち時間 {Math.ceil(reserve / 1000)}秒</span>
          </>
        )}
      </p>
    </div>
  )
}
