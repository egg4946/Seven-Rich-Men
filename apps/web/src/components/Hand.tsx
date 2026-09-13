import { JOKER, type CardId, type PlayerView } from '@srm/game-core'
import type { SelectionMode } from '../game/selection'
import { HandCard } from './PlayingCard'

export function Hand({
  view,
  mode,
  selected,
  onToggle,
}: {
  view: PlayerView
  mode: SelectionMode
  selected: CardId[]
  onToggle: (id: CardId) => void
}) {
  const playable = new Set<CardId>()
  for (const action of view.legalActions) {
    if (action.type === 'PLACE') playable.add(action.card)
    if (action.type === 'USE_JOKER') playable.add(JOKER)
  }
  const revealed = new Set(view.you.revealed)
  const hand = view.you.hand

  return (
    <div
      role="group"
      aria-label={`あなたの手札 ${hand.length}枚`}
      className="flex min-h-18 flex-wrap justify-center gap-1 pt-2 sm:gap-1.5 md:min-h-22 md:gap-2"
    >
      {hand.length === 0 ? (
        <p className="self-center text-sm text-slate-500">手札はありません</p>
      ) : (
        hand.map((id) => (
          <HandCard
            key={id}
            id={id}
            selected={selected.includes(id)}
            muted={mode.type === 'turn' && !playable.has(id)}
            revealed={revealed.has(id)}
            onClick={mode.type === 'none' ? undefined : () => onToggle(id)}
          />
        ))
      )}
    </div>
  )
}
