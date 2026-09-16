import { randomUUID } from 'node:crypto'
import {
  applyAction,
  canStartNextRound,
  createGame,
  cryptoRng,
  decisionKey,
  endSeries,
  nextRound,
  recordRound,
  seriesTitles,
  shuffle,
  standings,
  startSeries,
  viewFor,
  whoMustAct,
  type Action,
  type GameState,
  type PlayerSeed,
  type Rng,
  type Series,
} from '@srm/game-core'
import { CPU_NAMES, cpuDelayMs, decideCpu, timeoutAction } from '@srm/game-ai'
import {
  MAX_SEATS,
  MIN_SEATS,
  type Ack,
  type ErrorCode,
  type GameUpdate,
  type RoomPhase,
  type RoomSettings,
  type RoomView,
  type TimerView,
} from '@srm/protocol'

/** 部屋から接続へデータを送る方法。Socket.IO への依存をここに閉じ込める */
export interface RoomTransport {
  sendRoom(socketIds: string[], room: RoomView): void
  sendGame(socketIds: string[], update: GameUpdate): void
}

export interface RoomTiming {
  timerBaseMs: number
  timerReserveMs: number
  /** CPU が考える時間の倍率(テストで短くする) */
  cpuDelayScale: number
  /** ロビーで切断した人を退室扱いにするまでの猶予 */
  lobbyGraceMs: number
}

export interface RoomHooks {
  /** メンバーや接続の数が変わった(空になった部屋の片付けに使う) */
  onMembersChanged?: () => void
  rng?: () => Rng
}

interface Member {
  id: string
  /** 対戦中に自分から抜けた人は null(同じトークンで戻れない) */
  token: string | null
  name: string
  sockets: Set<string>
}

type Timeout = ReturnType<typeof setTimeout>

interface HumanTimer {
  key: string
  startedAt: number
  /** 切断中は止めて null。同じ場面に戻ったら、開始時刻はそのまま引き継ぐ */
  handle: Timeout | null
  pausedAt: number | null
}

/** 複数人が同時に答える場面 */
const CONCURRENT_PENDING = new Set(['exchange', 'giveSevens', 'fourStop', 'jokerReaction'])

function isConcurrent(state: GameState): boolean {
  return !!state.pending && CONCURRENT_PENDING.has(state.pending.type)
}

/** action が、開いている受付への1人分の回答で、受付がそのまま続いているか */
function continuesReception(before: GameState, after: GameState, action: Action): boolean {
  if (!isConcurrent(before) || after.pending?.type !== before.pending?.type) return false
  if (decisionKey(before) !== decisionKey(after)) return false
  const expected = whoMustAct(before).filter((id) => id !== action.playerId)
  const actual = whoMustAct(after)
  return actual.length === expected.length && actual.every((id) => expected.includes(id))
}

function ok<T>(data: T): Ack<T> {
  return { ok: true, data }
}

function fail<T>(code: ErrorCode, error: string): Ack<T> {
  return { ok: false, code, error }
}

/**
 * 1つの部屋。ゲームの状態はここだけが持ち、クライアントには各人の視点だけを送る。
 *
 * Node.js はイベントを1つずつ処理し、applyAction は同期関数なので、同じ部屋への操作は
 * 自然に直列化される。この性質を崩さないよう、状態を変える処理の途中で await しないこと。
 */
export class Room {
  private readonly members = new Map<string, Member>()
  private hostId: string | null = null
  private settings: RoomSettings = {
    seats: 4,
    cpuLevel: 'normal',
    rounds: 1,
    seating: 'fixed',
    fourPlayerExchange: 'double',
  }
  private game: GameState | null = null
  /** 今の(または直前の)対戦のラウンドの進み具合 */
  private series: Series | null = null
  /** 対戦の席(人間とCPU)。「固定」ならこの順のまま、「毎ラウンドランダム」なら毎回並べ替える */
  private seriesSeeds: PlayerSeed[] = []
  private matchId: string | null = null
  /** 開いている同時回答の受付が始まったときの version。受付がなければ null */
  private receptionVersion: number | null = null
  /** 今の(または直前の)対戦に参加している人間 */
  private readonly seated = new Set<string>()
  private readonly reserveLeft = new Map<string, number>()
  private readonly timers = new Map<string, HumanTimer>()
  private readonly automation = new Map<string, Timeout>()
  private readonly lobbyRemovals = new Map<string, Timeout>()

