import { create } from 'zustand'
import {
  applyAction,
  endSeries,
  nextRound,
  recordRound,
  standings,
  viewFor,
  whoMustAct,
  type Action,
  type GameEvent,
  type GameState,
  type PlayerView,
  type Series,
} from '@srm/game-core'
import type { GameUpdate, RoomSettings, RoomView, SeriesView } from '@srm/protocol'
import { exchangeCutin, sevensCutin, startCutin } from '../fx/events'
import { FLIGHT_MS, useFx } from '../fx/store'
import { soundsFor } from '../sound/events'
import { useSound } from '../sound/store'
import {
  createOnlineClient,
  loadLastRoom,
  saveLastRoom,
  type ConnectionState,
  type OnlineClient,
} from '../online/client'
import { toastForEvent, type ToastTone } from '../ui/labels'
import { TIMER } from './config'
import {
  HUMAN_ID,
  cpuActors,
  cpuDelayMs,
  createSoloRound,
  decideCpu,
  decisionKey,
  startSoloSeries,
  timeoutAction,
  type CpuSpeed,
  type SoloSettings,
} from './controller'

export interface Toast {
  id: number
  tone: ToastTone
  message: string
}

/** 自分が答えている最中の場面と、その開始時刻(この端末の時計) */
export interface HumanTimer {
  key: string
  startedAt: number
  baseMs: number
}

export type Screen = 'title' | 'lobby' | 'game'
export type Mode = 'solo' | 'online'

interface GameStore {
  screen: Screen
  mode: Mode
  /** 対戦ごとに増える。画面の状態(選択中のカードなど)をリセットするのに使う */
  gameId: number
  settings: SoloSettings
  /** ソロの CPU の速さ。演出の量と同じく、対戦中に変えられて次回も覚えておく */
  cpuSpeed: CpuSpeed
  /** ソロ対戦の状態。オンラインではサーバーだけが持つので null */
  game: GameState | null
  /** 画面が見るのはこれだけ。ソロでもオンラインでも同じ形 */
  view: PlayerView | null
  /** ラウンドの進み具合とポイント。ソロでもオンラインでも同じ形 */
  series: SeriesView | null
  room: RoomView | null
  connection: ConnectionState
  busy: boolean
  toasts: Toast[]
  timer: HumanTimer | null
  reserveLeftMs: number
  now: number

  startSolo: (settings: SoloSettings) => void
  rematch: () => void
  /** ラウンド制で、次のラウンドを始める */
  nextRound: () => void
  /** エンドレスを、ラウンドの合間に終える */
  finishSeries: () => void
  leaveSolo: () => void
  /** 入室できなければエラーメッセージを返す(自分で接続をやめたときは null) */
  joinRoom: (playerName: string, roomName: string) => Promise<string | null>
  /** サーバーの起動を待っている入室をやめる */
  cancelJoin: () => void
  /** リロード前に入っていた部屋へ戻る(アプリ起動時に1回だけ) */
  resumeSession: () => void
  leaveRoom: () => Promise<void>
  updateRoomSettings: (settings: RoomSettings) => Promise<void>
  startOnlineGame: () => Promise<void>
  showLobby: () => void
  act: (action: Action) => void
  dismissToast: (id: number) => void
  setCpuSpeed: (speed: CpuSpeed) => void
}

const SETTINGS_KEY = 'srm:settings'
const DEFAULT_SETTINGS: SoloSettings = {
  name: '',
  cpuCount: 3,
  level: 'normal',
  rounds: 1,
  seating: 'fixed',
  fourPlayerExchange: 'double',
}

