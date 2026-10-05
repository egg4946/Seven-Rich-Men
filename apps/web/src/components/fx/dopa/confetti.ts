import type { Options, Shape } from 'canvas-confetti'

/**
 * ドパガキモードの紙吹雪。canvas-confetti(ISC)を、このモードを使うときに初めて読み込む
 * (ふだんの読み込みを重くしない)。画面いっぱいの canvas に描き、操作は通す。
 */

type Confetti = typeof import('canvas-confetti')

let loading: Promise<Confetti | null> | null = null

function load(): Promise<Confetti | null> {
  loading ??= import('canvas-confetti').then((m) => m.default as Confetti).catch(() => null)
  return loading
}

const RAINBOW = ['#ff2d55', '#ff9500', '#ffe600', '#34c759', '#00c7ff', '#5856d6', '#ff2dd4']
const GOLD = ['#fde68a', '#fbbf24', '#f59e0b', '#fff7cc']

function fire(options: Options): void {
  // 自分で選んだモードなので、OS の「動きを減らす」設定でも出す
  void load().then((confetti) => confetti?.({ zIndex: 58, disableForReducedMotion: false, ...options }))
}

function origin(x: number, y: number): { x: number; y: number } {
  return { x: x / Math.max(window.innerWidth, 1), y: y / Math.max(window.innerHeight, 1) }
}

/** 押した位置で小さく弾ける */
export function sparkAt(x: number, y: number): void {
  fire({ particleCount: 18, spread: 360, startVelocity: 14, ticks: 50, scalar: 0.6, gravity: 0.6, origin: origin(x, y), colors: RAINBOW })
}

/** カードが着いたマスから吹き上げる */
export function burstAt(x: number, y: number, big = false): void {
  fire({
    particleCount: big ? 120 : 45,
    spread: big ? 110 : 70,
    startVelocity: big ? 42 : 26,
    ticks: big ? 160 : 90,
    scalar: big ? 1.1 : 0.8,
    origin: origin(x, y),
    colors: RAINBOW,
  })
}

/** 画面の左右の下から撃ち上げる */
export function cannons(count = 90): void {
  fire({ particleCount: count, angle: 60, spread: 65, startVelocity: 58, origin: { x: 0, y: 0.85 }, colors: RAINBOW })
  fire({ particleCount: count, angle: 120, spread: 65, startVelocity: 58, origin: { x: 1, y: 0.85 }, colors: RAINBOW })
}

/** 花火を続けて上げる。止める関数を返す */
export function fireworks(durationMs: number): () => void {
  const until = performance.now() + durationMs
  const shoot = () => {
    fire({
      particleCount: 80,
      spread: 360,
      startVelocity: 32,
      ticks: 110,
      gravity: 0.7,
      origin: { x: 0.1 + Math.random() * 0.8, y: 0.1 + Math.random() * 0.45 },
      colors: Math.random() < 0.4 ? GOLD : RAINBOW,
    })
  }
  shoot()
  const timer = setInterval(() => {
    if (performance.now() > until) clearInterval(timer)
    else shoot()
  }, 180)
  return () => clearInterval(timer)
}

/** 勝ったとき。金の粒と絵文字を上から降らせる */
export function jackpotRain(): void {
  void load().then((confetti) => {
    if (!confetti) return
    let shapes: Shape[] | undefined
    try {
      shapes = ['👑', '⭐', '🎉'].map((text) => confetti.shapeFromText({ text, scalar: 2.4 }))
    } catch {
      // 絵文字を形にできない環境では、金の粒だけ降らせる
    }
    for (let i = 0; i < 5; i++) {
      void confetti({
        zIndex: 58,
        disableForReducedMotion: false,
        particleCount: shapes ? 16 : 60,
        angle: 270,
        spread: 150,
        startVelocity: 22,
        gravity: 0.9,
        ticks: 260,
        scalar: shapes ? 2.4 : 1.2,
        flat: !!shapes,
        shapes,
        colors: GOLD,
        origin: { x: 0.1 + i * 0.2, y: -0.1 },
      })
    }
  })
}