  constructor(
    readonly name: string,
    private readonly transport: RoomTransport,
    private readonly timing: RoomTiming,
    private readonly hooks: RoomHooks = {},
  ) {}

  get phase(): RoomPhase {
    if (!this.game) return 'lobby'
    return this.game.phase === 'ended' ? 'result' : 'playing'
  }

  /**
   * 席を空けてはいけない間か。対戦中に加えて、ラウンド制の途中(ラウンドの合間)も含む。
   * この間は新しい人は入れず、切断・退室した人の席は CPU が代わりに操作する。
   */
  private get locked(): boolean {
    return this.phase === 'playing' || (!!this.series && !this.series.finished)
  }

  get memberCount(): number {
    return this.members.size
  }

  get connectedCount(): number {
    let count = 0
    for (const member of this.members.values()) if (member.sockets.size > 0) count++
    return count
  }

  /** サーバー内部の確認用(テスト・監視)。クライアントには絶対に送らない */
  get state(): GameState | null {
    return this.game
  }

  /** サーバー内部の確認用。制限時間が動いているメンバー */
  openTimerIds(): string[] {
    return [...this.timers].filter(([, timer]) => timer.handle !== null).map(([id]) => id)
  }

  memberIdOf(socketId: string): string | null {
    return this.memberBySocket(socketId)?.id ?? null
  }

  // --- 入退室 ---------------------------------------------------------------

  join(socketId: string, playerName: string, token: string): Ack<RoomView> {
    const returning = [...this.members.values()].find((m) => m.token === token)
    const bound = this.memberBySocket(socketId)
    if (bound && bound !== returning) return fail('forbidden', 'この接続はすでに別の人として部屋に入っています')
    if (returning) {
      // 再接続。対戦中なら CPU の代打をやめて、本人に操作を戻す
      returning.sockets.add(socketId)
      this.cancelLobbyRemoval(returning.id)
      if (!this.locked) returning.name = this.uniqueName(playerName, returning.id)
      this.reschedule()
      this.broadcastRoom()
      this.sendGameTo(returning.id)
      this.hooks.onMembersChanged?.()
      return ok(this.roomView(returning.id))
    }

    if (this.locked) return fail('in_progress', 'この部屋は対戦中です。終わってから入ってください')
    if (this.members.size >= MAX_SEATS) return fail('room_full', `この部屋は満員です(${MAX_SEATS}人まで)`)

    const member: Member = {
      id: `p_${randomUUID().replaceAll('-', '').slice(0, 12)}`,
      token,
      name: this.uniqueName(playerName, null),
      sockets: new Set([socketId]),
    }
    this.members.set(member.id, member)
    this.hostId ??= member.id
    this.settings.seats = Math.min(MAX_SEATS, Math.max(this.settings.seats, this.members.size))
    this.broadcastRoom()
    this.hooks.onMembersChanged?.()
    return ok(this.roomView(member.id))
  }

  disconnect(socketId: string): void {
    const member = this.memberBySocket(socketId)
    if (!member) return
    member.sockets.delete(socketId)
    if (member.sockets.size > 0) return

    if (this.locked && this.seated.has(member.id)) {
      // 対戦中は席を残し、戻るまで CPU が代わりに操作する(§4-5)
      this.reschedule()
    } else {
      // ロビーや結果画面では、猶予のあとで退室扱いにする(リロードなら戻れる)
      this.scheduleLobbyRemoval(member.id)
    }
    this.broadcastRoom()
    this.hooks.onMembersChanged?.()
  }

  leave(memberId: string): Ack<null> {
    const member = this.members.get(memberId)
    if (!member) return fail('not_found', '部屋に入っていません')

    if (this.locked && this.seated.has(memberId)) {
      // 対戦中に抜けた席は、最後まで CPU が操作する。同じトークンでは戻れない
      member.token = null
      member.sockets.clear()
      this.reschedule()
      this.broadcastRoom()
      this.hooks.onMembersChanged?.()
      return ok(null)
    }

    this.removeMember(memberId)
    return ok(null)
  }

  // --- ロビー ---------------------------------------------------------------

  updateSettings(memberId: string, settings: RoomSettings): Ack<null> {
    if (memberId !== this.hostId) return fail('forbidden', '設定を変えられるのは部屋を作った人だけです')
    if (this.locked) return fail('in_progress', '対戦中は設定を変えられません')
    this.settings = {
      seats: Math.min(MAX_SEATS, Math.max(MIN_SEATS, settings.seats, this.members.size)),
      cpuLevel: settings.cpuLevel,
      rounds: settings.rounds,
      seating: settings.seating,
      fourPlayerExchange: settings.fourPlayerExchange,
    }
    this.broadcastRoom()
    return ok(null)
  }

