import { z } from 'zod'
import { SUITS, type Action, type PlayerView } from '@srm/game-core'

/**
 * クライアントとサーバーの間でやり取りするデータの定義。
 *
 * - サーバーはクライアントから届いたものを信用しない。必ず parse* を通してから使う
 * - サーバーからは GameState を送らない。各人の PlayerView(viewFor の結果)だけを送る
 */

export const MIN_SEATS = 3
export const MAX_SEATS = 6
export const LIMITS = { roomName: 24, playerName: 12 } as const

export type CpuLevel = 'easy' | 'normal'

export interface RoomSettings {
  /** 人間とCPUを合わせた人数(3〜6) */
  seats: number
  cpuLevel: CpuLevel
}

/** lobby: 開始前 / playing: 対戦中 / result: 対戦が終わって結果を表示中 */
export type RoomPhase = 'lobby' | 'playing' | 'result'

export interface RoomMemberView {
  id: string
  name: string
  isHost: boolean
  connected: boolean
  /** 今の(または直前の)対戦に参加しているか */
  seated: boolean
}

export interface RoomView {
  name: string
  phase: RoomPhase
  /** 受け取った本人のメンバーID */
  you: string
  hostId: string | null
  members: RoomMemberView[]
  settings: RoomSettings
  /** 今の(または直前の)対戦のID。対戦ごとに変わり、開始前は null */
  matchId: string | null
}

/**
 * 受け取った本人の制限時間。時計のずれを避けるため、時刻ではなく経過時間で送る。
 * クライアントは「受け取った時刻 - elapsedMs」を開始時刻として数える。
 */
export interface TimerView {
  key: string
  elapsedMs: number
  baseMs: number
  /** この場面が始まった時点で残っていた持ち時間 */
  reserveMs: number
}

export interface GameUpdate {
  /** version はこの ID の対戦の中でだけ比べられる */
  matchId: string
  view: PlayerView
  timer: TimerView | null
}

export type ErrorCode =
  | 'invalid'
  | 'stale'
  | 'forbidden'
  | 'not_found'
  | 'room_full'
  | 'in_progress'
  | 'rate_limited'

export type Ack<T> = { ok: true; data: T } | { ok: false; code: ErrorCode; error: string }

export interface JoinPayload {
  roomName: string
  playerName: string
  /** ブラウザごとの秘密の値。再接続したときに同じ席へ戻るために使う。他人には送らない */
  token: string
}

export interface ActPayload {
  /** 前の対戦の画面から遅れて届いた操作を弾く */
  matchId: string
  /** 操作を決めたときに見ていた PlayerView.version。古い画面からの操作や二重送信を弾く */
  version: number
  action: Action
}

export interface ClientToServerEvents {
  'room:join': (payload: JoinPayload, ack: (res: Ack<RoomView>) => void) => void
  'room:leave': (ack: (res: Ack<null>) => void) => void
  'room:settings': (payload: RoomSettings, ack: (res: Ack<null>) => void) => void
  'room:start': (ack: (res: Ack<null>) => void) => void
  'game:act': (payload: ActPayload, ack: (res: Ack<null>) => void) => void
}

export interface ServerToClientEvents {
  'room:state': (room: RoomView) => void
  'game:update': (update: GameUpdate) => void
}

/** 表示用の文字列を正規化する(全角英数の統一、制御文字の除去、空白の整理) */
export function normalizeText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 部屋名から部屋を探すためのキー。英字の大文字・小文字と全角・半角は区別しない */
export function roomKey(roomName: string): string {
  return normalizeText(roomName).toLowerCase()
}

const text = (max: number) =>
  z
    .string()
    .max(max * 4)
    .transform(normalizeText)
    .pipe(z.string().min(1).max(max))

const joinSchema = z.object({
  roomName: text(LIMITS.roomName),
  playerName: text(LIMITS.playerName),
  token: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
})

const settingsSchema = z.object({
  seats: z.number().int().min(MIN_SEATS).max(MAX_SEATS),
  cpuLevel: z.enum(['easy', 'normal']),
})

const cardId = z.string().regex(/^(JOKER|[SHDC](1[0-3]|[1-9]))$/)
const rank = z.number().int().min(1).max(13)
const playerId = z.string().min(1).max(64)

const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('GIVE_SEVENS'), playerId, cards: z.array(cardId).max(4) }),
  z.object({ type: z.literal('DECLARE'), playerId, effect: z.enum(['rokurokubi', 'ambulance']) }),
  z.object({ type: z.literal('PLACE'), playerId, card: cardId }),
  z.object({
    type: z.literal('USE_JOKER'),
    playerId,
    cell: z.object({ suit: z.enum(SUITS), rank }),
    withCard: cardId.nullable(),
  }),
  z.object({ type: z.literal('PASS'), playerId }),
  z.object({ type: z.literal('BOMB_RANK'), playerId, rank }),
  z.object({ type: z.literal('TEN_DISCARD'), playerId, card: cardId }),
  z.object({ type: z.literal('REACT'), playerId, effect: z.enum(['sandstorm', 'threeSpade', 'fourStop', 'skip']) }),
  z.object({ type: z.literal('JOKER_TAKE'), playerId, take: z.boolean() }),
])

const actSchema = z.object({
  matchId: z.string().min(1).max(64),
  version: z.number().int().nonnegative(),
  action: actionSchema,
})

export function parseJoin(input: unknown): JoinPayload | null {
  const result = joinSchema.safeParse(input)
  return result.success ? result.data : null
}

export function parseSettings(input: unknown): RoomSettings | null {
  const result = settingsSchema.safeParse(input)
  return result.success ? result.data : null
}

export function parseAct(input: unknown): ActPayload | null {
  const result = actSchema.safeParse(input)
  return result.success ? result.data : null
}
