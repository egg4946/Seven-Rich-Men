import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { rankOf, type CardId, type PlayerView } from '@srm/game-core'
import { holdTier } from '../fx/dopa'
import { useFx } from '../fx/store'
import { handOverlap } from '../game/handLayout'
import { playableCards, type SelectionMode } from '../game/selection'
import { cx } from '../ui/cx'
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
  // ドパガキモードでは、自分の番に出せるカードの縁を光らせる
  const dopaHold = useFx((s) => s.level === 'dopa') && canPlay && playable !== null

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

  // スマホで手札が多いときは、カードを少し重ねて2行に収める(3行になると操作パネルが場を覆う)。
  // 横スクロールにしないのは、上へのスワイプで持ち上げたカードが切れて見えるのと、手札を一度に見渡せなくなるため
  const groupRef = useRef<HTMLDivElement>(null)
  const [overlap, setOverlap] = useState(0)
  useLayoutEffect(() => {
    const group = groupRef.current
    if (!group) return
    const measure = () => {
      const card = group.firstElementChild
      const cardWidth = card instanceof HTMLElement ? card.offsetWidth : 0
      const gap = Number.parseFloat(getComputedStyle(group).rowGap) || 0
      setOverlap(handOverlap(hand.length, group.clientWidth, cardWidth, gap))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(group)
    return () => observer.disconnect()
  }, [hand.length])

  const overlapStyle = overlap > 0 ? ({ '--hand-overlap': `${overlap}px`, paddingLeft: overlap } as CSSProperties) : undefined

  return (
    <div
      ref={groupRef}
      role="group"
      aria-label={`あなたの手札 ${hand.length}枚`}
      style={overlapStyle}
      className={cx(
        'flex min-h-18 flex-wrap justify-center gap-y-1 pt-2 sm:gap-y-1.5 md:min-h-22 md:gap-y-2',
        // 重ねるときは横の間隔を付けない(行の間隔は measure で使うので、どちらでも同じにする)
        overlap > 0 ? '[&>*]:ml-[calc(-1*var(--hand-overlap))]' : 'gap-x-1 sm:gap-x-1.5 md:gap-x-2',
      )}
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
            mutedLabel={mode.type === 'exchange' ? '強い順ではないので渡せません' : undefined}
            revealed={revealed.has(id)}
            enter={enterOf(id)}
            hold={dopaHold && playable.has(id) ? holdTier(rankOf(id), hand.length) : null}
            onClick={mode.type === 'none' ? undefined : () => onToggle(id)}
            onPlay={canPlay ? () => onPlay(id) : undefined}
          />
        ))
      )}
    </div>
  )
}
