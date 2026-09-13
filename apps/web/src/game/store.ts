import { create } from 'zustand'
import { applyAction, whoMustAct, type Action, type GameState } from '@srm/game-core'
import { toastForEvent, type ToastTone } from '../ui/labels'
import { TIMER } from './config'
import {
  HUMAN_ID,
  cpuActors,
  cpuDelayMs,
  createSoloGame,
  decideCpu,
  decisionKey,
  timeoutAction,
  type SoloSettings,
} from './controller'

export interface Toast {
  id: number
  tone: ToastTone
  message: string
}

/** 人間が答えている最中の場面と、その開始時刻 */
export interface HumanTimer {
  key: string
  startedAt: number
}

interface GameStore {
  screen: 'title' | 'game'
  /** 対戦ごとに増える。画面の状態(選択中のカードなど)をリセットするのに使う */
  gameId: number
  settings: SoloSettings
  game: GameState | null
  toasts: Toast[]
  timer: HumanTimer | null
  reserveLeftMs: number
  now: number
  start: (settings: SoloSettings) => void
  act: (action: Action) => void
  rematch: () => void
  leave: () => void
  dismissToast: (id: number) => void
}

const SETTINGS_KEY = 'srm:settings'
const DEFAULT_SETTINGS: SoloSettings = { name: '', cpuCount: 3, level: 'normal' }

function loadSettings(): SoloSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<SoloSettings>
    return {
      name: typeof parsed.name === 'string' ? parsed.name.slice(0, 12) : '',
      cpuCount: [2, 3, 4, 5].includes(Number(parsed.cpuCount)) ? Number(parsed.cpuCount) : 3,
      level: parsed.level === 'easy' ? 'easy' : 'normal',
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function saveSettings(settings: SoloSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // 保存できなくても遊べるので無視する
  }
}

let cpuTimers: ReturnType<typeof setTimeout>[] = []
let ticker: ReturnType<typeof setInterval> | null = null
const scheduled = new Set<string>()
let toastSeq = 0

function stopClock(): void {
  for (const timer of cpuTimers) clearTimeout(timer)
  cpuTimers = []
  scheduled.clear()
  if (ticker !== null) clearInterval(ticker)
  ticker = null
}

export const useGameStore = create<GameStore>()((set, get) => {
  const pushToast = (tone: ToastTone, message: string) => {
    const id = ++toastSeq
    set((s) => ({ toasts: [...s.toasts, { id, tone, message }].slice(-5) }))
    // 操作が拒否されたエラーは読み終えるまで残す(melta: Toast)
    if (tone !== 'error') setTimeout(() => get().dismissToast(id), 5000)
  }

  const announce = (state: GameState, from: number) => {
    const names = new Map(state.players.map((p) => [p.id, p.name]))
    const nameOf = (id: string) => (id === HUMAN_ID ? 'あなた' : (names.get(id) ?? id))
    for (const event of state.log.slice(from)) {
      const toast = toastForEvent(event, nameOf, HUMAN_ID)
      if (toast) pushToast(toast.tone, toast.message)
    }
  }

  /** 人間の回答が終わったら、基本時間を超えた分だけ持ち時間を減らす */
  const closeTimer = (now: number) => {
    const { timer, reserveLeftMs } = get()
    if (!timer) return
    const overtime = Math.max(0, now - timer.startedAt - TIMER.baseMs)
    set({ timer: null, reserveLeftMs: Math.max(0, reserveLeftMs - overtime) })
  }

  const apply = (action: Action): boolean => {
    const game = get().game
    if (!game) return false
    const result = applyAction(game, action)
    if (!result.ok) {
      if (action.playerId === HUMAN_ID) pushToast('error', result.error)
      return false
    }
    set({ game: result.state })
    announce(result.state, game.log.length)
    sync()
    return true
  }

  /** 状態が変わるたびに、人間の制限時間と CPU の操作を段取りする */
  const sync = () => {
    const game = get().game
    if (!game) return
    const now = Date.now()
    if (game.phase === 'ended') {
      closeTimer(now)
      stopClock()
      return
    }

    const key = decisionKey(game)
    const humanMustAct = whoMustAct(game).includes(HUMAN_ID)
    const timer = get().timer
    if (timer && (!humanMustAct || timer.key !== key)) closeTimer(now)
    if (humanMustAct && TIMER.enabled && get().timer === null) set({ timer: { key, startedAt: now } })

    for (const id of cpuActors(game)) {
      const tag = `${game.version}|${id}`
      if (scheduled.has(tag)) continue
      scheduled.add(tag)
      cpuTimers.push(
        setTimeout(() => {
          const current = get().game
          if (!current || decisionKey(current) !== key || !whoMustAct(current).includes(id)) return
          const action = decideCpu(current, id, get().settings.level)
          if (action && apply(action)) return
          const fallback = timeoutAction(current, id)
          if (fallback) apply(fallback)
        }, cpuDelayMs(game)),
      )
    }
  }

  const tick = () => {
    const now = Date.now()
    set({ now })
    const { game, timer, reserveLeftMs } = get()
    if (!game || !timer || game.phase === 'ended') return
    if (now - timer.startedAt < TIMER.baseMs + reserveLeftMs) return
    set({ timer: null, reserveLeftMs: 0 })
    const action = timeoutAction(game, HUMAN_ID)
    if (!action || !apply(action)) sync()
  }

  return {
    screen: 'title',
    gameId: 0,
    settings: loadSettings(),
    game: null,
    toasts: [],
    timer: null,
    reserveLeftMs: TIMER.reserveMs,
    now: Date.now(),

    start(settings) {
      stopClock()
      saveSettings(settings)
      const game = createSoloGame(settings)
      set((s) => ({
        screen: 'game',
        gameId: s.gameId + 1,
        settings,
        game,
        toasts: [],
        timer: null,
        reserveLeftMs: TIMER.reserveMs,
        now: Date.now(),
      }))
      ticker = setInterval(tick, 200)
      announce(game, 0)
      sync()
    },

    act(action) {
      apply(action)
    },

    rematch() {
      get().start(get().settings)
    },

    leave() {
      stopClock()
      set({ screen: 'title', game: null, toasts: [], timer: null })
    },

    dismissToast(id) {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    },
  }
})
