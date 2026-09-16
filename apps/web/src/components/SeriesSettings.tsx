import type { FourPlayerExchange, RoundCount, Seating, SeriesRules } from '@srm/game-core'
import { ROUNDS_LABEL } from '../ui/labels'
import { ChoiceChip } from './ChoiceChip'

const ROUND_OPTIONS: { value: RoundCount; description: string }[] = [
  { value: 1, description: '1回で終わり' },
  { value: 3, description: '合計点で勝負' },
  { value: 5, description: '合計点で勝負' },
  { value: 'endless', description: '好きなだけ' },
]

const SEATING_OPTIONS: { value: Seating; label: string; description: string }[] = [
  { value: 'fixed', label: '固定', description: 'ずっと同じ席' },
  { value: 'random', label: '毎ラウンドランダム', description: 'ラウンドごとに席替え' },
]

const EXCHANGE_OPTIONS: { value: FourPlayerExchange; label: string; description: string; detail: string }[] = [
  {
    value: 'double',
    label: '2枚と1枚',
    description: '差が大きい',
    detail: '1位と4位が2枚、2位と3位が1枚を交換します(大富豪・富豪・貧民・大貧民)',
  },
  {
    value: 'single',
    label: '1枚だけ',
    description: '差が小さい',
    detail: '1位と4位だけが1枚を交換します(富豪・平民・平民・貧民)',
  },
]

/**
 * ラウンド数・席順・4人戦の交換の設定(docs/RULES.md §9-0)。
 * 席順はラウンド制のときだけ、4人戦の交換はラウンド制で4人のときだけ出す。
 */
export function SeriesSettings({
  idPrefix,
  value,
  players,
  disabled = false,
  onChange,
}: {
  /** 同じ画面に2つ置いても radio の name がぶつからないようにする */
  idPrefix: string
  value: SeriesRules
  /** 人間とCPUを合わせた人数 */
  players: number
  disabled?: boolean
  onChange: (rules: SeriesRules) => void
}) {
  const multiRound = value.rounds !== 1
  const exchange = EXCHANGE_OPTIONS.find((option) => option.value === value.fourPlayerExchange)

  return (
    <>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-700">ラウンド数</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ROUND_OPTIONS.map((option) => (
            <ChoiceChip
              key={String(option.value)}
              name={`${idPrefix}-rounds`}
              checked={value.rounds === option.value}
              disabled={disabled}
              onChange={() => onChange({ ...value, rounds: option.value })}
              label={ROUNDS_LABEL[String(option.value)] ?? String(option.value)}
              description={option.description}
            />
          ))}
        </div>
        {multiRound && (
          <p className="mt-2 text-xs text-slate-500">
            2ラウンド目からは、前のラウンドの順位で身分が決まり、始める前にカードを交換します。
          </p>
        )}
      </fieldset>

      {multiRound && (
        <fieldset className="mt-4">
          <legend className="mb-2 text-sm font-medium text-slate-700">席順</legend>
          <div className="grid grid-cols-2 gap-2">
            {SEATING_OPTIONS.map((option) => (
              <ChoiceChip
                key={option.value}
                name={`${idPrefix}-seating`}
                checked={value.seating === option.value}
                disabled={disabled}
                onChange={() => onChange({ ...value, seating: option.value })}
                label={option.label}
                description={option.description}
              />
            ))}
          </div>
        </fieldset>
      )}

      {multiRound && players === 4 && (
        <fieldset className="mt-4" aria-describedby={`${idPrefix}-exchange-detail`}>
          <legend className="mb-2 text-sm font-medium text-slate-700">4人戦の交換</legend>
          <div className="grid grid-cols-2 gap-2">
            {EXCHANGE_OPTIONS.map((option) => (
              <ChoiceChip
                key={option.value}
                name={`${idPrefix}-exchange`}
                checked={value.fourPlayerExchange === option.value}
                disabled={disabled}
                onChange={() => onChange({ ...value, fourPlayerExchange: option.value })}
                label={option.label}
                description={option.description}
              />
            ))}
          </div>
          {exchange && (
            <p id={`${idPrefix}-exchange-detail`} className="mt-2 text-xs text-slate-500">
              {exchange.detail}
            </p>
          )}
        </fieldset>
      )}
    </>
  )
}