  start(memberId: string): Ack<null> {
    if (memberId !== this.hostId) return fail('forbidden', '開始できるのは部屋を作った人だけです')
    if (this.locked) return fail('in_progress', 'すでに対戦中です')

    // 切断したままの人はこの対戦に入れず、退室扱いにする
    for (const member of [...this.members.values()]) {
      if (member.sockets.size === 0) this.removeMember(member.id)
    }
    const humans = [...this.members.values()]
    const seats = Math.min(MAX_SEATS, Math.max(MIN_SEATS, this.settings.seats, humans.length))
    const seeds: PlayerSeed[] = [
      ...humans.map((m) => ({ id: m.id, name: m.name, isCpu: false })),
      ...Array.from({ length: seats - humans.length }, (_, i) => ({
        id: `cpu${i + 1}`,
        name: CPU_NAMES[i] ?? `CPU${i + 1}`,
        isCpu: true,
      })),
    ]

    const { rounds, seating, fourPlayerExchange } = this.settings
    // 人間同士が隣り合いやすくならないよう、席はランダムに並べる(「固定」はこの並びのまま続ける)
    this.seriesSeeds = shuffle(seeds, (this.hooks.rng ?? cryptoRng)())
    this.series = startSeries(
      { rounds, seating, fourPlayerExchange },
      seeds.map((seed) => seed.id),
    )
    this.seated.clear()
    for (const member of humans) this.seated.add(member.id)
    this.beginRound()
    return ok(null)
  }

  /** ラウンド制で、次のラウンドを始める */
  next(memberId: string): Ack<null> {
    const { series } = this
    if (!series || this.phase !== 'result' || !canStartNextRound(series)) {
      return fail('invalid', '次のラウンドは始められません')
    }
    if (!this.canControl(memberId)) return fail('forbidden', '次のラウンドを始められるのは部屋主だけです')
    this.series = nextRound(series)
    this.beginRound()
    return ok(null)
  }

  /** エンドレスを、ラウンドの合間に終える */
  end(memberId: string): Ack<null> {
    const { series } = this
    if (!series || series.rules.rounds !== 'endless' || this.phase !== 'result' || series.finished) {
      return fail('invalid', '今は終了できません')
    }
    if (!this.canControl(memberId)) return fail('forbidden', '終了できるのは部屋主だけです')
    this.series = endSeries(series)
    this.broadcastRoom()
    this.scheduleRemovalOfAbsent()
    return ok(null)
  }

  /**
   * ラウンドの合間の操作(次へ・終了)ができるか。部屋主が切断・退室していると誰も進められなくなるので、
   * そのときは対戦に参加している他の人にも任せる
   */
  private canControl(memberId: string): boolean {
    if (memberId === this.hostId) return true
    const host = this.hostId ? this.members.get(this.hostId) : undefined
    return (!host || host.sockets.size === 0) && this.seated.has(memberId)
  }

  private beginRound(): void {
    const { series } = this
    if (!series) return
    this.clearGameTimers()
    const rng = (this.hooks.rng ?? cryptoRng)()
    const players =
      series.round > 1 && series.rules.seating === 'random' ? shuffle(this.seriesSeeds, rng) : this.seriesSeeds
    this.game = createGame({ players, rng, titles: seriesTitles(series) })
    this.matchId = randomUUID()
    this.receptionVersion = isConcurrent(this.game) ? this.game.version : null
    // 持ち時間はラウンドごとに戻す
    this.reserveLeft.clear()
    for (const id of this.seated) this.reserveLeft.set(id, this.timing.timerReserveMs)
    this.broadcastRoom()
    this.afterChange()
  }

  // --- 対戦 -----------------------------------------------------------------

  act(memberId: string, matchId: string, version: number, action: Action): Ack<null> {
    const game = this.game
    const stale = () => fail<null>('stale', '画面が最新ではありませんでした。もう一度操作してください')
    if (!game || game.phase === 'ended') return fail('invalid', '対戦中ではありません')
    if (!this.seated.has(memberId)) return fail('forbidden', 'この対戦には参加していません')
    if (action.playerId !== memberId) return fail('forbidden', '他の人の操作はできません')
    if (matchId !== this.matchId) return stale()
    if (version !== game.version && !this.answersOpenReception(memberId, version, game)) return stale()
    return this.apply(action)
  }

