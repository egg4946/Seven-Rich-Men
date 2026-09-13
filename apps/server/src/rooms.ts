import type { Rng } from '@srm/game-core'
import { normalizeText, roomKey, type Ack, type ActPayload, type JoinPayload, type RoomSettings, type RoomView } from '@srm/protocol'
import { Room, type RoomTiming, type RoomTransport } from './room.js'

export interface ManagerOptions extends RoomTiming {
  /** 接続している人がいなくなった部屋を片付けるまでの時間 */
  emptyRoomTtlMs: number
  rng?: () => Rng
}

function notInRoom<T>(): Ack<T> {
  return { ok: false, code: 'not_found', error: '部屋に入っていません' }
}

/** 部屋名から部屋を探し、接続(socket)がどの部屋にいるかを管理する */
export class RoomManager {
  private readonly rooms = new Map<string, Room>()
  private readonly socketRooms = new Map<string, string>()
  private readonly expiry = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(
    private readonly transport: RoomTransport,
    private readonly options: ManagerOptions,
  ) {}

  get roomCount(): number {
    return this.rooms.size
  }

  join(socketId: string, payload: JoinPayload): Ack<RoomView> {
    const key = roomKey(payload.roomName)
    const previous = this.socketRooms.get(socketId)
    if (previous !== undefined && previous !== key) this.disconnect(socketId)

    let room = this.rooms.get(key)
    if (!room) {
      room = new Room(normalizeText(payload.roomName), this.transport, this.options, {
        rng: this.options.rng,
        onMembersChanged: () => this.check(key),
      })
      this.rooms.set(key, room)
    }

    const result = room.join(socketId, payload.playerName, payload.token)
    if (result.ok) this.socketRooms.set(socketId, key)
    this.check(key)
    return result
  }

  leave(socketId: string): Ack<null> {
    const context = this.context(socketId)
    if (!context) return notInRoom()
    this.socketRooms.delete(socketId)
    return context.room.leave(context.memberId)
  }

  disconnect(socketId: string): void {
    const key = this.socketRooms.get(socketId)
    if (key === undefined) return
    this.socketRooms.delete(socketId)
    this.rooms.get(key)?.disconnect(socketId)
  }

  updateSettings(socketId: string, settings: RoomSettings): Ack<null> {
    const context = this.context(socketId)
    return context ? context.room.updateSettings(context.memberId, settings) : notInRoom()
  }

  start(socketId: string): Ack<null> {
    const context = this.context(socketId)
    return context ? context.room.start(context.memberId) : notInRoom()
  }

  act(socketId: string, payload: ActPayload): Ack<null> {
    const context = this.context(socketId)
    return context ? context.room.act(context.memberId, payload.matchId, payload.version, payload.action) : notInRoom()
  }

  dispose(): void {
    for (const key of [...this.rooms.keys()]) this.remove(key)
  }

  private context(socketId: string): { room: Room; memberId: string } | null {
    const key = this.socketRooms.get(socketId)
    const room = key === undefined ? undefined : this.rooms.get(key)
    const memberId = room?.memberIdOf(socketId)
    return room && memberId ? { room, memberId } : null
  }

  /** 誰もいない部屋はすぐ消し、全員切断した部屋はしばらく待ってから消す */
  private check(key: string): void {
    const room = this.rooms.get(key)
    if (!room) return
    if (room.memberCount === 0) {
      this.remove(key)
      return
    }
    if (room.connectedCount > 0) {
      this.cancelExpiry(key)
      return
    }
    if (!this.expiry.has(key)) {
      this.expiry.set(
        key,
        setTimeout(() => this.remove(key), this.options.emptyRoomTtlMs),
      )
    }
  }

  private remove(key: string): void {
    this.cancelExpiry(key)
    this.rooms.get(key)?.dispose()
    this.rooms.delete(key)
    for (const [socketId, roomKeyOfSocket] of [...this.socketRooms]) {
      if (roomKeyOfSocket === key) this.socketRooms.delete(socketId)
    }
  }

  private cancelExpiry(key: string): void {
    const handle = this.expiry.get(key)
    if (handle) clearTimeout(handle)
    this.expiry.delete(key)
  }
}
