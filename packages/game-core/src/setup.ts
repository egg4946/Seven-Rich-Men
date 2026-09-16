import { cellAt, createEmptyBoard, putCard } from './board.js'
import { fullDeck, rankOf, removeCards, sortCards } from './cards.js'
import { checkOnlyJoker, recordFinish, startTurnAt } from './flow.js'
import { shuffle, type Rng } from './rng.js'
import { exchangePairs, tributeOptions } from './series.js'
import {
  MAX_PASSES,
  MAX_PLAYERS,
  MIN_PLAYERS,
  RANK,
  type CardId,
  type GameState,
  type Player,
  type PlayerId,
  type Title,
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
  /** 2ラウンド目以降の身分(§9-1)。渡すと、7を置く前にカード交換を行う */
  titles?: Record<PlayerId, Title> | null
}

/**
 * 配札し、7を場に置き、7渡しの選択待ちの状態を返す。
 * 7渡しの選択が全員そろうと resolveGiveSevens() で最初の手番が始まる。
 * 身分を渡した場合は、先にカード交換の選択待ちになる(resolveExchange() のあとで7を置く)。
 */
export function createGame({ players: seeds, rng, titles }: CreateGameOptions): GameState {
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
    const hand = sortCards(deck.slice(cursor, cursor + count))
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
    titles: titles ? { ...titles } : null,
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

  const pairs = titles
    ? exchangePairs(titles).filter((pair) => [pair.upper, pair.lower].every((id) => seeds.some((s) => s.id === id)))
    : []
  if (pairs.length === 0) {
    placeSevens(state)
    return state
  }

  const chosen: Record<PlayerId, CardId[]> = {}
  for (const pair of pairs) {
    const lower = players.find((player) => player.id === pair.lower)
    if (!lower) continue
    // 同じ強さのカードで迷う余地がなければ、本人に聞かずに決める
    const { fixed, pick } = tributeOptions(lower.hand, pair.count)
    if (pick === 0) chosen[lower.id] = fixed
  }
  state.pending = { type: 'exchange', pairs, chosen }
  return state
}

/** カード交換の選択が全員そろったら呼ぶ。全員同時に受け渡し、7を場に置く(§9-2) */
export function resolveExchange(state: GameState): void {
  const pending = state.pending
  if (pending?.type !== 'exchange') return

  // 先に全員の「渡すカード」を手札から抜いてから配る(もらったカードは渡せない)
  const gifts = pending.pairs.flatMap((pair) => [
    { from: pair.upper, to: pair.lower, cards: pending.chosen[pair.upper] ?? [] },
    { from: pair.lower, to: pair.upper, cards: pending.chosen[pair.lower] ?? [] },
  ])
  for (const gift of gifts) {
    const player = state.players.find((p) => p.id === gift.from)
    if (player) player.hand = removeCards(player.hand, gift.cards)
  }
  for (const gift of gifts) {
    state.players.find((p) => p.id === gift.to)?.hand.push(...gift.cards)
  }
  for (const player of state.players) player.hand = sortCards(player.hand)
  for (const pair of pending.pairs) {
    state.log.push({ type: 'CARDS_EXCHANGED', upper: pair.upper, lower: pair.lower, count: pair.count })
  }
  placeSevens(state)
}

/** 全員が手札の7を場に置き、7渡しの選択待ちにする */
function placeSevens(state: GameState): void {
  const { players } = state
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

  state.phase = 'pending'
  state.pending = { type: 'giveSevens', required, chosen: {} }
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