  /**
   * 同時回答の受付では、他の人が先に答えて version が進んでも、
   * 同じ受付を見て答えた人の回答は受け付ける(優先順位は game-core が手番順で決める)
   */
  private answersOpenReception(memberId: string, version: number, game: GameState): boolean {
    const since = this.receptionVersion
    return since !== null && version >= since && version < game.version && whoMustAct(game).includes(memberId)
  }

  private apply(action: Action): Ack<null> {
    const game = this.game
    if (!game) return fail('invalid', '対戦中ではありません')
    const result = applyAction(game, action)
    if (!result.ok) return fail('invalid', result.error)
    this.game = result.state
    if (!continuesReception(game, result.state, action)) {
      this.receptionVersion = isConcurrent(result.state) ? result.state.version : null
    }
    this.afterChange()
    return ok(null)
  }

  private afterChange(): void {
    this.reschedule()
    this.broadcastGame()
    if (this.game?.phase === 'ended') {
      if (this.series) this.series = recordRound(this.series, this.game.ranking)
      this.broadcastRoom()
      this.scheduleRemovalOfAbsent()
    }
  }

  /** 対戦が終わったら、いない人を猶予のあとで退室扱いにする(ラウンド制の途中は席を残す) */
  private scheduleRemovalOfAbsent(): void {
    if (this.locked) return
    for (const member of this.members.values()) {
      if (member.sockets.size === 0) this.scheduleLobbyRemoval(member.id)
    }
  }

  /** 状態が変わるたびに、人間の制限時間と自動操作(CPU席・切断中の人)を段取りし直す */
  private reschedule(): void {
    const game = this.game
    if (!game || game.phase === 'ended') {
      this.clearGameTimers()
      return
    }
    const key = decisionKey(game)
    const actors = new Set(whoMustAct(game))
    const now = Date.now()

    for (const [id, timer] of [...this.timers]) {
      if (actors.has(id) && timer.key === key) continue
      this.closeTimer(id, now)
    }
    for (const id of actors) {
      if (this.isAutomated(id)) {
        this.pauseTimer(id, now)
        this.scheduleAutomation(id, game)
      } else if (this.timers.has(id)) {
        this.resumeTimer(id, now)
      } else {
        this.openTimer(id, key, now)
      }
    }
  }

  private isAutomated(id: string): boolean {
    const member = this.members.get(id)
    if (!member || !this.seated.has(id)) return true
    return member.sockets.size === 0
  }

  private openTimer(id: string, key: string, now: number): void {
    this.timers.set(id, { key, startedAt: now, handle: null, pausedAt: null })
    this.resumeTimer(id, now)
  }

  private resumeTimer(id: string, now: number): void {
    const timer = this.timers.get(id)
    if (!timer || timer.handle !== null) return
    const deadline = timer.startedAt + this.timing.timerBaseMs + (this.reserveLeft.get(id) ?? 0)
    const { key } = timer
    timer.pausedAt = null
    timer.handle = setTimeout(() => this.onTimeout(id, key), Math.max(0, deadline - now))
  }

  private pauseTimer(id: string, now: number): void {
    const timer = this.timers.get(id)
    if (!timer || timer.handle === null) return
    clearTimeout(timer.handle)
    timer.handle = null
    timer.pausedAt = now
  }

  /** 答え終わったら、基本時間を超えた分だけ持ち時間を減らす(切断中に代打した分は数えない) */
  private closeTimer(id: string, now: number): void {
    const timer = this.timers.get(id)
    if (!timer) return
    if (timer.handle !== null) clearTimeout(timer.handle)
    this.timers.delete(id)
    const overtime = Math.max(0, (timer.pausedAt ?? now) - timer.startedAt - this.timing.timerBaseMs)
    this.reserveLeft.set(id, Math.max(0, (this.reserveLeft.get(id) ?? 0) - overtime))
  }

  private onTimeout(id: string, key: string): void {
    const game = this.game
    const timer = this.timers.get(id)
    if (!game || !timer || timer.key !== key) return
    this.timers.delete(id)
    this.reserveLeft.set(id, 0)
    if (decisionKey(game) !== key || !whoMustAct(game).includes(id)) {
      this.reschedule()
      return
    }
    const action = timeoutAction(game, id)
    if (!action || !this.apply(action).ok) this.reschedule()
  }

