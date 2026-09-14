import { useEffect, useRef } from 'react'
import type { CardId, PlayerView } from '@srm/game-core'
import { playableCards, type SelectionMode } from '../game/selection'
import { HandCard, type CardEnter } from './PlayingCard'

export function Hand({
  view,
  mode,
  selected,
  onToggle,
  onPlay,
}: {
  view: PlayerView
  mode: SelectionMode
  selected: CardId[]
  onToggle: (id: CardId) => void
  /** ダブルクリック・上スワイプで出す */
  onPlay: (id: CardId) => void
}) {
  const playable = playableCards(view, mode)
  const revealed = new Set(view.you.revealed)
  const hand = view.you.hand
  // 7渡しは複数枚を選ぶだけなので、すぐに出す操作は付けない
  const canPlay = mode.type === 'turn' || mode.type === 'ten'

  // 前に描いた手札。新しく来たカードだけ登場させる(最初の表示は1枚ずつ配る)
  const known = useRef<Set<CardId> | null>(null)
  useEffect(() => {
    known.current = new Set(hand)
  }, [hand])
  const shown = known.current
  let dealt = 0
  const enterOf = (id: CardId): CardEnter | null => {
    if (shown?.has(id)) return null
    return { delay: shown ? 0 : Math.min(dealt++ * 0.04, 0.8) }
  }

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
            muted={playable !== null && !playable.has(id)}
            revealed={revealed.has(id)}
            enter={enterOf(id)}
            onClick={mode.type === 'none' ? undefined : () => onToggle(id)}
            onPlay={canPlay ? () => onPlay(id) : undefined}
          />
        ))
      )}
    </div>
  )
}
