import { animate, motion, useMotionValue, type PanInfo, type Transition } from 'motion/react'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { parseCard, type CardId } from '@srm/game-core'
import { cx } from '../ui/cx'
import { RANK_EFFECT_SHORT, SUIT_SYMBOL, cardName, isRedSuit, rankLabel } from '../ui/labels'

/** カードが手札から場へ動く時間。速く出て、ゆっくり止まる */
const MOVE = { duration: 0.32, ease: [0.22, 1, 0.36, 1] } as const
/** 登場・着地の弾み */
const LAND = { type: 'spring', stiffness: 520, damping: 20, mass: 0.8 } as const
/** 2回のタップをダブルクリック(ダブルタップ)とみなす間隔 */
const DOUBLE_TAP_MS = 350
/** この距離か速さで上に払ったら、場に出す */
const SWIPE_DISTANCE = 48
const SWIPE_VELOCITY = 500
/** 選択中のカードを持ち上げる量 */
const LIFT = -8

/** 手札に新しく来たカードの登場 */
export interface CardEnter {
  delay: number
}

/** 場に新しく置かれたカードの着地 */
export interface BoardEnter {
  delay: number
  /** 波紋を出すか(最初の表示では出さない) */
  ring: boolean
  /** 手札から飛んできて着いたところ。落ちてくる代わりに、軽くつぶれて弾む */
  landing?: boolean
}

function enterTransition(delay: number): Transition {
  return { layout: MOVE, default: { ...LAND, delay }, opacity: { duration: 0.16, delay } }
}

function colorOf(id: CardId): string {
  const cell = parseCard(id)
  if (!cell) return 'text-primary-600'
  return isRedSuit(cell.suit) ? 'text-red-600' : 'text-slate-900'
}

/**
 * 手札のカード。layoutId で手札の中の並び替えを滑らかにする(場へは飛ぶ層 CardFlightLayer が運ぶ)。
 * data-card は飛び立つ位置を測るのに使う。
 * onPlay があれば、ダブルクリック(ダブルタップ)か上へのスワイプで出せる。
 * enter はマウント時だけ使う(手番が変わって button ⇔ div が入れ替わっても、登場し直さない)。
 */
export function HandCard({
  id,
  selected,
  muted,
  mutedLabel = '今は出せません',
  revealed,
  enter,
  onClick,
  onPlay,
}: {
  id: CardId
  selected: boolean
  muted: boolean
  /** 暗くしている理由の読み上げ */
  mutedLabel?: string
  revealed: boolean
  enter?: CardEnter | null
  onClick?: () => void
  onPlay?: () => void
}) {
  const cell = parseCard(id)
  const color = colorOf(id)
  const label = [cardName(id), revealed && '公開中', muted && mutedLabel].filter(Boolean).join('、')
  const className = cx(
    'relative flex h-16 w-11 shrink-0 flex-col justify-between rounded-lg border bg-white p-1 text-left leading-none shadow-sm transition-colors md:h-20 md:w-14 md:p-1.5',
    // 手札を重ねて並べたときも、選んだカードは右隣より手前に出す
    selected ? 'z-[5] border-primary-500 ring-2 ring-primary-500' : 'border-slate-200',
    onClick && 'hover:border-slate-300 focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:outline-none',
  )
  const appear = {
    initial: enter ? { opacity: 0, scale: 0.4, rotate: -14 } : false,
    animate: { opacity: 1, scale: 1, rotate: 0 },
    transition: enterTransition(enter?.delay ?? 0),
  } as const
  // 持ち上げ(選択)とスワイプの両方が y を動かすので、1つの値にまとめて自分で戻す
  const y = useMotionValue(selected ? LIFT : 0)
  const rest = selected ? LIFT : 0
  useEffect(() => {
    const controls = animate(y, rest, MOVE)
    return () => controls.stop()
  }, [y, rest])

  const lastTap = useRef(0)
  const dragged = useRef(false)

  const handleClick = () => {
    // スワイプの指を離したときのクリックは、選択の切り替えに数えない
    if (dragged.current) {
      dragged.current = false
      return
    }
    const now = performance.now()
    if (onPlay && now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0
      onPlay()
      return
    }
    lastTap.current = now
    onClick?.()
  }

  const handleDragEnd = (_: PointerEvent, info: PanInfo) => {
    if (info.offset.y < -SWIPE_DISTANCE || info.velocity.y < -SWIPE_VELOCITY) onPlay?.()
    animate(y, rest, MOVE)
  }

  const face = (
    <>
      {/* text-* は行間も持つので、カードの高さに収めるため各行で leading-none を明示する */}
      <span className={cx('shrink-0 text-sm leading-none font-semibold md:text-base md:leading-none', color)}>
        {cell ? rankLabel(cell.rank) : 'JK'}
      </span>
      <span
        aria-hidden="true"
        className={cx('shrink-0 self-center text-xl leading-none md:text-2xl md:leading-none', color)}
      >
        {cell ? SUIT_SYMBOL[cell.suit] : '★'}
      </span>
      <span
        aria-hidden="true"
        className="-mx-1 shrink-0 truncate text-center text-xxs leading-none tracking-normal text-slate-500"
      >
        {cell ? (RANK_EFFECT_SHORT[cell.rank] ?? '') : ''}
      </span>
      {revealed && (
        <span
          aria-hidden="true"
          // 手札を重ねて並べたとき、右隣のカードに隠れないよう手前に出す
          className="absolute -top-2 right-0 z-[6] rounded-full border border-slate-200 bg-white px-1 text-xxs leading-normal text-slate-700"
        >
          公開
        </span>
      )}
      {/* 出せないカードは、白い幕を重ねて暗く見せる。カード自体の opacity は使わない。
          layoutId の要素には、レイアウトが動いたあと motion が inline で opacity: 1 を書き込み、
          クラスでも animate でも暗さが消えてしまう(ハイライトが効かないことがあった原因) */}
      {muted && (
        <span aria-hidden="true" className="pointer-events-none absolute -inset-px rounded-lg bg-white/45" />
      )}
    </>
  )

  if (!onClick) {
    return (
      <motion.div
        layoutId={`card-${id}`}
        {...appear}
        data-card={id}
        role="img"
        aria-label={label}
        className={className}
      >
        {face}
      </motion.div>
    )
  }

  return (
    <motion.button
      type="button"
      layoutId={`card-${id}`}
      {...appear}
      data-card={id}
      style={{ y }}
      drag={onPlay ? 'y' : false}
      dragConstraints={{ top: -160, bottom: 0 }}
      dragElastic={0.1}
      dragMomentum={false}
      whileDrag={{ scale: 1.06, zIndex: 10 }}
      onPointerDown={() => {
        dragged.current = false
      }}
      onDragStart={() => {
        dragged.current = true
      }}
      onDragEnd={handleDragEnd}
      aria-pressed={selected}
      aria-label={label}
      onClick={handleClick}
      className={className}
    >
      {face}
    </motion.button>
  )
}