  private scheduleAutomation(id: string, game: GameState): void {
    const tag = `${game.version}|${id}`
    if (this.automation.has(tag)) return
    const key = decisionKey(game)
    const delay = Math.round(cpuDelayMs(game) * this.timing.cpuDelayScale)
    const handle = setTimeout(() => {
      this.automation.delete(tag)
      const current = this.game
      if (!current || current.phase === 'ended') return
      if (decisionKey(current) !== key || !whoMustAct(current).includes(id) || !this.isAutomated(id)) return
      // CPU 席は部屋の設定の強さ、切断した人の代打は「ふつう」で打つ
      const level = this.seated.has(id) ? 'normal' : this.settings.cpuLevel
      const action = decideCpu(current, id, level)
      if (action && this.apply(action).ok) return
      const fallback = timeoutAction(current, id)
      if (fallback) this.apply(fallback)
    }, delay)
    this.automation.set(tag, handle)
  }

  private clearGameTimers(): void {
    for (const timer of this.timers.values()) if (timer.handle !== null) clearTimeout(timer.handle)
    this.timers.clear()
    for (const handle of this.automation.values()) clearTimeout(handle)
    this.automation.clear()
  }

  // --- 送信 -----------------------------------------------------------------

  private broadcastGame(): void {
    for (const id of this.seated) this.sendGameTo(id)
  }

  private sendGameTo(id: string): void {
    const { game, matchId } = this
    const member = this.members.get(id)
    if (!game || !matchId || !member || member.sockets.size === 0 || !this.seated.has(id)) return
    const view = viewFor(game, id)
    if (!view) return
    this.transport.sendGame([...member.sockets], { matchId, view, timer: this.timerView(id) })
  }

  private timerView(id: string): TimerView | null {
    const timer = this.timers.get(id)
    if (!timer) return null
    return {
      key: timer.key,
      elapsedMs: Math.max(0, Date.now() - timer.startedAt),
      baseMs: this.timing.timerBaseMs,
      reserveMs: this.reserveLeft.get(id) ?? 0,
    }
  }

  private broadcastRoom(): void {
    for (const member of this.members.values()) {
      if (member.sockets.size > 0) this.transport.sendRoom([...member.sockets], this.roomView(member.id))
    }
  }

  private roomView(forId: string): RoomView {
    return {
      name: this.name,
      phase: this.phase,
      you: forId,
      hostId: this.hostId,
      settings: { ...this.settings },
      matchId: this.matchId,
      series: this.series ? { ...structuredClone(this.series), standings: standings(this.series) } : null,
      members: [...this.members.values()].map((m) => ({
        id: m.id,
        name: m.name,
        isHost: m.id === this.hostId,
        connected: m.sockets.size > 0,
        seated: this.seated.has(m.id),
      })),
    }
  }

  // --- 補助 -----------------------------------------------------------------

  private memberBySocket(socketId: string): Member | null {
    for (const member of this.members.values()) if (member.sockets.has(socketId)) return member
    return null
  }

  private uniqueName(raw: string, selfId: string | null): string {
    const taken = new Set([...this.members.values()].filter((m) => m.id !== selfId).map((m) => m.name))
    if (!taken.has(raw)) return raw
    for (let i = 2; ; i++) {
      const candidate = `${raw}(${i})`
      if (!taken.has(candidate)) return candidate
    }
  }

  private removeMember(id: string): void {
    this.cancelLobbyRemoval(id)
    this.members.delete(id)
    if (!this.locked) this.seated.delete(id)
    if (this.hostId === id) {
      const next = [...this.members.values()].find((m) => m.sockets.size > 0) ?? this.members.values().next().value
      this.hostId = next?.id ?? null
    }
    this.broadcastRoom()
    this.hooks.onMembersChanged?.()
  }

  private scheduleLobbyRemoval(id: string): void {
    this.cancelLobbyRemoval(id)
    const handle = setTimeout(() => {
      this.lobbyRemovals.delete(id)
      const member = this.members.get(id)
      if (!member || member.sockets.size > 0) return
      if (this.locked && this.seated.has(id)) return
      this.removeMember(id)
    }, this.timing.lobbyGraceMs)
    this.lobbyRemovals.set(id, handle)
  }

  private cancelLobbyRemoval(id: string): void {
    const handle = this.lobbyRemovals.get(id)
    if (handle) clearTimeout(handle)
    this.lobbyRemovals.delete(id)
  }

  dispose(): void {
    this.clearGameTimers()
    for (const handle of this.lobbyRemovals.values()) clearTimeout(handle)
    this.lobbyRemovals.clear()
  }
}
