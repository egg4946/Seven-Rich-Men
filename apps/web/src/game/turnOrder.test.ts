import { describe, expect, it } from 'vitest'
import { cardId, type OpponentView, type PlayerStatus, type PlayerView } from '@srm/game-core'
import { nextPlayerId, opponentsInSeatOrder, sevensPlaced } from './turnOrder'

/** 席順 p0〜p3 のうち、you から見た視点(使う項目だけ) */
function viewOf(opts: {
  you: string
  turn?: string
  direction?: 1 | -1
  status?: Record<string, PlayerStatus>
  pending?: PlayerView['pending']
}): PlayerView {
  const seatOrder = ['p0', 'p1', 'p2', 'p3']
  const statusOf = (id: string) => opts.status?.[id] ?? 'playing'
  return {
    you: { id: opts.you, name: opts.you, status: statusOf(opts.you) },
    opponents: seatOrder.filter((id) => id !== opts.you).map((id) => ({ id, name: id, status: statusOf(id) }) as OpponentView),
    seatOrder,
    direction: opts.direction ?? 1,
    phase: 'turn',
    turnPlayerId: opts.turn ?? null,
    pending: opts.pending ?? null,
    log: [],
  } as unknown as PlayerView
}

describe('opponentsInSeatOrder', () => {
  it('自分の次の席から時計回りに並べる', () => {
    expect(opponentsInSeatOrder(viewOf({ you: 'p2' })).map((o) => o.id)).toEqual(['p3', 'p0', 'p1'])
    expect(opponentsInSeatOrder(viewOf({ you: 'p0' })).map((o) => o.id)).toEqual(['p1', 'p2', 'p3'])
  })

  it('向きが反転しても並びは変えない', () => {
    expect(opponentsInSeatOrder(viewOf({ you: 'p2', direction: -1 })).map((o) => o.id)).toEqual(['p3', 'p0', 'p1'])
  })
})

describe('nextPlayerId', () => {
  it('手番の向きに沿って次の人を返す', () => {
    expect(nextPlayerId(viewOf({ you: 'p0', turn: 'p3' }))).toBe('p0')
    expect(nextPlayerId(viewOf({ you: 'p0', turn: 'p0', direction: -1 }))).toBe('p3')
  })

  it('上がり・脱落した人は飛ばす', () => {
    expect(nextPlayerId(viewOf({ you: 'p0', turn: 'p0', status: { p1: 'finished', p2: 'eliminated' } }))).toBe('p3')
  })

  it('7渡しの間は次の人を出さない', () => {
    const pending: PlayerView['pending'] = { type: 'giveSevens', yourCount: 1, waitingFor: ['p0'] }
    expect(nextPlayerId(viewOf({ you: 'p0', turn: 'p0', pending }))).toBeNull()
  })
})

describe('sevensPlaced', () => {
  it('ログから、各プレイヤーが置いた7の枚数を数える', () => {
    const view = viewOf({ you: 'p0' })
    view.log = [
      { type: 'SEVENS_PLACED', playerId: 'p1', cards: [cardId('S', 7), cardId('D', 7)] },
      { type: 'SEVENS_PLACED', playerId: 'p3', cards: [cardId('H', 7)] },
    ]
    expect([...sevensPlaced(view)]).toEqual([
      ['p1', 2],
      ['p3', 1],
    ])
  })
})
