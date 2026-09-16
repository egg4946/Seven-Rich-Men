import { create } from 'zustand'
import type { GameEvent, PlayerId } from '@srm/game-core'
import type { NameOf } from '../ui/labels'
import { KEEP_KINDS, MINOR_KINDS, cutinsFor, seatPopsFor, type CutinSpec, type FxTone } from './events'

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

const LEVEL_KEY = 'srm:fx'
/** 待ち行列の上限。CPUが続けて効果を出しても、古い演出をいつまでも見せない */
const QUEUE_MAX = 3

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
  if (spec.kind === 'sevens') return level === 'full' ? 2200 : 1600
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
  setLevel: (level: FxLevel) => void
  /** 新しく起きた出来事を演出にする */
  emit: (events: GameEvent[], name: NameOf, youId: PlayerId) => void
  push: (spec: CutinSpec) => void
  clear: () => void
}

let seq = 0
let timer: ReturnType<typeof setTimeout> | null = null

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
    timer = setTimeout(advance, next.durationMs)
  }

  const enqueue = (specs: CutinSpec[]) => {
    const level = get().level
    if (specs.length === 0 || level === 'off') return
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

  const initial = loadLevel()
  applyLevel(initial)

  return {
    level: initial,
    current: null,
    queue: [],
    seatPops: {},
    shake: null,

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
      if (get().level === 'off') return
      const pops = seatPopsFor(events, youId)
      if (pops.length > 0) {
        set((s) => {
          const seatPops = { ...s.seatPops }
          for (const pop of pops) seatPops[pop.playerId] = { seq: ++seq, text: pop.text, tone: pop.tone }
          return { seatPops }
        })
      }
      enqueue(cutinsFor(events, name, youId))
    },

    push(spec) {
      enqueue([spec])
    },

    clear() {
      if (timer !== null) clearTimeout(timer)
      timer = null
      set({ current: null, queue: [], seatPops: {}, shake: null })
    },
  }
})
