import { cellAt, createEmptyBoard, putCard } from './board.js'
import { fullDeck, rankOf, removeCards, sortCards } from './cards.js'
import { checkOnlyJoker, recordFinish, startTurnAt } from './flow.js'
import { shuffle, type Rng } from './rng.js'
import {
  MAX_PASSES,
  MAX_PLAYERS,
  MIN_PLAYERS,
  RANK,
  type CardId,
  type GameState,
  type Player,
  type PlayerId,
} from './types.js'

export interface PlayerSeed {
  id: PlayerId
  name: string
  isCpu: boolean
}

export interface CreateGameOptions {
  players: PlayerSeed[]
  /** 配札にのみ使用する。状態には一切残さない(rng.ts の注意書きを参照)。 */
  rng: Rng
}

/**
 * 配札し、7を場に置き、7渡しの選択待ちの状態を返す。
 * 7渡しの選択が全員そろうと resolveGiveSevens() で最初の手番が始まる。
 */
export function createGame({ players: seeds, rng }: CreateGameOptions): GameState {
  if (seeds.length < MIN_PLAYERS || seeds.length > MAX_PLAYERS) {
    throw new Error(`プレイヤーは${MIN_PLAYERS}〜${MAX_PLAYERS}人です`)
  }
  if (new Set(seeds.map((s) => s.id)).size !== seeds.length) {
    throw new Error('プレイヤーIDが重複しています')
  }

  const n = seeds.length
  const deck = shuffle(fullDeck(), rng)
  const base = Math.floor(deck.length / n)
  // 割り切れない端数は、ランダムに選んだプレイヤーに1枚ずつ配る
  const extra = new Set(shuffle([...Array(n).keys()], rng).slice(0, deck.length % n))

  let cursor = 0
  const players: Player[] = seeds.map((seed, i) => {
    const count = base + (extra.has(i) ? 1 : 0)
    const hand = deck.slice(cursor, cursor + count)
    cursor += count
    return {
      id: seed.id,
      name: seed.name,
      isCpu: seed.isCpu,
      hand,
      passesLeft: MAX_PASSES,
      skips: 0,
      status: 'playing',
      used: { sandstorm: [], threeSpade: [], fourStop: [], rokurokubi: [], ambulance: [] },
    }
  })

  const state: GameState = {
    players,
    board: createEmptyBoard(),
    turnIndex: 0,
    direction: 1,
    phase: 'pending',
    pending: null,
    jokerRemoved: false,
    version: 0,
    finishOrder: [],
    eliminatedOrder: [],
    defeatedOrder: [],
    ranking: [],
    log: [],
  }

  // 全員が手札の7を場に置く
  const required: Record<PlayerId, number> = {}
  for (const player of players) {
    const sevens = player.hand.filter((id) => rankOf(id) === RANK.START)
    for (const id of sevens) putCard(state.board, id, player.id, false)
    player.hand = sortCards(removeCards(player.hand, sevens))
    if (sevens.length > 0) {
      state.log.push({ type: 'SEVENS_PLACED', playerId: player.id, cards: sevens })
      required[player.id] = Math.min(sevens.length, player.hand.length)
    }
  }

  state.pending = { type: 'giveSevens', required, chosen: {} }
  return state
}

/** 7渡しの選択が全員そろったら呼ぶ。全員同時に受け渡し、♦7を出した人から手番を始める。 */
export function resolveGiveSevens(state: GameState): void {
  const pending = state.pending
  if (pending?.type !== 'giveSevens') return

  const n = state.players.length
  // 先に全員の「渡すカード」を確定させてから配る(もらったカードは渡せない)
  const gifts = state.players.map((player) => pending.chosen[player.id] ?? ([] as CardId[]))

  state.players.forEach((player, i) => {
    player.hand = removeCards(player.hand, gifts[i] ?? [])
  })
  state.players.forEach((player, i) => {
    const cards = gifts[i] ?? []
    if (cards.length === 0) return
    const receiver = state.players[(i + 1) % n]
    if (!receiver) return
    receiver.hand.push(...cards)
    state.log.push({ type: 'SEVENS_GIVEN', from: player.id, to: receiver.id, count: cards.length })
  })

  for (const player of state.players) {
    player.hand = sortCards(player.hand)
    // 7を多く出した人は、渡した結果0枚になりうる(6人戦など)。上がりとして扱う。
    if (player.hand.length === 0) recordFinish(state, player)
  }
  checkOnlyJoker(state)

  const diamondSeven = cellAt(state.board, 'D', RANK.START)
  const starter = state.players.findIndex((p) => p.id === diamondSeven?.placedBy)
  startTurnAt(state, Math.max(0, starter))
}
