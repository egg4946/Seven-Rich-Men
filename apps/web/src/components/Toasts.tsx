import { motion } from 'motion/react'
import { useGameStore } from '../game/store'
import { cx } from '../ui/cx'
import { AlertIcon, CloseIcon, InfoIcon, SuccessIcon } from '../ui/icons'
import type { ToastTone } from '../ui/labels'

const TONE: Record<ToastTone, string> = {
  info: 'border-primary-200 bg-primary-50 text-primary-800',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  alert: 'border-amber-200 bg-amber-50 text-amber-800',
  error: 'border-red-200 bg-red-50 text-red-800',
}

function ToneIcon({ tone }: { tone: ToastTone }) {
  const base = 'h-5 w-5 shrink-0'
  if (tone === 'success') return <SuccessIcon className={cx(base, 'text-emerald-600')} />
  if (tone === 'info') return <InfoIcon className={cx(base, 'text-primary-500')} />
  return <AlertIcon className={cx(base, tone === 'error' ? 'text-red-600' : 'text-amber-600')} />
}

/** 上から落ちてきて、少し行き過ぎて止まる */
const DROP = { type: 'spring', stiffness: 520, damping: 22, mass: 0.8 } as const

/**
 * 通知。出現だけ動かし(上から落ちてきて弾む)、消えるときはすぐ DOM から外す。
 * (消えるアニメーションは、タブが裏にあると完了せず通知が溜まって画面を覆うため使わない)
 */
export function Toasts() {
  const toasts = useGameStore((s) => s.toasts)
  const dismiss = useGameStore((s) => s.dismissToast)

  return (
    <div
      aria-label="通知"
      className="pointer-events-none fixed inset-x-4 top-14 z-50 flex flex-col items-center gap-2 md:inset-x-auto md:top-16 md:right-4 md:w-96"
    >
      {toasts.map((toast, index) => (
        <motion.div
          key={toast.id}
          initial={{ opacity: 0, y: -24, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ default: DROP, opacity: { duration: 0.15 } }}
          role={toast.tone === 'error' ? 'alert' : 'status'}
          aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
          className={cx(
            'pointer-events-auto flex w-full items-center gap-3 rounded-lg border py-1.5 pr-1 pl-3 leading-normal shadow-sm',
            TONE[toast.tone],
            // スマホでは相手や場を隠さないよう最新の1件だけ出す(過去の分はログで追える)
            index < toasts.length - 1 && toast.tone !== 'error' && 'hidden md:flex',
          )}
        >
          {/* アイコンは少し遅れてぷるんと出す */}
          <span className="fx-pop-in shrink-0" style={{ animationDelay: '120ms' }}>
            <ToneIcon tone={toast.tone} />
          </span>
          <p className="flex-1 text-sm font-medium">{toast.message}</p>
          <button
            type="button"
            aria-label="閉じる"
            onClick={() => dismiss(toast.id)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg opacity-70 transition-colors hover:bg-white/60 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:outline-none"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </motion.div>
      ))}
    </div>
  )
}
