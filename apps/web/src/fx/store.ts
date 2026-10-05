import { create } from 'zustand'
import type { GameEvent, PlayerId } from '@srm/game-core'
import { useSound } from '../sound/store'
import type { NameOf } from '../ui/labels'
import {
  KEEP_KINDS,
  MINOR_KINDS,
  cutinsFor,
  flightsFor,
  seatPopsFor,
  type CutinSpec,
  type FlightSpec,
  type FxTone,
} from './events'

/**
 * 演出の量。
 * - full: すべて(カットイン・閃光・粒・場の揺れ)
 * - lite: 粒・閃光・揺れを出さず、カットインを短くする
 * - off: カットインも吹き出しも出さず、CSS の動きも止める
 */
export type FxLevel = 'full' | 'lite' | 'off'

export const FX_LEVEL_LABEL: Record<FxLevel, string> = { full: '豪華', lite: '控えめ', off: 'オフ' }
export const NEXT_FX_LEVEL: Record<FxLevel, FxLevel> = { full: 'lite', lite: 'off', off: 'full' }

export interface Cutin extends CutinSpec {
  id: number
  durationMs: number
}

export interface SeatPop {
  seq: number
  text: string
  tone: FxTone
}

/** 手札から場へ飛んでいるカード。from は飛び立つ位置(画面座標) */
export interface Flight extends FlightSpec {
  id: number
  from: { x: number; y: number; width: number; height: number }
  durationMs: number
}

/** 1枚が飛ぶ時間(抜き出し→弧を描いて移動→着地) */
export const FLIGHT_MS: Record<Exclude<FxLevel, 'off'>, number> = { full: 600, lite: 400 }

/**
 * 飛び立つ位置。出来事は画面の描き直しより前に届くので、自分のカードはまだ手札にある。
 * 相手は席の裏向きの手札。見つからなければ画面の上端(相手)か下端(自分)の中央から。
 */
function originOf(spec: FlightSpec): Flight['from'] {
  const selector = spec.faceDown ? `[data-seat-hand="${spec.playerId}"]` : `[data-card="${spec.card}"]`
  const el = typeof document === 'undefined' ? null : document.querySelector(selector)
  const width = typeof window === 'undefined' ? 0 : window.innerWidth
  const height = typeof window === 'undefined' ? 0 : window.innerHeight
  if (!el) return { x: width / 2 - 20, y: spec.faceDown ? -60 : height, width: 40, height: 56 }
  const rect = el.getBoundingClientRect()
  // 横に流れる席の列で見えていない席からは、画面の端から出す
  const x = Math.min(Math.max(rect.left, 0), Math.max(0, width - rect.width))
  return { x, y: rect.top, width: rect.width, height: rect.height }
}

const LEVEL_KEY = 'srm:fx'
/** 待ち行列の上限。CPUが続けて効果を出しても、古い演出をいつまでも見せない */
const QUEUE_MAX = 3
/** 演出がオフのとき、同時に起きたカットインの音をずらす間隔 */
const OFF_SOUND_GAP_MS = 600

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** 粒の数を減らす端末(コア数・メモリが少ない、省データ設定) */
const LOW_END: boolean = (() => {
  if (typeof navigator === 'undefined') return false
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } }
  return (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 2 || !!nav.connection?.saveData
})()

export function particleCount(base: number, level: FxLevel): number {
  if (level !== 'full') return 0
  return LOW_END ? Math.ceil(base / 2) : base
}

/**
 * 自分で選んだ量があればそれを使う。選んでいなければ、OS の「動きを減らす」設定ではオフ、
 * 性能の低い端末では控えめにする。自分で「豪華」を選んだら OS の設定より優先する。
 */
function loadLevel(): FxLevel {
  try {
    const saved = localStorage.getItem(LEVEL_KEY)
    if (saved === 'full' || saved === 'lite' || saved === 'off') return saved
  } catch {
    // 読めなければ既定値
  }
  if (prefersReducedMotion()) return 'off'
  return LOW_END ? 'lite' : 'full'
}

/** CSS が演出の量を見られるように <html data-fx> に書く(オフでは styles.css が動きを止める) */
function applyLevel(level: FxLevel): void {
  if (typeof document !== 'undefined') document.documentElement.dataset.fx = level
}

function durationOf(spec: CutinSpec, level: FxLevel): number {
  if (MINOR_KINDS.has(spec.kind)) return level === 'full' ? 900 : 700
  // 7渡しは、なぜカードを渡すのかを読んでもらうので長めに出す
  if (spec.kind === 'sevens' || spec.kind === 'exchange') return level === 'full' ? 2200 : 1600
  if (level !== 'full') return 800
  return spec.kind === 'finish' || spec.kind === 'gameEnd' || spec.kind === 'bomb' ? 1400 : 1100
}

