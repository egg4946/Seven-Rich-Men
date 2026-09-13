import { cellCardId, put, putCard } from './board.js'
import { isJoker, rankOf, removeCards, sortCards } from './cards.js'
import {
  addSkip,
  afterTurn,
  checkOnlyJoker,
  defeat,
  eliminate,
  holdsOnlyJoker,
  nextActivePlayer,
  playerById,
  playersInOrderFrom,
  recordFinish,
  removeJoker,
  removeSkip,
  unusedCards,
} from './flow.js'
import { resolveGiveSevens } from './setup.js'
import {
  JOKER,
  RANK,
  THREE_SPADE,
  type Action,
  type CardId,
  type Cell,
  type GameState,
  type PlayerId,
  type Rank,
  type ReactionEffect,
  type SelfDeclareEffect,
} from './types.js'

/**
 * 検証済みの操作を state の draft に適用する。
 * 検証は legal.ts の validateAction() で済ませてから呼ぶこと。
 */
export function applyToDraft(state: GameState, action: Action): void {
  switch (action.type) {
    case 'GIVE_SEVENS':
      return giveSevens(state, action.playerId, action.cards)
    case 'DECLARE':
      return declare(state, action.playerId, action.effect)
    case 'PLACE':
      return place(state, action.playerId, action.card)
    case 'USE_JOKER':
      return useJoker(state, action.playerId, action.cell, action.withCard)
    case 'PASS':
      return pass(state, action.playerId)
    case 'BOMB_RANK':
      return bombRank(state, action.rank)
    case 'TEN_DISCARD':
      return tenDiscard(state, action.playerId, action.card)
    case 'REACT':
      return react(state, action.playerId, action.effect)
    case 'JOKER_TAKE':
      return jokerTake(state, action.playerId, action.take)
  }
}

// --- 7渡し -------------------------------------------------------------

function giveSevens(state: GameState, playerId: PlayerId, cards: CardId[]): void {
  const pending = state.pending
  if (pending?.type !== 'giveSevens') return
  pending.chosen[playerId] = cards.slice()
  const waiting = Object.entries(pending.required).some(
    ([id, count]) => count > 0 && pending.chosen[id] === undefined,
  )
  if (!waiting) resolveGiveSevens(state)
}

// --- 手番中の宣言(ろくろっくび・救急車) --------------------------------

export function selfDeclareRank(effect: SelfDeclareEffect): Rank {
  return effect === 'rokurokubi' ? RANK.ROKUROKUBI : RANK.REVERSE
}

function declare(state: GameState, playerId: PlayerId, effect: SelfDeclareEffect): void {
  const player = playerById(state, playerId)
  if (!player) return
  const rank = selfDeclareRank(effect)
  const cards = unusedCards(player, effect, (id) => rankOf(id) === rank).slice(0, 2)
  player.used[effect].push(...cards)
  state.log.push({ type: 'DECLARED', playerId, effect, cards })
  // 手番は終わらない。次の自分の手番が飛ぶ。
  addSkip(state, player)
}

// --- 通常配置 ------------------------------------------------------------

function place(state: GameState, playerId: PlayerId, card: CardId): void {
  const player = playerById(state, playerId)
  if (!player) return

  player.hand = removeCards(player.hand, [card])
  putCard(state.board, card, playerId, false)
  state.log.push({ type: 'PLACED', playerId, card, forced: false })

  // 手札0なら先に上がりを確定し、その後で効果を解決する(§4-1)
  if (player.hand.length === 0) recordFinish(state, player)
  checkOnlyJoker(state)

  switch (rankOf(card)) {
    case RANK.SKIP_NEXT: {
      const next = nextActivePlayer(state, playerId)
      if (next) addSkip(state, next)
      break
    }
    case RANK.EIGHT_CUT:
      addSkip(state, player)
      if (openFourStop(state, playerId)) return
      break
    case RANK.REVERSE:
    case RANK.ELEVEN_BACK:
      state.direction = state.direction === 1 ? -1 : 1
      state.log.push({ type: 'DIRECTION_CHANGED', direction: state.direction })
      break
    case RANK.TEN_DISCARD:
      // 10捨てで手札を0枚にはできない(禁止アガリ)ので、2枚以上ある時だけ発生する
      if (player.hand.length >= 2) {
        state.phase = 'pending'
        state.pending = { type: 'tenDiscard', by: playerId }
        return
      }
      break
    case RANK.BOMB:
      state.phase = 'pending'
      state.pending = { type: 'bombRank', by: playerId }
      return
  }

  afterTurn(state)
}

