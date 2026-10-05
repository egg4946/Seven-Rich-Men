import { useSound } from '../sound/store'
import { cx } from '../ui/cx'
import { CheckIcon } from '../ui/icons'

/** ラジオボタン。選択状態は色だけでなくチェックアイコンでも示す */
export function ChoiceChip({
  name,
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: {
  name: string
  checked: boolean
  onChange: () => void
  label: string
  description?: string
  disabled?: boolean
}) {
  return (
    <label
      className={cx(
        'relative flex min-h-14 flex-col items-center justify-center rounded-lg border px-2 py-2 text-center leading-normal transition-colors',
        'focus-within:ring-2 focus-within:ring-primary-500/50',
        checked ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-slate-200 bg-white text-slate-700',
        disabled ? 'cursor-not-allowed opacity-50' : cx('cursor-pointer', !checked && 'hover:bg-gray-50'),
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        disabled={disabled}
        aria-disabled={disabled || undefined}
        onChange={() => {
          onChange()
          useSound.getState().play('click')
        }}
        className="sr-only"
      />
      <span className="flex items-center gap-1 text-sm font-semibold">
        {checked && (
          <span className="fx-pop-in">
            <CheckIcon className="h-4 w-4" />
          </span>
        )}
        {label}
      </span>
      {description && <span className="text-xs text-slate-500">{description}</span>}
    </label>
  )
}
