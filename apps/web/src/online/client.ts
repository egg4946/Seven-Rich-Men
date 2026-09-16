import { io, type Socket } from 'socket.io-client'
import type {
  Ack,
  ActPayload,
  ClientToServerEvents,
  GameUpdate,
  RoomSettings,
  RoomView,
  ServerToClientEvents,
} from '@srm/protocol'

/** waking: なかなかつながらない。止まっていたサーバーが起動するのを待っている */
export type ConnectionState = 'idle' | 'connecting' | 'waking' | 'connected' | 'reconnecting'

type Client = Socket<ServerToClientEvents, ClientToServerEvents>

export interface OnlineHandlers {
  onRoom(room: RoomView): void
  onGame(update: GameUpdate): void
  onConnection(state: ConnectionState): void
  /** 再接続後に部屋へ戻れなかった(部屋が片付けられた、など) */
  onRejoinFailed(error: string): void
}

export interface JoinTarget {
  roomName: string
  playerName: string
}

const TOKEN_KEY = 'srm:token'
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/
const LAST_ROOM_KEY = 'srm:last-room'
const ACK_TIMEOUT_MS = 8000
/** これを過ぎてもつながらなければ、サーバーが起動中かもしれないと案内する */
export const SLOW_CONNECT_MS = 4000
/** 公開環境(Render の無料枠)は、止まっていると起動に1分ほどかかるので、それより長く待つ */
const WAKE_TIMEOUT_MS = 90_000
/** サーバーを起こす合図を送る間隔の下限 */
const WAKE_INTERVAL_MS = 60_000

/** 入室の結果。cancelled は、つながるのを待つ途中で自分からやめた */
export type JoinResult = Ack<RoomView> | { ok: false; code: 'cancelled'; error: string }

/**
 * 開発中だけ、URL に ?as=b のように付けると別のトークンを使える。
 * 同じブラウザの2つのタブで、別の人として同じ部屋に入る確認用。
 */
function tokenKey(): string {
  if (!import.meta.env.DEV) return TOKEN_KEY
  const alias = new URLSearchParams(window.location.search).get('as')
  return alias && /^[A-Za-z0-9_-]{1,16}$/.test(alias) ? `${TOKEN_KEY}:${alias}` : TOKEN_KEY
}

/**
 * ブラウザごとの秘密のトークン。再接続したときに同じ席へ戻るために使う。
 * crypto.randomUUID は https でないと使えず、スマホから LAN の http で開くと失敗するので
 * getRandomValues で作る。
 */
export function sessionToken(): string {
  const key = tokenKey()
  try {
    const saved = localStorage.getItem(key)
    if (saved && TOKEN_PATTERN.test(saved)) return saved
  } catch {
    // 保存できない環境でも、この画面を開いている間は使える
  }
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  try {
    localStorage.setItem(key, token)
  } catch {
    // 同上
  }
  return token
}

/** リロードしても同じ部屋に戻れるよう、入室中の部屋をタブごとに覚える */
export function saveLastRoom(target: JoinTarget | null): void {
  try {
    if (target) sessionStorage.setItem(LAST_ROOM_KEY, JSON.stringify(target))
    else sessionStorage.removeItem(LAST_ROOM_KEY)
  } catch {
    // 覚えられなくても、部屋名を入れ直せば戻れる
  }
}

