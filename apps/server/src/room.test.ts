import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { decisionKey, seededRng, whoMustAct, type Action } from '@srm/game-core'
import type { GameUpdate, RoomView } from '@srm/protocol'
import { Room, type RoomTiming } from './room.js'

const TIMING: RoomTiming = { timerBaseMs: 1000, timerReserveMs: 2000, cpuDelayScale: 0.1, lobbyGraceMs: 5000 }
const TOKEN_A = 'token-aaaaaaaaaaaa'
const TOKEN_B = 'token-bbbbbbbbbbbb'

/** 送信を記録する偽の通信路 */
function setup(firstSeed = 1) {
  const rooms = new Map<string, RoomView>()
  const games = new Map<string, GameUpdate>()
  let seed = firstSeed
  const room = new Room(
    'テスト部屋',
    {
      sendRoom: (ids, view) => ids.forEach((id) => rooms.set(id, view)),
      sendGame: (ids, update) => ids.forEach((id) => games.set(id, update)),
    },
    TIMING,
    { rng: () => seededRng(seed++) },
  )
  return { room, rooms, games }
}

function mustJoin(room: Room, socketId: string, name: string, token: string): string {
  const result = room.join(socketId, name, token)
  if (!result.ok) throw new Error(result.error)
  return result.data.you
}

/** 2人が入って、4人戦(CPU2人)を始める */
function startTwo(firstSeed = 1) {
  const s = setup(firstSeed)
  const a = mustJoin(s.room, 'sa', 'A', TOKEN_A)
  const b = mustJoin(s.room, 'sb', 'B', TOKEN_B)
  expect(s.room.updateSettings(a, { seats: 4, cpuLevel: 'normal' }).ok).toBe(true)
  expect(s.room.start(a).ok).toBe(true)
  const matchId = s.rooms.get('sa')?.matchId ?? ''
  return { ...s, a, b, matchId }
}

/** 7渡しで渡せる操作を、その人に届いた画面から作る */
function giveFromView(update: GameUpdate): Action {
  const { view } = update
  if (view.pending?.type !== 'giveSevens') throw new Error('7渡しの場面ではありません')
  return { type: 'GIVE_SEVENS', playerId: view.you.id, cards: view.you.hand.slice(0, view.pending.yourCount) }
}

