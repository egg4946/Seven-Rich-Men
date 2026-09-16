import type { OpponentView, PlayerId, PlayerStatus, PlayerView } from '@srm/game-core'

/**
 * 相手の席を、自分の次の人(時計回り)から順に並べる。
 * view.opponents は登録順なので、そのまま並べると画面の並びと手番の順がずれる。
 * 9リバ・イレブンバックで向きが変わっても並びは変えず、席の間の矢印の向きだけを変える。
 */
export function opponentsInSeatOrder(view: PlayerView): OpponentView[] {
  const byId = new Map(view.opponents.map((o) => [o.id, o]))
  const seat = view.seatOrder.indexOf(view.you.id)
  const n = view.seatOrder.length
  const out: OpponentView[] = []
  for (let step = 1; step < n; step++) {
    const opponent = byId.get(view.seatOrder[(seat + step) % n] ?? '')
    if (opponent) out.push(opponent)
  }
  return out
}

/**
 * 今の手番の次に回ってくる人(上がり・脱落した人は飛ばす)。スキップの数は考えない。
 * カード交換・7渡しの間と対戦終了後は null。
 */
export function nextPlayerId(view: PlayerView): PlayerId | null {
  const setup = view.pending?.type === 'giveSevens' || view.pending?.type === 'exchange'
  if (view.phase === 'ended' || setup || !view.turnPlayerId) return null
  const status = new Map<PlayerId, PlayerStatus>([
    [view.you.id, view.you.status],
    ...view.opponents.map((o) => [o.id, o.status] as [PlayerId, PlayerStatus]),
  ])
  const n = view.seatOrder.length
  const start = view.seatOrder.indexOf(view.turnPlayerId)
  if (start === -1) return null
  for (let step = 1; step < n; step++) {
    const id = view.seatOrder[(((start + step * view.direction) % n) + n) % n]
    if (id && status.get(id) === 'playing') return id
  }
  return null
}

/** 対戦の最初に、各プレイヤーが場に置いた7の枚数 */
export function sevensPlaced(view: PlayerView): Map<PlayerId, number> {
  const counts = new Map<PlayerId, number>()
  for (const event of view.log) {
    if (event.type === 'SEVENS_PLACED') counts.set(event.playerId, event.cards.length)
  }
  return counts
}