interface FxStore {
  level: FxLevel
  /** いま出ているカットイン */
  current: Cutin | null
  queue: Cutin[]
  seatPops: Record<PlayerId, SeatPop>
  shake: { seq: number; strength: 1 | 2 } | null
  flights: Flight[]
  /** 飛んでいたカードがマスに着いた */
  landed: (id: number) => void
  setLevel: (level: FxLevel) => void
  /** 新しく起きた出来事を演出にする */
  emit: (events: GameEvent[], name: NameOf, youId: PlayerId) => void
  push: (spec: CutinSpec) => void
  clear: () => void
}

let seq = 0
let timer: ReturnType<typeof setTimeout> | null = null
let flightTimers: ReturnType<typeof setTimeout>[] = []
/** 飛ぶ層が描けなかったときも、CPU がいつまでも待たないよう着いたことにするまでの余裕 */
const FLIGHT_GRACE_MS = 800

export const useFx = create<FxStore>()((set, get) => {
  const advance = () => {
    timer = null
    const [next, ...rest] = get().queue
    if (!next) {
      set({ current: null })
      return
    }
    const shake = next.shake && get().level === 'full' ? { seq: ++seq, strength: next.shake } : get().shake
    set({ current: next, queue: rest, shake })
    useSound.getState().playCutin(next)
    timer = setTimeout(advance, next.durationMs)
  }

  const enqueue = (specs: CutinSpec[]) => {
    const level = get().level
    if (level === 'off') {
      // カットインは出さないが、音は演出の量と別に選べるので、重ならないよう順に鳴らす
      specs.forEach((spec, i) => useSound.getState().playCutin(spec, i * OFF_SOUND_GAP_MS))
      return
    }
    if (specs.length === 0) return
    // 裏にあるタブでは見えないので溜めない(戻ったときに古い演出が続けて流れるのを防ぐ)
    if (typeof document !== 'undefined' && document.hidden) return
    const items = specs.map((spec) => ({ ...spec, id: ++seq, durationMs: durationOf(spec, level) }))
    // まだ出ていない手番の知らせは、次の出来事が来た時点で古いので捨てる
    const next = [...get().queue.filter((c) => !MINOR_KINDS.has(c.kind)), ...items]
    while (next.length > QUEUE_MAX) {
      const drop = next.findIndex((c) => !KEEP_KINDS.has(c.kind))
      next.splice(drop === -1 ? 0 : drop, 1)
    }
    set({ queue: next })
    if (timer === null) advance()
  }

  /** 飛ばしたら、最後のカードが着くまでの時間を返す(飛ばさなければ0) */
  const launch = (specs: FlightSpec[]): number => {
    const level = get().level
    if (specs.length === 0 || level === 'off') return 0
    if (typeof document !== 'undefined' && document.hidden) return 0
    const durationMs = FLIGHT_MS[level]
    const items = specs.map((spec) => ({ ...spec, id: ++seq, from: originOf(spec), durationMs }))
    set((s) => ({ flights: [...s.flights, ...items] }))
    for (const item of items) {
      flightTimers.push(setTimeout(() => get().landed(item.id), item.delayMs + durationMs + FLIGHT_GRACE_MS))
    }
    return Math.max(...items.map((item) => item.delayMs)) + durationMs
  }

  const initial = loadLevel()
  applyLevel(initial)

  return {
    level: initial,
    current: null,
    queue: [],
    seatPops: {},
    shake: null,
    flights: [],

    landed(id) {
      if (get().flights.some((f) => f.id === id)) set((s) => ({ flights: s.flights.filter((f) => f.id !== id) }))
    },

    setLevel(level) {
      applyLevel(level)
      set({ level })
      if (level === 'off') get().clear()
      try {
        localStorage.setItem(LEVEL_KEY, level)
      } catch {
        // 保存できなくても遊べる
      }
    },

    emit(events, name, youId) {
      if (get().level === 'off') {
        enqueue(cutinsFor(events, name, youId))
        return
      }
      const pops = seatPopsFor(events, youId)
      if (pops.length > 0) {
        set((s) => {
          const seatPops = { ...s.seatPops }
          for (const pop of pops) seatPops[pop.playerId] = { seq: ++seq, text: pop.text, tone: pop.tone }
          return { seatPops }
        })
      }
      const flightMs = launch(flightsFor(events, youId))
      const cutins = cutinsFor(events, name, youId)
      // カードが場に着いてからカットインを出す(8切りなどで、飛んでいるカードを覆わない)
      if (flightMs > 0 && cutins.length > 0) flightTimers.push(setTimeout(() => enqueue(cutins), flightMs))
      else enqueue(cutins)
    },

    push(spec) {
      enqueue([spec])
    },

    clear() {
      if (timer !== null) clearTimeout(timer)
      timer = null
      for (const t of flightTimers) clearTimeout(t)
      flightTimers = []
      set({ current: null, queue: [], seatPops: {}, shake: null, flights: [] })
    },
  }
})