/** 時間を少しずつ進めて、条件を満たすまで待つ */
function advanceUntil(check: () => boolean, stepMs = 50, maxSteps = 20_000): void {
  for (let i = 0; i < maxSteps && !check(); i++) vi.advanceTimersByTime(stepMs)
  expect(check()).toBe(true)
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('入室', () => {
  it('最初の人が部屋を作った人になり、同じ名前には番号が付く', () => {
    const { room, rooms } = setup()
    const a = mustJoin(room, 'sa', 'たろう', TOKEN_A)
    mustJoin(room, 'sb', 'たろう', TOKEN_B)
    const view = rooms.get('sb')
    expect(view?.hostId).toBe(a)
    expect(view?.members.map((m) => m.name)).toEqual(['たろう', 'たろう(2)'])
  })

  it('7人目は入れない', () => {
    const { room } = setup()
    for (let i = 0; i < 6; i++) mustJoin(room, `s${i}`, `P${i}`, `token-${i}-xxxxxxxxxxxx`)
    expect(room.join('s7', 'P7', 'token-7-xxxxxxxxxxxx')).toMatchObject({ ok: false, code: 'room_full' })
  })

  it('対戦中は新しい人は入れないが、同じトークンなら同じ席に戻れる', () => {
    const { room, games, a } = startTwo()
    expect(room.join('sc', 'C', 'token-cccccccccccc')).toMatchObject({ ok: false, code: 'in_progress' })

    room.disconnect('sa')
    const back = room.join('sa2', 'A', TOKEN_A)
    expect(back).toMatchObject({ ok: true, data: { you: a } })
    expect(games.get('sa2')?.view.you.id).toBe(a)
  })

  it('同じ接続から別のトークンで入ることはできない', () => {
    const { room } = setup()
    mustJoin(room, 'sa', 'A', TOKEN_A)
    expect(room.join('sa', 'B', TOKEN_B)).toMatchObject({ ok: false, code: 'forbidden' })
    expect(room.memberCount).toBe(1)
    expect(room.join('sa', 'A', TOKEN_A).ok).toBe(true)
  })

  it('ロビーで切断した人は猶予のあと退室し、部屋を作った人は引き継がれる', () => {
    const { room, rooms } = setup()
    mustJoin(room, 'sa', 'A', TOKEN_A)
    const b = mustJoin(room, 'sb', 'B', TOKEN_B)
    room.disconnect('sa')
    vi.advanceTimersByTime(TIMING.lobbyGraceMs + 10)
    expect(rooms.get('sb')?.members.map((m) => m.name)).toEqual(['B'])
    expect(rooms.get('sb')?.hostId).toBe(b)
  })
})

describe('対戦の開始', () => {
  it('開始できるのは部屋を作った人だけ', () => {
    const { room } = setup()
    mustJoin(room, 'sa', 'A', TOKEN_A)
    const b = mustJoin(room, 'sb', 'B', TOKEN_B)
    expect(room.start(b)).toMatchObject({ ok: false, code: 'forbidden' })
  })

  it('空いた席はCPUで埋まり、各人には自分の視点だけが届く', () => {
    const { games, a, b } = startTwo()
    const va = games.get('sa')?.view
    const vb = games.get('sb')?.view
    expect(va?.you.id).toBe(a)
    expect(vb?.you.id).toBe(b)
    expect(va?.seatOrder).toHaveLength(4)
    expect(va?.opponents.filter((o) => o.isCpu)).toHaveLength(2)
    for (const opponent of va?.opponents ?? []) expect(opponent).not.toHaveProperty('hand')
  })
})

describe('操作の検証', () => {
  it('古い更新番号・別の対戦IDの操作と、他人になりすました操作は拒否される', () => {
    const { room, games, a, b, matchId } = startTwo()
    const version = room.state?.version ?? 0
    const pass: Action = { type: 'PASS', playerId: a }
    expect(matchId).not.toBe('')
    expect(games.get('sa')?.matchId).toBe(matchId)
    expect(room.act(a, matchId, version + 1, pass)).toMatchObject({ ok: false, code: 'stale' })
    expect(room.act(a, 'old-match', version, pass)).toMatchObject({ ok: false, code: 'stale' })
    expect(room.act(a, matchId, version, { type: 'PASS', playerId: b })).toMatchObject({ ok: false, code: 'forbidden' })
    expect(room.act('p_unknown', matchId, version, pass)).toMatchObject({ ok: false, code: 'forbidden' })
  })

  it('同時に答える受付では、他の人の回答で更新番号が進んでも同じ受付への回答を受け付ける', () => {
    let started: ReturnType<typeof startTwo> | null = null
    for (let seed = 1; seed < 500 && !started; seed++) {
      const s = startTwo(seed)
      const state = s.room.state!
      if (state.pending?.type === 'giveSevens' && [s.a, s.b].every((id) => whoMustAct(state).includes(id))) started = s
      else s.room.dispose()
    }
    expect(started).not.toBeNull()
    const { room, games, a, b, matchId } = started!
    const fromA = games.get('sa')!
    const fromB = games.get('sb')!
    expect(fromA.view.version).toBe(fromB.view.version)

    // 後の席の人の回答が先に届いても、前の席の人の回答は拒否されない
    expect(room.act(b, matchId, fromB.view.version, giveFromView(fromB)).ok).toBe(true)
    expect(room.act(a, matchId, fromA.view.version, giveFromView(fromA)).ok).toBe(true)
    // 同じ回答の二重送信は拒否される
    expect(room.act(a, matchId, fromA.view.version, giveFromView(fromA))).toMatchObject({ ok: false, code: 'stale' })
  })

  it('同じ操作を二重に送っても、2回目は古い更新番号として拒否される', () => {
    const { room, games, a, b, matchId } = startTwo()
    // 人間のどちらかが手番で操作できるまで進める
    advanceUntil(() => {
      const state = room.state
      return !!state && state.phase === 'turn' && [a, b].includes(whoMustAct(state)[0] ?? '')
    })
    const actor = whoMustAct(room.state!)[0]!
    const update = games.get(actor === a ? 'sa' : 'sb')!
    const pass: Action = { type: 'PASS', playerId: actor }
    expect(room.act(actor, matchId, update.view.version, pass).ok).toBe(true)
    expect(room.act(actor, matchId, update.view.version, pass)).toMatchObject({ ok: false, code: 'stale' })
  })
})

describe('制限時間と自動操作', () => {
  it('答えない人は時間切れで自動操作され、最後まで対戦が進み、再戦では対戦IDが変わる', () => {
    const { room, rooms, games, a, matchId } = startTwo()
    advanceUntil(() => rooms.get('sa')?.phase === 'result', 500)
    const final = games.get('sa')?.view
    expect(final?.phase).toBe('ended')
    expect(final?.ranking).toHaveLength(4)
    expect(games.get('sb')?.view.ranking).toEqual(final?.ranking)

    expect(room.start(a).ok).toBe(true)
    const next = rooms.get('sa')?.matchId
    expect(next).toBeTruthy()
    expect(next).not.toBe(matchId)
    expect(games.get('sa')?.matchId).toBe(next)
  })

  it('基本時間を超えて答えると、超えた分だけ持ち時間が減る', () => {
    const { room, games, a, b, matchId } = startTwo()
    const socketOf = (id: string) => (id === a ? 'sa' : 'sb')
    advanceUntil(() => room.openTimerIds().length > 0)
    const actor = room.openTimerIds()[0]!
    const first = games.get(socketOf(actor))!
    expect(first.timer).toMatchObject({ baseMs: 1000, reserveMs: 2000 })

    vi.advanceTimersByTime(1500)
    const view = games.get(socketOf(actor))!.view
    const action: Action | undefined =
      view.pending?.type === 'giveSevens'
        ? { type: 'GIVE_SEVENS', playerId: actor, cards: view.you.hand.slice(0, view.pending.yourCount) }
        : (view.legalActions.find((x) => x.type === 'PASS') ??
          view.legalActions.find((x) => x.type === 'REACT' && x.effect === 'skip') ??
          view.legalActions.find((x) => x.type !== 'DECLARE'))
    expect(action).toBeDefined()
    expect(room.act(actor, matchId, view.version, action!).ok).toBe(true)

    // 次にこの人の制限時間が始まったとき、持ち時間は 2000 - 500 = 1500 になっている
    const firstKey = first.timer!.key
    advanceUntil(() => {
      const timer = games.get(socketOf(actor))?.timer
      return !!timer && timer.key !== firstKey
    })
    expect(games.get(socketOf(actor))?.timer?.reserveMs).toBe(1500)
  })

  it('切断してすぐ同じ場面に戻っても、経過時間は引き継がれ基本時間は回復しない', () => {
    const { room, games, a } = startTwo()
    advanceUntil(() => room.openTimerIds().length > 0)
    const actor = room.openTimerIds()[0]!
    const [socket, token] = actor === a ? ['sa', TOKEN_A] : ['sb', TOKEN_B]
    const key = games.get(socket)!.timer!.key

    vi.advanceTimersByTime(900)
    room.disconnect(socket)
    expect(room.join(`${socket}-again`, 'X', token).ok).toBe(true)
    const timer = games.get(`${socket}-again`)?.timer
    expect(timer?.key).toBe(key)
    expect(timer?.elapsedMs).toBeGreaterThanOrEqual(900)
    expect(timer?.elapsedMs).toBeLessThan(TIMING.timerBaseMs)
  })

  it('切断した人の番は、制限時間を待たずに CPU が代わりに操作する', () => {
    const { room, b } = startTwo()
    room.disconnect('sb')
    advanceUntil(() => !!room.state && whoMustAct(room.state).includes(b), 20)
    expect(room.openTimerIds()).not.toContain(b)

    const key = decisionKey(room.state!)
    // CPU の考える時間(0.1倍で最大150ms)が過ぎれば、基本時間(1000ms)より前に答えている
    vi.advanceTimersByTime(300)
    const state = room.state!
    expect(decisionKey(state) === key && whoMustAct(state).includes(b)).toBe(false)
  })
})
