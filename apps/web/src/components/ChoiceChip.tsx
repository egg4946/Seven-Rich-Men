import { cx } from '../ui/cx'
import { CheckIcon } from '../ui/icons'

/** ラジオボタン。選択状態は色だけでなくチェックアイコンでも示す */
export function ChoiceChip({
  name,
  checked,
  onChange,
  label,
  description,
}: {
  name: string
  checked: boolean
  onChange: () => void
  label: string
  description?: string
}) {
  return (
    <label
      className={cx(
        'relative flex min-h-14 cursor-pointer flex-col items-center justify-center rounded-lg border px-2 py-2 text-center leading-normal transition-colors',
        'focus-within:ring-2 focus-within:ring-primary-500/50',
        checked
          ? 'border-primary-500 bg-primary-50 text-primary-700'
          : 'border-slate-200 bg-white text-slate-700 hover:bg-gray-50',
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      <span className="flex items-center gap-1 text-sm font-semibold">
        {checked && <CheckIcon className="h-4 w-4" />}
        {label}
      </span>
      {description && <span className="text-xs text-slate-500">{description}</span>}
    </label>
  )
}
