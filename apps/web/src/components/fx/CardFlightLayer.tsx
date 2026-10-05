import { motion } from 'motion/react'
import { useLayoutEffect, useState } from 'react'
import { JOKER } from '@srm/game-core'
import { isRich, useFx, type Flight } from '../../fx/store'
import { BoardFace, CardBack, boardFaceClass } from '../PlayingCard'

/** 行き先のマスと、そこから見た飛び立つ位置のずれ */
interface Path {
  left: number
  top: number
  width: number
  height: number
  dx: number
  dy: number
  /** 飛び立つときの大きさ(マスに対する倍率) */
  scale: number
}

function measure(flight: Flight): Path | null {
  const el = document.querySelector(`[data-cell="${flight.cell}"]`)
  if (!el) return null
  const to = el.getBoundingClientRect()
  // マスが画面の外なら、飛ぶところが見えないので飛ばさない
  if (to.bottom < 0 || to.top > window.innerHeight || to.width === 0) return null
  const { from } = flight
  return {
    left: to.left,
    top: to.top,
    width: to.width,
    height: to.height,
    dx: from.x + from.width / 2 - (to.left + to.width / 2),
    dy: from.y + from.height / 2 - (to.top + to.height / 2),
    // 相手の席の小さな裏面からでも、手に取ったくらいの大きさに見せる
    scale: Math.max(from.width / to.width, flight.faceDown ? 1.1 : 0.8),
  }
}

/**
 * 1枚のカードが手札から場へ飛ぶ。
 * 溜め(その場で少し持ち上がる)→ 弧を描いて移動(相手のカードは途中で表に返る)→ マスに重なったら消え、
 * 場のカードが軽くつぶれて弾む(Board の landing)。
 */
function FlyingCard({ flight, full }: { flight: Flight; full: boolean }) {
  const landed = useFx((s) => s.landed)
  const [path, setPath] = useState<Path | null>(null)

  useLayoutEffect(() => {
    const measured = measure(flight)
    if (measured) setPath(measured)
    else landed(flight.id)
  }, [flight, landed])

  if (!path) return null
  const { dx, dy, scale } = path
  // 弧の頂点。2点の中ほどを、上へ持ち上げる
  const lift = Math.min(80, Math.max(36, Math.hypot(dx, dy) * 0.18))
  const joker = flight.card === JOKER
  const flip = flight.faceDown

  return (
    <motion.div
      className="fx-flight absolute"
      style={{ left: path.left, top: path.top, width: path.width, height: path.height, transformPerspective: 600 }}
      initial={{ x: dx, y: dy, scale, rotate: 0, rotateY: flip ? 180 : 0, opacity: 1 }}
      animate={{
        x: [dx, dx, dx * 0.45, 0],
        y: [dy, dy - 12, dy * 0.45 - lift, 0],
        scale: [scale, scale * 1.12, (scale + 1) * 0.6, 1],
        rotate: full ? [0, -6, 8, 0] : 0,
        rotateY: flip ? [180, 180, 90, 0] : 0,
      }}
      transition={{
        duration: flight.durationMs / 1000,
        delay: flight.delayMs / 1000,
        times: [0, 0.2, 0.6, 1],
        ease: ['easeOut', 'easeIn', 'easeOut'],
      }}
      onAnimationComplete={() => landed(flight.id)}
    >
      <div
        className={boardFaceClass(flight.card, false, joker)}
        style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden' }}
      >
        <BoardFace id={flight.card} joker={joker} />
      </div>
      {flip && (
        <CardBack
          className="absolute inset-0 h-full w-full rounded-md"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        />
      )}
    </motion.div>
  )
}

/** 手札から場へ飛ぶカードの層。画面の操作を妨げないよう pointer-events を切る */
export function CardFlightLayer() {
  const flights = useFx((s) => s.flights)
  const full = useFx((s) => isRich(s.level))
  if (flights.length === 0) return null
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[40] overflow-hidden">
      {flights.map((flight) => (
        <FlyingCard key={flight.id} flight={flight} full={full} />
      ))}
    </div>
  )
}
