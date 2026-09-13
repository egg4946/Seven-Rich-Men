import { putCard } from './board.js'
import { isJoker } from './cards.js'
import {
  JOKER,
  type CardId,
  type DefeatReason,
  type GameState,
  type Player,
  type PlayerId,
  type RevealEffect,
} from './types.js'

/**
 * 手番の進行と、勝敗の記録。
 * どの関数も state の draft を直接変更する(applyAction が clone した後に呼ぶ)。
 */

export function playerById(state: GameState, id: PlayerId): Player | null {
  return state.players.find((p) => p.id === id) ?? null
}

export function currentPlayer(state: GameState): Player | null {
  return state.players[state.turnIndex] ?? null
}

export function activePlayers(state: GameState): Player[] {
  return state.players.filter((p) => p.status === 'playing')
}

function indexOf(state: GameState, id: PlayerId): number {
  return state.players.findIndex((p) => p.id === id)
}

/**
 * id の次の人から、現在の手番の向きで1周ぶん並べる。
 * includeSelf なら最後に id 本人を含める。優先順位や解決順に使う。
 */
export function playersInOrderFrom(state: GameState, id: PlayerId, includeSelf: boolean): Player[] {
  const n = state.players.length
  const start = indexOf(state, id)
  if (start < 0) return []
  const order: Player[] = []
  for (let step = 1; step < n; step++) {
    const player = state.players[(((start + step * state.direction) % n) + n) % n]
    if (player) order.push(player)
  }
  const self = state.players[start]
  if (includeSelf && self) order.push(self)
  return order
}

/** id の次にいる対戦中のプレイヤー(本人は除く) */
export function nextActivePlayer(state: GameState, id: PlayerId): Player | null {
  return playersInOrderFrom(state, id, false).find((p) => p.status === 'playing') ?? null
}

/** 手札のうち、条件を満たし、かつその効果に未使用のカード */
export function unusedCards(
  player: Player,
  effect: RevealEffect,
  predicate: (id: CardId) => boolean,
): CardId[] {
  const used = player.used[effect]
  return player.hand.filter((id) => predicate(id) && !used.includes(id))
}

export function addSkip(state: GameState, player: Player): void {
  player.skips += 1
  state.log.push({ type: 'SKIP_ADDED', playerId: player.id, skips: player.skips })
}

export function removeSkip(state: GameState, player: Player): void {
  if (player.skips <= 0) return
  player.skips -= 1
  state.log.push({ type: 'SKIP_REMOVED', playerId: player.id, skips: player.skips })
}

export function removeJoker(state: GameState): void {
  if (state.jokerRemoved) return
  state.jokerRemoved = true
  state.log.push({ type: 'JOKER_REMOVED' })
}

export function recordFinish(state: GameState, player: Player): void {
  if (player.status !== 'playing') return
  player.status = 'finished'
  state.finishOrder.push(player.id)
  state.log.push({ type: 'FINISHED', playerId: player.id })
}

export function defeat(state: GameState, player: Player, reason: DefeatReason): void {
  if (player.status !== 'playing') return
  if (player.hand.includes(JOKER)) removeJoker(state)
  player.hand = []
  player.status = 'defeated'
  state.defeatedOrder.push(player.id)
  state.log.push({ type: 'DEFEATED', playerId: player.id, reason })
}

/** パス上限超過による脱落。手札を全て場に置き、ジョーカーは除外する。 */
export function eliminate(state: GameState, player: Player): void {
  if (player.status !== 'playing') return
  for (const id of player.hand) {
    if (isJoker(id)) {
      removeJoker(state)
      continue
    }
    putCard(state.board, id, player.id, true)
    state.log.push({ type: 'PLACED', playerId: player.id, card: id, forced: true })
  }
  player.hand = []
  player.status = 'eliminated'
  state.eliminatedOrder.push(player.id)
  state.log.push({ type: 'ELIMINATED', playerId: player.id })
}

/** 手札がジョーカー1枚だけか(§7-3) */
export function holdsOnlyJoker(player: Player): boolean {
  return player.hand.length === 1 && player.hand[0] === JOKER
}

/**
 * §7-3: 手札がジョーカー1枚だけになった対戦中プレイヤーを強制敗北にする。
 * 複数いる場合に備え、現在の手番の人から手番の向きどおりに記録する(§8)。
 */
export function checkOnlyJoker(state: GameState): void {
  const current = state.players[state.turnIndex]
  if (!current) return
  for (const player of [current, ...playersInOrderFrom(state, current.id, false)]) {
    if (player.status === 'playing' && holdsOnlyJoker(player)) defeat(state, player, 'onlyJoker')
  }
}

/** 手番の行動(と、それに続く効果)が全て終わったときに呼ぶ */
export function afterTurn(state: GameState): void {
  state.pending = null
  state.phase = 'turn'
  checkOnlyJoker(state)
  if (activePlayers(state).length <= 1) {
    endGame(state)
    return
  }
  advanceTurn(state)
}

/** 手番の向きに進め、スキップ回数が残っている人は1減らして飛ばす */
export function advanceTurn(state: GameState): void {
  const n = state.players.length
  const maxSkips = state.players.reduce((max, p) => Math.max(max, p.skips), 0)
  const limit = n * (maxSkips + 2)
  let index = state.turnIndex
  for (let i = 0; i < limit; i++) {
    index = (((index + state.direction) % n) + n) % n
    const player = state.players[index]
    if (!player || player.status !== 'playing') continue
    if (player.skips > 0) {
      player.skips -= 1
      state.log.push({ type: 'SKIPPED', playerId: player.id })
      continue
    }
    state.turnIndex = index
    state.log.push({ type: 'TURN_STARTED', playerId: player.id })
    return
  }
  endGame(state)
}

/** 指定したプレイヤーから手番を始める(本人が対戦中でなければ次の人) */
export function startTurnAt(state: GameState, index: number): void {
  state.pending = null
  state.phase = 'turn'
  if (activePlayers(state).length <= 1) {
    endGame(state)
    return
  }
  const player = state.players[index]
  if (player?.status === 'playing' && player.skips === 0) {
    state.turnIndex = index
    state.log.push({ type: 'TURN_STARTED', playerId: player.id })
    return
  }
  state.turnIndex = index
  advanceTurn(state)
}

export function endGame(state: GameState): void {
  state.phase = 'ended'
  state.pending = null
  const survivors = activePlayers(state).map((p) => p.id)
  // 通常上がり > 生き残り > パス脱落 > 強制敗北(§8)
  state.ranking = [
    ...state.finishOrder,
    ...survivors,
    ...state.eliminatedOrder,
    ...state.defeatedOrder,
  ]
  state.log.push({ type: 'GAME_ENDED', ranking: state.ranking })
}