function loadSettings(): SoloSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<SoloSettings>
    return {
      name: typeof parsed.name === 'string' ? parsed.name.slice(0, 12) : '',
      cpuCount: [2, 3, 4, 5].includes(Number(parsed.cpuCount)) ? Number(parsed.cpuCount) : 3,
      level: parsed.level === 'easy' ? 'easy' : 'normal',
      rounds: parsed.rounds === 3 || parsed.rounds === 5 || parsed.rounds === 'endless' ? parsed.rounds : 1,
      seating: parsed.seating === 'random' ? 'random' : 'fixed',
      fourPlayerExchange: parsed.fourPlayerExchange === 'single' ? 'single' : 'double',
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

const SPEED_KEY = 'srm:cpuSpeed'

export function loadCpuSpeed(): CpuSpeed {
  try {
    const saved = localStorage.getItem(SPEED_KEY)
    if (saved === 'slow' || saved === 'normal' || saved === 'fast') return saved
  } catch {
    // 読めなければ既定値
  }
  return 'normal'
}

function saveCpuSpeed(speed: CpuSpeed): void {
  try {
    localStorage.setItem(SPEED_KEY, speed)
  } catch {
    // 保存できなくても遊べる
  }
}

/** CPU がカットインやカードの着地を待つときに、もう一度確かめるまでの間隔 */
const FX_WAIT_MS = 200

/** まだ誰も出していない(始まったばかりの)対戦か。途中から入ったときは開始の演出を出さない */
function isFreshGame(view: PlayerView): boolean {
  return view.phase !== 'ended' && !view.log.some((e) => e.type === 'PLACED' || e.type === 'PASSED')
}

const START_SHOWN_KEY = 'srm:startShown'

/**
 * オンライン対戦の開始の演出を、この対戦でまだ出していなければ出したことにして true を返す。
 * 再読み込み・再接続で最初の手より前に入り直しても、もう一度出さないよう sessionStorage に残す。
 */
function claimStartCutin(matchId: string): boolean {
  try {
    if (sessionStorage.getItem(START_SHOWN_KEY) === matchId) return false
    sessionStorage.setItem(START_SHOWN_KEY, matchId)
  } catch {
    // 保存できなくても演出は出す(入り直したときにもう一度出るだけ)
  }
  return true
}

function namesOfView(view: PlayerView): Map<string, string> {
  return new Map([[view.you.id, view.you.name], ...view.opponents.map((o) => [o.id, o.name] as [string, string])])
}

function nameOfView(view: PlayerView): (id: string) => string {
  const names = namesOfView(view)
  return (id) => (id === view.you.id ? 'あなた' : (names.get(id) ?? id))
}

function seriesView(series: Series): SeriesView {
  return { ...series, standings: standings(series) }
}

/**
 * 対戦の始まりの演出。カード交換や7渡しの選択中なら、なぜカードを渡すのかも続けて出す
 * (交換のあとの7渡しの説明は、交換が終わったときに出す)
 */
function playOpening(view: PlayerView): void {
  const fx = useFx.getState()
  fx.push(startCutin(view.seatOrder.length))
  if (view.pending?.type === 'exchange') {
    const spec = exchangeCutin(view, nameOfView(view))
    if (spec) fx.push(spec)
  } else if (view.pending?.type === 'giveSevens') {
    fx.push(sevensCutin(view, nameOfView(view)))
  }
}

let cpuTimers: ReturnType<typeof setTimeout>[] = []
let ticker: ReturnType<typeof setInterval> | null = null
const scheduled = new Set<string>()
let toastSeq = 0
/** 応答を待っているオンライン操作の「対戦ID|version」 */
let actInFlight: string | null = null
/** React の StrictMode で起動時の処理が2回呼ばれても、入り直しは1回にする */
let resumeAttempted = false

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

  const announce = (events: GameEvent[], view: PlayerView) => {
    const youId = view.you.id
    const nameOf = nameOfView(view)
    for (const event of events) {
      const toast = toastForEvent(event, nameOf, youId)
      if (toast) pushToast(toast.tone, toast.message)
    }
    // カードの音は、場に着くところに合わせる
    const fxLevel = useFx.getState().level
    const flyMs = fxLevel === 'off' ? 0 : FLIGHT_MS[fxLevel]
    useFx.getState().emit(events, nameOf, youId)
    // ドパガキモードでは、着地のたびにコインの音を重ねる(コンボは emit で進んでいる)
    const dopaCombo = fxLevel === 'dopa' ? useFx.getState().dopa.combo : undefined
    for (const cue of soundsFor(events, youId, flyMs, dopaCombo)) {
      useSound.getState().play(cue.name, cue.delayMs, cue.rate)
    }
    // カードを出して残り1枚になった人がいたら「リーチ!」
    if (fxLevel === 'dopa' && view.phase !== 'ended') {
      const placers = new Set(events.flatMap((e) => (e.type === 'PLACED' && !e.forced ? [e.playerId] : [])))
      for (const id of placers) {
        const left = id === youId ? view.you.hand.length : view.opponents.find((o) => o.id === id)?.handCount
        if (left === 1) useFx.getState().reach(nameOf(id), id === youId)
      }
    }
    // 交換が終わると7が置かれて7渡しになるので、ここで7渡しの説明を出す
    if (events.some((e) => e.type === 'CARDS_EXCHANGED') && view.pending?.type === 'giveSevens') {
      useFx.getState().push(sevensCutin(view, nameOf))
    }
  }

  const tick = () => {
    const now = Date.now()
    set({ now })
    if (get().mode === 'solo') checkSoloTimeout(now)
  }

  const startTicker = () => {
    if (ticker === null) ticker = setInterval(tick, 200)
  }

  // --- ソロ対戦 -------------------------------------------------------------

  /** 人間の回答が終わったら、基本時間を超えた分だけ持ち時間を減らす */
  const closeSoloTimer = (now: number) => {
    const { timer, reserveLeftMs } = get()
    if (!timer) return
    const overtime = Math.max(0, now - timer.startedAt - timer.baseMs)
    set({ timer: null, reserveLeftMs: Math.max(0, reserveLeftMs - overtime) })
  }

  const applySolo = (action: Action): boolean => {
    const game = get().game
    if (!game) return false
    const result = applyAction(game, action)
    if (!result.ok) {
      if (action.playerId === HUMAN_ID) pushToast('error', result.error)
      return false
    }
    const view = viewFor(result.state, HUMAN_ID)
    set({ game: result.state, view })
    if (view) announce(result.state.log.slice(game.log.length), view)
    syncSolo()
    return true
  }

  /** 状態が変わるたびに、人間の制限時間と CPU の操作を段取りする */
  const syncSolo = () => {
    const game = get().game
    if (!game) return
    const now = Date.now()
    if (game.phase === 'ended') {
      closeSoloTimer(now)
      stopClock()
      const series = get().series
      if (series) set({ series: seriesView(recordRound(series, game.ranking)) })
      return
    }

    const key = decisionKey(game)
    const humanMustAct = whoMustAct(game).includes(HUMAN_ID)
    const timer = get().timer
    if (timer && (!humanMustAct || timer.key !== key)) closeSoloTimer(now)
    if (humanMustAct && TIMER.enabled && get().timer === null) {
      set({ timer: { key, startedAt: now, baseMs: TIMER.baseMs } })
    }

    for (const id of cpuActors(game)) {
      const tag = `${game.version}|${id}`
      if (scheduled.has(tag)) continue
      scheduled.add(tag)
      const run = () => {
        const current = get().game
        if (!current || decisionKey(current) !== key || !whoMustAct(current).includes(id)) return
        // カットインが出ている間・前のカードが飛んでいる間は待って、演出と次の手を重ねない
        const fx = useFx.getState()
        if (fx.current !== null || fx.flights.length > 0) {
          cpuTimers.push(setTimeout(run, FX_WAIT_MS))
          return
        }
        const action = decideCpu(current, id, get().settings.level)
        if (action && applySolo(action)) return
        const fallback = timeoutAction(current, id)
        if (fallback) applySolo(fallback)
      }
      cpuTimers.push(setTimeout(run, cpuDelayMs(game, get().cpuSpeed)))
    }
  }

  const checkSoloTimeout = (now: number) => {
    const { game, timer, reserveLeftMs } = get()
    if (!game || !timer || game.phase === 'ended') return
    if (now - timer.startedAt < timer.baseMs + reserveLeftMs) return
    set({ timer: null, reserveLeftMs: 0 })
    const action = timeoutAction(game, HUMAN_ID)
    if (!action || !applySolo(action)) syncSolo()
  }

  // --- オンライン対戦 -------------------------------------------------------

  const onRoom = (room: RoomView) => {
    const s = get()
    if (s.mode !== 'online') return
    const seated = room.members.some((m) => m.id === room.you && m.seated)
    // 通知を取りこぼして再戦をまたいでも、対戦IDが変われば前の対戦の画面を捨てる
    const startedNewGame = room.matchId !== null && room.matchId !== s.room?.matchId

    // ラウンド制の途中(ラウンドの合間)は、リロードしても対戦の画面に戻す
    const betweenRounds = room.phase === 'result' && !!room.series && !room.series.finished
    let screen: Screen
    if (room.phase === 'playing') screen = seated ? 'game' : 'lobby'
    else if (room.phase === 'result') screen = (s.screen === 'game' || betweenRounds) && seated ? 'game' : 'lobby'
    else screen = 'lobby'

    set({
      room,
      screen,
      series: room.series,
      ...(startedNewGame ? { gameId: s.gameId + 1, view: null, timer: null, toasts: [] } : {}),
    })
    if (startedNewGame) useFx.getState().clear()
  }

  const onGame = (update: GameUpdate) => {
    const s = get()
    if (s.mode !== 'online') return
    // 部屋情報は同じ接続で対戦の更新より先に届くので、部屋の対戦IDと違う更新は前の対戦のもの
    if (update.matchId !== s.room?.matchId) return
    const previous = s.view
    // 通信の順番が前後しても、古い状態で上書きしない(version は同じ対戦の中でだけ比べる)
    if (previous && update.view.version < previous.version) return

    const now = Date.now()
    const { timer } = update
    set({
      view: update.view,
      now,
      timer: timer ? { key: timer.key, startedAt: now - timer.elapsedMs, baseMs: timer.baseMs } : null,
      reserveLeftMs: timer ? timer.reserveMs : s.reserveLeftMs,
    })
    // 入室・再接続した直後は、過去の出来事を通知し直さない
    if (previous) {
      announce(update.view.log.slice(previous.log.length), update.view)
    } else if (isFreshGame(update.view) && claimStartCutin(update.matchId)) {
      playOpening(update.view)
    }
    startTicker()
  }

  let client: OnlineClient | null = null
  const online = (): OnlineClient => {
    client ??= createOnlineClient({
      onRoom,
      onGame,
      onConnection: (connection) => set({ connection }),
      onRejoinFailed: (error) => {
        stopClock()
        saveLastRoom(null)
        set({ mode: 'solo', screen: 'title', room: null, view: null, timer: null })
        pushToast('error', error)
      },
    })
    return client
  }

  /** ソロで series の今のラウンドを始める */
  const beginSoloRound = (settings: SoloSettings, series: Series) => {
    stopClock()
    useFx.getState().clear()
    const game = createSoloRound(settings, series)
    set((s) => ({
      screen: 'game',
      mode: 'solo',
      gameId: s.gameId + 1,
      settings,
      game,
      view: viewFor(game, HUMAN_ID),
      series: seriesView(series),
      room: null,
      toasts: [],
      timer: null,
      reserveLeftMs: TIMER.reserveMs,
      now: Date.now(),
    }))
    const view = get().view
    if (view) playOpening(view)
    startTicker()
    syncSolo()
  }

  return {
    screen: 'title',
    mode: 'solo',
    gameId: 0,
    settings: loadSettings(),
    cpuSpeed: loadCpuSpeed(),
    game: null,
    view: null,
    series: null,
    room: null,
    connection: 'idle',
    busy: false,
    toasts: [],
    timer: null,
    reserveLeftMs: TIMER.reserveMs,
    now: Date.now(),

    startSolo(settings) {
      saveSettings(settings)
      beginSoloRound(settings, startSoloSeries(settings))
    },

    rematch() {
      get().startSolo(get().settings)
    },

    nextRound() {
      const { mode, series, settings, game } = get()
      if (mode === 'solo') {
        if (series && game?.phase === 'ended') beginSoloRound(settings, nextRound(series))
        return
      }
      set({ busy: true })
      void online()
        .next()
        .then((result) => {
          set({ busy: false })
          if (!result.ok) pushToast('error', result.error)
        })
    },

    finishSeries() {
      const { mode, series } = get()
      if (mode === 'solo') {
        if (series) set({ series: seriesView(endSeries(series)) })
        return
      }
      set({ busy: true })
      void online()
        .end()
        .then((result) => {
          set({ busy: false })
          if (!result.ok) pushToast('error', result.error)
        })
    },

    leaveSolo() {
      stopClock()
      useFx.getState().clear()
      set({ screen: 'title', game: null, view: null, series: null, toasts: [], timer: null })
    },

    async joinRoom(playerName, roomName) {
      stopClock()
      useFx.getState().clear()
      const settings = { ...get().settings, name: playerName }
      saveSettings(settings)
      set({ mode: 'online', busy: true, settings, game: null, view: null, series: null, room: null, timer: null, toasts: [] })
      const target = { roomName, playerName: playerName || 'ゲスト' }
      const result = await online().join(target)
      set({ busy: false })
      if (!result.ok) {
        set({ mode: 'solo' })
        return result.code === 'cancelled' ? null : result.error
      }
      saveLastRoom(target)
      startTicker()
      return null
    },

    cancelJoin() {
      // リロード後の入り直しをやめたときも、次のリロードでまた同じ部屋に入らないよう忘れる
      saveLastRoom(null)
      online().cancelJoin()
    },

    resumeSession() {
      if (resumeAttempted) return
      resumeAttempted = true
      const last = loadLastRoom()
      if (!last || get().screen !== 'title') return
      void get()
        .joinRoom(last.playerName, last.roomName)
        .then((error) => {
          if (!error) return
          saveLastRoom(null)
          pushToast('error', `前の部屋に戻れませんでした: ${error}`)
        })
    },

    async leaveRoom() {
      stopClock()
      useFx.getState().clear()
      saveLastRoom(null)
      set({ busy: true })
      await online().leave()
      set({
        busy: false,
        mode: 'solo',
        screen: 'title',
        room: null,
        view: null,
        series: null,
        timer: null,
        toasts: [],
        connection: 'idle',
      })
    },

    async updateRoomSettings(settings) {
      const result = await online().settings(settings)
      if (!result.ok) pushToast('error', result.error)
    },

    async startOnlineGame() {
      set({ busy: true })
      const result = await online().start()
      set({ busy: false })
      if (!result.ok) pushToast('error', result.error)
    },

    showLobby() {
      set({ screen: 'lobby' })
    },

    act(action) {
      if (get().mode === 'solo') {
        applySolo(action)
        return
      }
      const { view, room } = get()
      if (!view || !room?.matchId) return
      // 連打で同じ画面から二重に送ると、2回目が stale になり成功したのに警告が出てしまう
      const sent = `${room.matchId}|${view.version}`
      if (actInFlight === sent) return
      actInFlight = sent
      void online()
        .act({ matchId: room.matchId, version: view.version, action })
        .then((result) => {
          if (actInFlight === sent) actInFlight = null
          if (result.ok) return
          // 画面が古かっただけなら最新の状態がすぐ届くので、消える通知でやり直しを促す
          pushToast(result.code === 'stale' ? 'alert' : 'error', result.error)
        })
    },

    dismissToast(id) {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    },

    setCpuSpeed(speed) {
      saveCpuSpeed(speed)
      set({ cpuSpeed: speed })
    },
  }
})
