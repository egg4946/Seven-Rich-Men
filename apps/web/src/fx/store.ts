import { create } from 'zustand'
import type { GameEvent, PlayerId } from '@srm/game-core'
import { preloadDopaSounds } from '../sound/player'
import { useSound } from '../sound/store'
import type { NameOf } from '../ui/labels'
import { DOPA_ZERO, PUSH_MAX, dopaFor, multTier, pushRate, type DopaCount, type DopaMilestone } from './dopa'
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
 * - dopa: ドパガキモード(ネタ枠)。full に、コンボ・紙吹雪・盤面や手札が弾け飛ぶ演出と音を重ねる。
 *   ふだんは静かで、コンボが伸びたとき・大きな効果・PUSH の連打で一気に騒がしくなる。
 *   端末の性能は考慮しない。自分で選んだときだけなる(既定値にはしない)
 */
export type FxLevel = 'full' | 'lite' | 'off' | 'dopa'

export const FX_LEVEL_LABEL: Record<FxLevel, string> = { full: '豪華', lite: '控えめ', off: 'オフ', dopa: 'ドパガキ' }
/** ふだんの3つの並びは崩さず、オフの次にドパガキを挟む */
export const NEXT_FX_LEVEL: Record<FxLevel, FxLevel> = { full: 'lite', lite: 'off', off: 'dopa', dopa: 'full' }

/** 閃光・粒・揺れまで出す量か(豪華とドパガキ) */
export function isRich(level: FxLevel): boolean {
  return level === 'full' || level === 'dopa'
}

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
export const FLIGHT_MS: Record<Exclude<FxLevel, 'off'>, number> = { full: 600, lite: 400, dopa: 600 }

/** ドパガキモードの飾りの状態。seq は同じ内容を続けて出し直すための番号 */
export interface DopaFx extends DopaCount {
  /** 今回の倍率と、パワーに足した数。mine は自分のカードで増えたか */
  mult: { seq: number; value: number; gain: number; mine: boolean } | null
  /** 暗転。明けたときに上乗せの倍率を見せる */
  blackout: { seq: number; mult: number } | null
  praise: { seq: number; text: string; hot: boolean } | null
  milestone: { seq: number; kind: DopaMilestone } | null
  /** コンボが切れた(切れる前のコンボ数) */
  broke: { seq: number; combo: number } | null
  /** 誰かの手札が残り1枚になった */
  reach: { seq: number; name: string; mine: boolean } | null
  /** PUSH を押した回数 */
  push: number
  /** 盤面・手札を弾け飛ばす */
  blast: { seq: number; target: BlastTarget } | null
}

export type BlastTarget = 'board' | 'hand' | 'both'

const DOPA_IDLE: DopaFx = {
  ...DOPA_ZERO,
  mult: null,
  blackout: null,
  praise: null,
  milestone: null,
  broke: null,
  reach: null,
  push: 0,
  blast: null,
}

/** 暗転してから明けるまでの時間。真っ暗で音も止め、明けたところで倍率を見せる */
export const DOPA_BLACKOUT_MS = 1000

/** 弾け飛ぶ前に、暗くして溜める時間(静と動の差を付ける) */
export const DOPA_BLAST_HUSH_MS = 300

/** ドパガキモードで、自分の上がり・自分が1位の終了の前に暗転して溜める時間 */
export const DOPA_FREEZE_MS = 400

export function dopaFreezes(spec: Pick<CutinSpec, 'kind' | 'mine'>): boolean {
  return !!spec.mine && (spec.kind === 'finish' || spec.kind === 'gameEnd')
}

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
  if (level === 'dopa') return base * 3
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
    if (saved === 'full' || saved === 'lite' || saved === 'off' || saved === 'dopa') return saved
  } catch {
    // 読めなければ既定値
  }
  if (prefersReducedMotion()) return 'off'
  return LOW_END ? 'lite' : 'full'
}

/** CSS が演出の量を見られるように <html data-fx> に書く(オフでは styles.css が動きを止める) */
function applyLevel(level: FxLevel): void {
  if (typeof document !== 'undefined') document.documentElement.dataset.fx = level
  if (level === 'dopa') preloadDopaSounds()
}

/** ドパガキモードで、落ちてくる飾り・暗転のぶん長く出す種類 */
const DOPA_LONG: Partial<Record<CutinSpec['kind'], number>> = {
  bomb: 2000,
  joker: 2000,
  finish: 2000,
  gameEnd: 2000,
}

function durationOf(spec: CutinSpec, level: FxLevel): number {
  if (MINOR_KINDS.has(spec.kind)) return isRich(level) ? 900 : 700
  // 7渡しは、なぜカードを渡すのかを読んでもらうので長めに出す
  if (spec.kind === 'sevens' || spec.kind === 'exchange') return isRich(level) ? 2200 : 1600
  if (!isRich(level)) return 800
  const long = level === 'dopa' ? DOPA_LONG[spec.kind] : undefined
  if (long) return long + (dopaFreezes(spec) ? DOPA_FREEZE_MS : 0)
  return spec.kind === 'finish' || spec.kind === 'gameEnd' || spec.kind === 'bomb' ? 1400 : 1100
}

