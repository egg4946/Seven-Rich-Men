import { afterEach, describe, expect, it, vi } from 'vitest'
import { cardId, type GameEvent } from '@srm/game-core'
import { cutinsFor, seatPopsFor } from './events'
import { useFx } from './store'

const YOU = 'you'
const name = (id: string) => (id === YOU ? 'あなた' : id.toUpperCase())

describe('cutinsFor', () => {
  it('効果のあるカードの通常配置だけカットインにする', () => {
    const events: GameEvent[] = [
      { type: 'PLACED', playerId: 'cpu1', card: cardId('S', 8), forced: false },
      { type: 'PLACED', playerId: 'cpu1', card: cardId('S', 6), forced: false },
      { type: 'PLACED', playerId: 'cpu2', card: cardId('H', 9), forced: true },
    ]
    const cutins = cutinsFor(events, name, YOU)
    expect(cutins).toHaveLength(1)
    expect(cutins[0]).toMatchObject({ kind: 'slash', title: '8切り', by: 'CPU1', mine: false })
  })

  it('Qボンバーは指定したランクを添えて、場を強く揺らす', () => {
    const [bomb] = cutinsFor([{ type: 'BOMB_DECLARED', playerId: YOU, rank: 12 }], name, YOU)
    expect(bomb).toMatchObject({ kind: 'bomb', sub: '全員が Q を場に出す', mine: true, shake: 2 })
  })

  it('手番の知らせとスキップは自分のときだけ出す', () => {
    const events: GameEvent[] = [
      { type: 'TURN_STARTED', playerId: 'cpu1' },
      { type: 'SKIPPED', playerId: 'cpu1' },
      { type: 'SKIPPED', playerId: YOU },
      { type: 'TURN_STARTED', playerId: YOU },
    ]
    expect(cutinsFor(events, name, YOU).map((c) => c.kind)).toEqual(['notice', 'turn'])
  })

  it('1位が自分なら終了の演出を自分のものにする(紙吹雪)', () => {
    expect(cutinsFor([{ type: 'GAME_ENDED', ranking: [YOU, 'cpu1'] }], name, YOU)[0]?.mine).toBe(true)
    expect(cutinsFor([{ type: 'GAME_ENDED', ranking: ['cpu1', YOU] }], name, YOU)[0]?.mine).toBe(false)
  })
})

describe('seatPopsFor', () => {
  it('自分は除き、同じ人は最後の出来事を使う', () => {
    const events: GameEvent[] = [
      { type: 'PLACED', playerId: YOU, card: cardId('S', 5), forced: false },
      { type: 'PLACED', playerId: 'cpu1', card: cardId('D', 3), forced: false },
      { type: 'PASSED', playerId: 'cpu1', passesLeft: 2 },
      { type: 'PLACED', playerId: 'cpu2', card: cardId('C', 12), forced: true },
    ]
    expect(seatPopsFor(events, YOU)).toEqual([
      { playerId: 'cpu1', text: 'パス', tone: 'amber' },
      { playerId: 'cpu2', text: '♣Q', tone: 'slate' },
    ])
  })
})

describe('useFx の待ち行列', () => {
  afterEach(() => {
    useFx.getState().clear()
    vi.useRealTimers()
  })

  const placed = (rank: number): GameEvent => ({ type: 'PLACED', playerId: 'cpu1', card: cardId('S', rank), forced: false })

  it('1つずつ順番に出し、上限を超えたら古いものから捨てる(上がりは残す)', () => {
    vi.useFakeTimers()
    const fx = useFx.getState()
    fx.emit([{ type: 'FINISHED', playerId: 'cpu2' }], name, YOU)
    fx.emit([placed(5), placed(8), placed(9), placed(10), placed(11)], name, YOU)

    const state = useFx.getState()
    expect(state.current?.kind).toBe('finish')
    expect(state.queue.map((c) => c.title)).toEqual(['9リバ', '10捨て', 'イレブンバック'])

    vi.advanceTimersByTime(state.current?.durationMs ?? 0)
    expect(useFx.getState().current?.title).toBe('9リバ')
  })

  it('まだ出ていない手番の知らせは、次の出来事が来たら捨てる', () => {
    vi.useFakeTimers()
    const fx = useFx.getState()
    fx.emit([placed(8), { type: 'TURN_STARTED', playerId: YOU }], name, YOU)
    expect(useFx.getState().queue.map((c) => c.kind)).toEqual(['turn'])
    fx.emit([placed(5)], name, YOU)
    expect(useFx.getState().queue.map((c) => c.kind)).toEqual(['skip'])
  })
})