function pass(state: GameState, playerId: PlayerId): void {
  const player = playerById(state, playerId)
  if (!player) return
  if (player.passesLeft > 0) {
    player.passesLeft -= 1
    state.log.push({ type: 'PASSED', playerId, passesLeft: player.passesLeft })
  } else {
    eliminate(state, player)
  }
  afterTurn(state)
}

// --- Qボンバー・10捨て --------------------------------------------------

function bombRank(state: GameState, rank: Rank): void {
  const pending = state.pending
  if (pending?.type !== 'bombRank') return
  const bomber = playerById(state, pending.by)
  if (!bomber) return

  state.log.push({ type: 'BOMB_DECLARED', playerId: bomber.id, rank })

  // 本人を起点に手番順で解決する
  const order = [bomber, ...playersInOrderFrom(state, bomber.id, false)]
  for (const player of order) {
    if (player.status !== 'playing') continue
    const hit = player.hand.filter((id) => rankOf(id) === rank)
    if (hit.length === 0) continue
    player.hand = removeCards(player.hand, hit)
    for (const id of hit) {
      putCard(state.board, id, player.id, true)
      state.log.push({ type: 'PLACED', playerId: player.id, card: id, forced: true })
    }
  }

  // 「手札0枚」と「ジョーカーだけ」は同時に起きうる。理由が違っても同じ強制敗北なので、
  // 同じループで判定して手番順に記録する(§8)
  for (const player of order) {
    if (player.status !== 'playing') continue
    if (player.hand.length === 0) defeat(state, player, 'bomb')
    else if (holdsOnlyJoker(player)) defeat(state, player, 'onlyJoker')
  }

  afterTurn(state)
}

function tenDiscard(state: GameState, playerId: PlayerId, card: CardId): void {
  const player = playerById(state, playerId)
  if (!player) return
  player.hand = removeCards(player.hand, [card])
  if (isJoker(card)) {
    // 10捨てで出したジョーカーは除外。砂嵐・3スペの対象にもならない。
    removeJoker(state)
  } else {
    putCard(state.board, card, playerId, true)
    state.log.push({ type: 'PLACED', playerId, card, forced: true })
  }
  afterTurn(state)
}

// --- 4止め ---------------------------------------------------------------

/** 宣言できる人がいれば受付を開いて true。いなければ待たずに false(§4-4)。 */
function openFourStop(state: GameState, eightBy: PlayerId): boolean {
  const eligible = state.players
    .filter((p) => p.status === 'playing' && p.id !== eightBy)
    .filter((p) => unusedCards(p, 'fourStop', (id) => rankOf(id) === RANK.FOUR_STOP).length >= 2)
    .map((p) => p.id)
  if (eligible.length === 0) return false
  state.phase = 'pending'
  state.pending = { type: 'fourStop', eightBy, eligible, responses: {} }
  return true
}

function resolveFourStop(state: GameState): void {
  const pending = state.pending
  if (pending?.type !== 'fourStop') return

  // 押した速さは関係なく、8を出した人の次から手番順で先の人
  const winner = playersInOrderFrom(state, pending.eightBy, false).find(
    (p) => pending.responses[p.id] === 'fourStop',
  )
  if (winner) {
    const cards = unusedCards(winner, 'fourStop', (id) => rankOf(id) === RANK.FOUR_STOP).slice(0, 2)
    winner.used.fourStop.push(...cards)
    state.log.push({ type: 'DECLARED', playerId: winner.id, effect: 'fourStop', cards })
    const eightPlayer = playerById(state, pending.eightBy)
    if (eightPlayer) removeSkip(state, eightPlayer)
    addSkip(state, winner)
  }
  afterTurn(state)
}

// --- ジョーカー ----------------------------------------------------------

function useJoker(state: GameState, playerId: PlayerId, cell: Cell, withCard: CardId | null): void {
  const player = playerById(state, playerId)
  if (!player) return

  player.hand = removeCards(player.hand, withCard ? [JOKER, withCard] : [JOKER])
  put(state.board, cell, { placedBy: playerId, forced: true, joker: true })
  state.log.push({ type: 'JOKER_USED', playerId, cell, withCard })
  if (withCard) {
    putCard(state.board, withCard, playerId, true)
    state.log.push({ type: 'PLACED', playerId, card: withCard, forced: true })
  }

  // 禁止アガリ。置いた直後に判定し、ジョーカーの解決はそのまま続ける。
  if (player.hand.length === 0) defeat(state, player, 'jokerFinish')

  openJokerReaction(state, playerId, cell)
}