/**
 * 場のマスに置かれたカード。新しく置かれたときは、大きく落ちてきて弾み、波紋を広げる。
 * 効果のあるカード(通常配置)の波紋は amber にして、何かが起きたことを目立たせる。
 */
export function BoardCard({
  id,
  forced,
  joker,
  enter,
}: {
  id: CardId
  forced: boolean
  joker?: boolean
  enter?: BoardEnter | null
}) {
  const cell = parseCard(id)
  const [ring, setRing] = useState(!!enter?.ring)
  const delay = enter?.delay ?? 0
  const effect = !joker && !forced && !!cell && RANK_EFFECT_SHORT[cell.rank] !== undefined
  const initial = !enter ? false : enter.landing ? { scaleX: 1.14, scaleY: 0.8 } : { opacity: 0, scale: 1.7 }
  return (
    <motion.div
      initial={initial}
      animate={{ opacity: 1, scale: 1, scaleX: 1, scaleY: 1 }}
      transition={enterTransition(delay)}
      className={cx(boardFaceClass(id, forced, joker), 'relative')}
    >
      <BoardFace id={id} joker={joker} />
      {ring && (
        <span
          aria-hidden="true"
          className={cx('fx-ring', effect && 'fx-ring-effect')}
          style={{ animationDelay: `${Math.round(delay * 1000) + 120}ms` }}
          onAnimationEnd={() => setRing(false)}
        />
      )}
    </motion.div>
  )
}

/** 場のカードの枠と色。飛んでくるカードも同じ見た目にする */
export function boardFaceClass(id: CardId, forced: boolean, joker?: boolean): string {
  return cx(
    'flex h-full w-full flex-col items-center justify-center rounded-md border leading-none',
    joker
      ? 'border-primary-300 bg-primary-50 text-primary-700'
      : forced
        ? cx('border-slate-300 bg-slate-50', colorOf(id))
        : cx('border-slate-200 bg-white shadow-sm', colorOf(id)),
  )
}

export function BoardFace({ id, joker }: { id: CardId; joker?: boolean }) {
  const cell = joker ? null : parseCard(id)
  return (
    <>
      <span className="text-xs font-semibold md:text-sm">{cell ? rankLabel(cell.rank) : 'JK'}</span>
      {cell && (
        <span aria-hidden="true" className="mt-0.5 hidden text-xs md:block">
          {SUIT_SYMBOL[cell.suit]}
        </span>
      )}
    </>
  )
}

/** カードの裏面。相手の席の手札と、飛び立つときの相手のカードに使う */
export function CardBack({ className, style }: { className?: string; style?: CSSProperties }) {
  return <span aria-hidden="true" className={cx('card-back block rounded-[3px]', className)} style={style} />
}

/** 相手の公開中のカード */
export function MiniCard({ id }: { id: CardId }) {
  return (
    <span
      className={cx(
        'inline-flex h-6 min-w-8 items-center justify-center rounded border border-slate-200 bg-white px-1 text-xs font-semibold leading-none',
        colorOf(id),
      )}
    >
      {cardName(id)}
    </span>
  )
}