interface FxStore {
  level: FxLevel
  /** いま出ているカットイン */
  current: Cutin | null
  queue: Cutin[]
  seatPops: Record<PlayerId, SeatPop>
  /** 強さ3はドパガキモードだけ */
  shake: { seq: number; strength: 1 | 2 | 3 } | null
  flights: Flight[]
  dopa: DopaFx
  /** 誰かの手札が残り1枚になった(ドパガキモードだけ「リーチ!」を出す) */
  reach: (name: string, mine: boolean) => void
  /** ドパガキモードの PUSH ボタンを押した。押すたびに溜まり、溜まり切ると手札が弾け飛ぶ */
  dopaPush: () => void
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
  /** 盤面・手札を弾け飛ばす。暗くして溜めてから、音と揺れと一緒に弾ける */
  const blast = (target: BlastTarget) => {
    set((s) => ({ dopa: { ...s.dopa, blast: { seq: ++seq, target } } }))
    const sound = useSound.getState()
    sound.play('dopaImpact')
    sound.play('dopaBomb', DOPA_BLAST_HUSH_MS)
    flightTimers.push(setTimeout(() => set({ shake: { seq: ++seq, strength: 3 } }), DOPA_BLAST_HUSH_MS))
  }

  const advance = () => {
    timer = null
    const [next, ...rest] = get().queue
    if (!next) {
      set({ current: null })
      return
    }
    const level = get().level
    const dopa = level === 'dopa'
    // ドパガキモードでは、どのカットインでも揺らし、もともと揺れるものは1段強くする
    const strength = dopa && !MINOR_KINDS.has(next.kind) ? (((next.shake ?? 0) + 1) as 1 | 2 | 3) : next.shake
    const shake = strength && isRich(level) ? { seq: ++seq, strength } : get().shake
    set({ current: next, queue: rest, shake })
    // 暗転して溜めるときは、明けるところで鳴らす
    useSound.getState().playCutin(next, dopa && dopaFreezes(next) ? DOPA_FREEZE_MS : 0, dopa)
    // Qボンバーは盤面を、終了は盤面と手札を弾け飛ばす
    if (dopa && next.kind === 'bomb') blast('board')
    if (dopa && next.kind === 'gameEnd') blast('both')
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
    dopa: DOPA_IDLE,

    reach(name, mine) {
      if (get().level !== 'dopa') return
      set((s) => ({ dopa: { ...s.dopa, reach: { seq: ++seq, name, mine } } }))
      useSound.getState().play('dopaReach', 0, 1, 1800)
    },

    dopaPush() {
      if (get().level !== 'dopa') return
      const push = get().dopa.push + 1
      set((s) => ({ dopa: { ...s.dopa, push } }))
      useSound.getState().play('dopaTurn', 0, pushRate(push))
      if (push % PUSH_MAX === 0) {
        useSound.getState().play('dopaHot')
        blast('hand')
      }
    },

    landed(id) {
      if (get().flights.some((f) => f.id === id)) set((s) => ({ flights: s.flights.filter((f) => f.id !== id) }))
    },

    setLevel(level) {
      applyLevel(level)
      // コンボやパワーは、ドパガキモードを選び直すたびに0から
      set({ level, dopa: DOPA_IDLE })
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
      if (get().level === 'dopa') {
        const result = dopaFor(events, youId, get().dopa)
        // コンボはすぐに進め(コインの音の高さに使う)、見た目はカードが場に着いてから出す
        set((s) => ({ dopa: { ...s.dopa, combo: result.combo, chain: result.chain } }))
        const show = () => {
          set((s) => ({
            dopa: {
              ...s.dopa,
              // 隅の数は、倍率が出るのと同時に増やす(続けて届いた分を取りこぼさないよう、足し算で進める)
              power: s.dopa.power + result.gain,
              mult:
                result.mult > 0
                  ? { seq: ++seq, value: result.mult, gain: result.gain, mine: result.mine }
                  : s.dopa.mult,
              praise: result.praise ? { seq: ++seq, ...result.praise } : s.dopa.praise,
              milestone: result.milestone ? { seq: ++seq, kind: result.milestone } : s.dopa.milestone,
              broke: result.broke > 0 ? { seq: ++seq, combo: result.broke } : s.dopa.broke,
            },
          }))
          const sound = useSound.getState()
          if (result.praise) sound.play('dopaPraise')
          // 倍率が大きいほど、強く揺らす
          const tier = multTier(result.mult)
          if (result.mine && tier >= 2) {
            set({ shake: { seq: ++seq, strength: tier >= 4 ? 3 : tier === 3 ? 2 : 1 } })
            if (tier >= 3) sound.play('dopaFanfare')
          }
          if (result.milestone) {
            // コンボの節目で、盤面と手札が弾け飛ぶ
            sound.play('dopaHot')
            sound.play('dopaCheer', DOPA_BLAST_HUSH_MS + 200)
            blast('both')
          }
        }
        // 暗転に当たったら、カードが着いたところで真っ暗にして音を止め、明けてから倍率を見せる
        const reveal =
          result.blackout > 0
            ? () => {
                set((s) => ({ dopa: { ...s.dopa, blackout: { seq: ++seq, mult: result.blackout } } }))
                useSound.getState().play('dopaImpact')
                useSound.getState().play('dopaJackpot', DOPA_BLACKOUT_MS)
                useSound.getState().play('dopaCheer', DOPA_BLACKOUT_MS + 150)
                flightTimers.push(setTimeout(show, DOPA_BLACKOUT_MS))
              }
            : show
        if (result.mult > 0 || result.praise || result.milestone || result.broke > 0) {
          if (flightMs > 0) flightTimers.push(setTimeout(reveal, flightMs))
          else reveal()
        }
      }
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
      set({ current: null, queue: [], seatPops: {}, shake: null, flights: [], dopa: DOPA_IDLE })
    },
  }
})
