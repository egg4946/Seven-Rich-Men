import type { ButtonHTMLAttributes } from 'react'
import { useSound } from '../sound/store'
import { cx } from '../ui/cx'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'subtle'
export type ButtonSize = 'sm' | 'md' | 'lg'

/** melta UI Quick Reference のボタン */
const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-primary-500 text-white hover:bg-primary-700',
  secondary: 'border border-slate-200 bg-white text-slate-700 hover:bg-gray-50',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  subtle: 'text-slate-700 hover:bg-gray-50',
}

/** モバイルでは 44px のタップ領域を確保する */
const SIZE: Record<ButtonSize, string> = {
  sm: 'h-9 gap-1.5 px-3 text-sm',
  md: 'h-11 gap-2 px-4 text-[1rem] md:h-10',
  lg: 'h-12 gap-2 px-6 text-[1rem]',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

export function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  disabled,
  className,
  onClick,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      className={cx(
        // 押した瞬間だけ少し縮める(transform なので軽い)
        'inline-flex items-center justify-center whitespace-nowrap rounded-lg font-medium leading-none transition duration-150 enabled:active:scale-[0.97]',
        'focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT[variant],
        // 塗りのボタンは、hover で光が走る
        (variant === 'primary' || variant === 'danger') && 'fx-shine',
        SIZE[size],
        className,
      )}
      onClick={(event) => {
        onClick?.(event)
        // 押した結果のあとに鳴らす(音の切り替えは、切り替えたあとの大きさで鳴る)
        useSound.getState().play('click')
      }}
      {...rest}
    />
  )
}
