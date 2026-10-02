import { motion } from 'motion/react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '../ui/cx'
import { CloseIcon } from '../ui/icons'

const SIZE = {
  sm: 'md:max-w-sm',
  md: 'md:max-w-lg',
  lg: 'md:max-w-2xl',
} as const

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const FADE = { duration: 0.2, ease: [0, 0, 0.2, 1] } as const
/** パネルは下から出て、軽く弾んで止まる */
const POP = { type: 'spring', stiffness: 480, damping: 30, mass: 0.8 } as const

/**
 * melta UI Modal。閉じるボタン・Esc・オーバーレイの3経路で閉じられ、フォーカスをトラップし、
 * 閉じたら元の要素にフォーカスを戻す。ゲーム進行に必要な選択には使わない(DecisionPanel を使う)。
 */
export function Dialog({
  open,
  title,
  onClose,
  footer,
  size = 'md',
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  footer?: ReactNode
  size?: keyof typeof SIZE
  children: ReactNode
}) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)

  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusables = () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
    focusables()[0]?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <>
      <motion.div
        aria-hidden="true"
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={FADE}
      />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-4">
        <motion.div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ default: POP, opacity: FADE }}
          className={cx(
            'pointer-events-auto flex max-h-[90dvh] w-full flex-col rounded-t-xl bg-white leading-normal shadow-xl md:rounded-xl',
            SIZE[size],
          )}
        >
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 py-2 pr-2 pl-6">
            <h2 id={titleId} className="text-lg font-semibold text-slate-900">
              {title}
            </h2>
            <button
              type="button"
              aria-label="閉じる"
              onClick={onClose}
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-gray-50 hover:text-body focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:outline-none"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
          <div className="overflow-y-auto px-6 py-4 text-sm text-body">{children}</div>
          {footer && (
            <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 px-6 py-4">{footer}</div>
          )}
        </motion.div>
      </div>
    </>,
    document.body,
  )
}
