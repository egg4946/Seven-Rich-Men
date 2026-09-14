import { useMemo, type CSSProperties } from 'react'
import { cx } from '../../ui/cx'

const COLORS = ['#2b70ef', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#facc15']

/**
 * 紙吹雪・火花。CSS アニメーション(transform / opacity)だけで動かし、JS は毎フレーム動かない。
 * 数は呼ぶ側で particleCount() を通して、端末と演出設定に合わせる。
 */
export function Particles({
  count,
  variant,
  className,
}: {
  count: number
  variant: 'confetti' | 'spark'
  className?: string
}) {
  const items = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5
        const distance = variant === 'spark' ? 80 + Math.random() * 120 : 110 + Math.random() * 190
        return {
          '--dx': `${Math.round(Math.cos(angle) * distance)}px`,
          '--dy': `${Math.round(Math.sin(angle) * distance - (variant === 'confetti' ? 90 : 0))}px`,
          '--rot': `${Math.round(Math.random() * 720 - 360)}deg`,
          animationDelay: `${Math.round(Math.random() * 120)}ms`,
          // 火花の色は CSS で決める
          background: variant === 'confetti' ? COLORS[i % COLORS.length] : undefined,
        } as CSSProperties
      }),
    [count, variant],
  )
  if (count === 0) return null
  return (
    <div aria-hidden="true" className={cx('pointer-events-none absolute top-1/2 left-1/2', className)}>
      {items.map((style, i) => (
        <span key={i} className={variant === 'confetti' ? 'fx-confetti' : 'fx-spark'} style={style} />
      ))}
    </div>
  )
}