export function loadLastRoom(): JoinTarget | null {
  try {
    const raw = sessionStorage.getItem(LAST_ROOM_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<JoinTarget>
    if (typeof parsed.roomName !== 'string' || typeof parsed.playerName !== 'string') return null
    return { roomName: parsed.roomName, playerName: parsed.playerName }
  } catch {
    return null
  }
}

let lastWakeAt = -Infinity

/**
 * 止まっているかもしれないサーバーを、部屋に入る前から起こしておく(応答は使わない)。
 * タイトル画面を開いたまま時間がたつと、公開環境のサーバーは止まっているので、
 * 画面に戻ってきたときに合図を送り、部屋名を入れている間に起動を進める。
 */
export function wakeServer(): void {
  const now = Date.now()
  if (now - lastWakeAt < WAKE_INTERVAL_MS) return
  lastWakeAt = now
  const base = import.meta.env.VITE_SERVER_URL
  const request = base
    ? fetch(new URL('/healthz', base), { mode: 'no-cors', cache: 'no-store' })
    : fetch('/healthz', { cache: 'no-store' })
  request.catch(() => {
    // 起こせなくても、入室するときの接続で起動する
  })
}

/** Socket.IO の接続と、サーバーへの要求をまとめる。画面の状態には依存しない */
export function createOnlineClient(handlers: OnlineHandlers) {
  const url = import.meta.env.VITE_SERVER_URL
  const options = { autoConnect: false, reconnectionDelayMax: 5000 }
  const socket: Client = url ? io(url, options) : io(options)
  /** 入室に成功した部屋。再接続したらここへ入り直す */
  let joined: JoinTarget | null = null

  /**
   * 応答を待つ送信。応答が来なければエラーとして扱う。
   * timeout() 付きの emitWithAck は型定義上 unknown を返すので、ここで応答の型を明示する。
   */
  const call = async <T>(send: () => Promise<unknown>): Promise<Ack<T>> => {
    try {
      return (await send()) as Ack<T>
    } catch {
      return { ok: false, code: 'invalid', error: 'サーバーから応答がありません。通信状況を確認してください' }
    }
  }

  const withTimeout = () => socket.timeout(ACK_TIMEOUT_MS)

  const emitJoin = (target: JoinTarget) =>
    call<RoomView>(() => withTimeout().emitWithAck('room:join', { ...target, token: sessionToken() }))

  socket.on('connect', () => {
    handlers.onConnection('connected')
    const target = joined
    if (!target) return
    // 再接続。同じトークンで入り直すと、サーバーが同じ席に戻してくれる
    void emitJoin(target).then((result) => {
      if (result.ok) handlers.onRoom(result.data)
      else {
        joined = null
        handlers.onRejoinFailed(result.error)
      }
    })
  })
  socket.on('disconnect', () => handlers.onConnection(joined ? 'reconnecting' : 'idle'))
  socket.on('room:state', (room) => handlers.onRoom(room))
  socket.on('game:update', (update) => handlers.onGame(update))

  /** つながるのを待っている間だけ入る。呼ぶと待つのをやめる */
  let cancelConnect: (() => void) | null = null

  /**
   * つながるまで待つ。起動中のサーバーへの接続は失敗するが、Socket.IO が間隔をあけて自動でやり直すので、
   * 失敗してもすぐには諦めず、WAKE_TIMEOUT_MS まで待つ。
   */
  const connect = () =>
    new Promise<'connected' | 'timeout' | 'cancelled'>((resolve) => {
      const finish = (result: 'connected' | 'timeout' | 'cancelled') => {
        socket.off('connect', onConnect)
        clearTimeout(slow)
        clearTimeout(timer)
        cancelConnect = null
        resolve(result)
      }
      const onConnect = () => finish('connected')
      const slow = setTimeout(() => handlers.onConnection('waking'), SLOW_CONNECT_MS)
      const timer = setTimeout(() => finish('timeout'), WAKE_TIMEOUT_MS)
      cancelConnect = () => finish('cancelled')
      socket.on('connect', onConnect)
      socket.connect()
    })

  return {
    async join(target: JoinTarget): Promise<JoinResult> {
      if (!socket.connected) {
        handlers.onConnection('connecting')
        const result = await connect()
        if (result !== 'connected') {
          socket.disconnect()
          handlers.onConnection('idle')
          return result === 'cancelled'
            ? { ok: false, code: 'cancelled', error: '接続をやめました' }
            : { ok: false, code: 'invalid', error: 'サーバーに接続できませんでした。時間をおいてもう一度お試しください' }
        }
      }
      const result = await emitJoin(target)
      if (result.ok) {
        joined = target
        handlers.onRoom(result.data)
      }
      return result
    },

    /** サーバーの起動を待っている入室をやめる */
    cancelJoin(): void {
      cancelConnect?.()
    },

    async leave(): Promise<void> {
      joined = null
      if (socket.connected) await call<null>(() => withTimeout().emitWithAck('room:leave'))
      socket.disconnect()
      handlers.onConnection('idle')
    },

    settings: (settings: RoomSettings) => call<null>(() => withTimeout().emitWithAck('room:settings', settings)),

    start: () => call<null>(() => withTimeout().emitWithAck('room:start')),

    act: (payload: ActPayload) => call<null>(() => withTimeout().emitWithAck('game:act', payload)),
  }
}

export type OnlineClient = ReturnType<typeof createOnlineClient>
