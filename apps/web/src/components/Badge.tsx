import type { ReactNode } from 'react'
import type { PlayerStatus, Title } from '@srm/game-core'
import { cx } from '../ui/cx'

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

const TONE: Record<BadgeTone, string> = {
  neutral: 'bg-slate-100 text-slate-700',
  accent: 'bg-primary-50 text-primary-700',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
}

export const STATUS_TONE: Record<PlayerStatus, BadgeTone> = {
  playing: 'neutral',
  finished: 'success',
  eliminated: 'warning',
  defeated: 'danger',
}

export const TITLE_TONE: Record<Title, BadgeTone> = {
  daifugo: 'success',
  fugo: 'accent',
  heimin: 'neutral',
  hinmin: 'warning',
  daihinmin: 'danger',
}

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: BadgeTone
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium leading-normal',
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