/** 砂嵐・3スペの条件を満たす効果の一覧 */
export function jokerReactionOptions(state: GameState, playerId: PlayerId): ReactionEffect[] {
  const player = playerById(state, playerId)
  if (!player || player.status !== 'playing') return []
  const options: ReactionEffect[] = []
  if (unusedCards(player, 'sandstorm', (id) => rankOf(id) === RANK.SANDSTORM).length >= 3) {
    options.push('sandstorm')
  }
  if (unusedCards(player, 'threeSpade', (id) => id === THREE_SPADE).length >= 1) {
    options.push('threeSpade')
  }
  return options
}

function openJokerReaction(state: GameState, jokerBy: PlayerId, cell: Cell): void {
  const eligible: Record<PlayerId, ReactionEffect[]> = {}
  for (const player of state.players) {
    const options = jokerReactionOptions(state, player.id)
    if (options.length > 0) eligible[player.id] = options
  }
  if (Object.keys(eligible).length === 0) {
    resolveJoker(state, cell, null)
    return
  }
  state.phase = 'pending'
  state.pending = { type: 'jokerReaction', jokerBy, cell, eligible, responses: {} }
}

function resolveJokerReaction(state: GameState): void {
  const pending = state.pending
  if (pending?.type !== 'jokerReaction') return

  // 砂嵐 > 3スペ。同じ効果なら、ジョーカーを出した人の次から手番順(本人は最後)
  const order = playersInOrderFrom(state, pending.jokerBy, true)
  const winner =
    order.find((p) => pending.responses[p.id] === 'sandstorm') ??
    order.find((p) => pending.responses[p.id] === 'threeSpade') ??
    null

  if (winner) {
    const effect = pending.responses[winner.id] as ReactionEffect
    const cards =
      effect === 'sandstorm'
        ? unusedCards(winner, 'sandstorm', (id) => rankOf(id) === RANK.SANDSTORM).slice(0, 3)
        : [THREE_SPADE]
    winner.used[effect].push(...cards)
    state.log.push({ type: 'DECLARED', playerId: winner.id, effect, cards })
  }
  resolveJoker(state, pending.cell, winner?.id ?? null)
}

/** マスのカードを持ち主に出させ、ジョーカーの行き先を決める(§6 ジョーカー 手順4〜5) */
function resolveJoker(state: GameState, cell: Cell, thiefId: PlayerId | null): void {
  const target = cellCardId(cell)
  const holder = state.players.find((p) => p.hand.includes(target)) ?? null

  if (holder) {
    holder.hand = removeCards(holder.hand, [target])
    put(state.board, cell, { placedBy: holder.id, forced: true })
    state.log.push({ type: 'PLACED', playerId: holder.id, card: target, forced: true })
    if (holder.hand.length === 0) defeat(state, holder, 'jokerForced')
  } else {
    // 置ける場所の検証で弾いているため通常は起こらない
    state.board[cell.suit][cell.rank - 1] = null
  }

  const thief = thiefId ? playerById(state, thiefId) : null
  if (thief) {
    // 宣言者が持ち主本人で、出させられて強制敗北していた場合は受け取れない。
    // 強制敗北した人のジョーカーは除外する(§7)
    if (thief.status === 'playing') {
      thief.hand = sortCards([...thief.hand, JOKER])
      state.log.push({ type: 'JOKER_MOVED', to: thief.id })
    } else {
      removeJoker(state)
    }
    afterTurn(state)
    return
  }
  if (!holder || holder.status !== 'playing') {
    removeJoker(state)
    afterTurn(state)
    return
  }
  state.phase = 'pending'
  state.pending = { type: 'jokerTake', holder: holder.id }
}

function jokerTake(state: GameState, playerId: PlayerId, take: boolean): void {
  const player = playerById(state, playerId)
  if (player && take) {
    player.hand = sortCards([...player.hand, JOKER])
    state.log.push({ type: 'JOKER_MOVED', to: player.id })
  } else {
    removeJoker(state)
  }
  afterTurn(state)
}

// --- 割り込み宣言の返答 ------------------------------------------------

function react(state: GameState, playerId: PlayerId, effect: ReactionEffect | 'skip'): void {
  const pending = state.pending
  if (pending?.type === 'fourStop') {
    pending.responses[playerId] = effect === 'fourStop' ? 'fourStop' : 'skip'
    if (pending.eligible.every((id) => pending.responses[id] !== undefined)) resolveFourStop(state)
    return
  }
  if (pending?.type === 'jokerReaction') {
    pending.responses[playerId] = effect
    const waiting = Object.keys(pending.eligible).some((id) => pending.responses[id] === undefined)
    if (!waiting) resolveJokerReaction(state)
  }
}
