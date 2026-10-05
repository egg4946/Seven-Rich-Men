import type { CSSProperties } from 'react'

/** キラの位置(親の中の %)・大きさ(px)・出るまでの時間(ms) */
export interface KiraSpot {
  x: number
  y: number
  size?: number
  delay?: number
}

/** 見出しのまわりに散らす、決まった並び(毎回でたらめにすると、同じ演出でも見た目が揺れる) */
export const KIRA_AROUND: KiraSpot[] = [
  { x: 8, y: 22, size: 16, delay: 0 },
  { x: 92, y: 30, size: 20, delay: 120 },
  { x: 20, y: 82, size: 12, delay: 240 },
  { x: 80, y: 78, size: 14, delay: 320 },
  { x: 50, y: 6, size: 10, delay: 420 },
]

/**
 * 4つ角の星がきらっと光って消える。1回だけ動く飾り(aria-hidden)。
 * 親は position を持っていること。控えめ・オフでは CSS で出さない(豪華とドパガキで出す)。
 */
export function Kira({
  spots = KIRA_AROUND,
  color,
  delay = 0,
}: {
  spots?: KiraSpot[]
  color?: string
  /** すべてのキラに足す、出るまでの時間(ms) */
  delay?: number
}) {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0">
      {spots.map((spot, i) => (
        <span
          key={i}
          className="fx-kira"
          style={
            {
              '--x': `${spot.x}%`,
              '--y': `${spot.y}%`,
              '--s': `${spot.size ?? 14}px`,
              '--delay': `${delay + (spot.delay ?? 0)}ms`,
              '--kira': color,
            } as CSSProperties
          }
        />
      ))}
    </span>
  )
}
