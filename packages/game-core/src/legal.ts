import { selfDeclareRank } from './actions.js'
import { canPlace, cellCardId, jokerWithCell } from './board.js'
import { rankOf } from './cards.js'
import { currentPlayer, playerById, unusedCards } from './flow.js'
import {
  JOKER,
  RANK_MAX,
  RANK_MIN,
  SUITS,
  type Action,
  type GameState,
  type PlayerId,
  type SelfDeclareEffect,
} from './types.js'

/** 今、入力を待たれているプレイヤー(CPUの駆動や制限時間の管理に使う) */
export function whoMustAct(state: GameState): PlayerId[] {
  if (state.phase === 'ended') return []
  const pending = state.pending
  if (!pending) {
    const player = currentPlayer(state)
    return player?.status === 'playing' ? [player.id] : []
  }
  switch (pending.type) {
    case 'giveSevens':
      return Object.entries(pending.required)
        .filter(([id, count]) => count > 0 && pending.chosen[id] === undefined)
        .map(([id]) => id)
    case 'bombRank':
    case 'tenDiscard':
      return [pending.by]
    case 'fourStop':
      return pending.eligible.filter((id) => pending.responses[id] === undefined)
    case 'jokerReaction':
      return Object.keys(pending.eligible).filter((id) => pending.responses[id] === undefined)
    case 'jokerTake':
      return [pending.holder]
  }
}

/**
 * 「誰かが答えるべき場面」を識別するキー。制限時間の管理に使う。
 * 手番中の宣言(ろくろっくび・救急車)では変わらないので、制限時間はリセットされない。
 */
export function decisionKey(state: GameState): string {
  const turns = state.log.reduce((n, e) => n + (e.type === 'TURN_STARTED' ? 1 : 0), 0)
  return `${turns}|${state.phase}|${state.pending?.type ?? 'turn'}`
}

/**
 * そのプレイヤーが今取れる操作の一覧。CPUもUIもこの範囲だけを候補にする。
 * 7渡し(GIVE_SEVENS)は組み合わせが多いため列挙しない。枚数は view の pending を見ること。
 */
export function legalActions(state: GameState, playerId: PlayerId): Action[] {
  if (!whoMustAct(state).includes(playerId)) return []
  const player = playerById(state, playerId)
  if (!player) return []
  const pending = state.pending

  if (pending) {
    switch (pending.type) {
      case 'giveSevens':
        return []
      case 'bombRank': {
        const ranks: Action[] = []
        for (let rank = RANK_MIN; rank <= RANK_MAX; rank++) {
          ranks.push({ type: 'BOMB_RANK', playerId, rank })
        }
        return ranks
      }
      case 'tenDiscard':
        return player.hand.map((card) => ({ type: 'TEN_DISCARD', playerId, card }))
      case 'fourStop':
        return [
          { type: 'REACT', playerId, effect: 'fourStop' },
          { type: 'REACT', playerId, effect: 'skip' },
        ]
      case 'jokerReaction':
        return [
          ...(pending.eligible[playerId] ?? []).map(
            (effect): Action => ({ type: 'REACT', playerId, effect }),
          ),
          { type: 'REACT', playerId, effect: 'skip' },
        ]
      case 'jokerTake':
        return [
          { type: 'JOKER_TAKE', playerId, take: true },
          { type: 'JOKER_TAKE', playerId, take: false },
        ]
    }
  }

  const actions: Action[] = []

  // 手番中の宣言(カードを出すまで何度でも)
  for (const effect of ['rokurokubi', 'ambulance'] as SelfDeclareEffect[]) {
    const rank = selfDeclareRank(effect)
    if (unusedCards(player, effect, (id) => rankOf(id) === rank).length >= 2) {
      actions.push({ type: 'DECLARE', playerId, effect })
    }
  }

  for (const card of player.hand) {
    if (canPlace(state.board, card)) actions.push({ type: 'PLACE', playerId, card })
  }

  if (player.hand.includes(JOKER)) {
    for (const suit of SUITS) {
      for (let rank = RANK_MIN; rank <= RANK_MAX; rank++) {
        const cell = { suit, rank }
        const target = cellCardId(cell)
        // ジョーカーを置けるマスは通常配置と同じ(7から繋がった列の端。飛び地の隣は不可)
        if (!canPlace(state.board, target)) continue
        // そのマスのカードを、自分以外の対戦中プレイヤーが持っていること
        const holder = state.players.find((p) => p.hand.includes(target))
        if (!holder || holder.id === playerId || holder.status !== 'playing') continue

        actions.push({ type: 'USE_JOKER', playerId, cell, withCard: null })
        const withCell = jokerWithCell(state.board, cell)
        if (withCell && player.hand.includes(cellCardId(withCell))) {
          actions.push({ type: 'USE_JOKER', playerId, cell, withCard: cellCardId(withCell) })
        }
      }
    }
  }

  actions.push({ type: 'PASS', playerId })
  return actions
}

/** 7渡しで、そのプレイヤーが渡す枚数(選択済み・対象外なら0) */
export function requiredGiveCount(state: GameState, playerId: PlayerId): number {
  const pending = state.pending
  if (pending?.type !== 'giveSevens' || pending.chosen[playerId] !== undefined) return 0
  return pending.required[playerId] ?? 0
}

/** 操作が今適用できるか。できなければ理由を返す。 */
export function validateAction(state: GameState, action: Action): string | null {
  if (state.phase === 'ended') return 'ゲームは終了しています'
  if (!whoMustAct(state).includes(action.playerId)) return '今は操作できません'

  if (action.type === 'GIVE_SEVENS') {
    if (state.pending?.type !== 'giveSevens') return '7渡しの場面ではありません'
    const player = playerById(state, action.playerId)
    if (!player) return 'プレイヤーがいません'
    const count = requiredGiveCount(state, action.playerId)
    if (action.cards.length !== count) return `${count}枚選んでください`
    if (new Set(action.cards).size !== action.cards.length) return '同じカードが含まれています'
    if (!action.cards.every((id) => player.hand.includes(id))) return 'そのカードを持っていません'
    return null
  }

  const legal = legalActions(state, action.playerId)
  return legal.some((candidate) => sameAction(candidate, action)) ? null : 'その操作はできません'
}

function sameAction(a: Action, b: Action): boolean {
  if (a.type !== b.type || a.playerId !== b.playerId) return false
  switch (a.type) {
    case 'DECLARE':
      return b.type === 'DECLARE' && a.effect === b.effect
    case 'PLACE':
      return b.type === 'PLACE' && a.card === b.card
    case 'USE_JOKER':
      return (
        b.type === 'USE_JOKER' &&
        a.cell.suit === b.cell.suit &&
        a.cell.rank === b.cell.rank &&
        a.withCard === b.withCard
      )
    case 'PASS':
      return true
    case 'BOMB_RANK':
      return b.type === 'BOMB_RANK' && a.rank === b.rank
    case 'TEN_DISCARD':
      return b.type === 'TEN_DISCARD' && a.card === b.card
    case 'REACT':
      return b.type === 'REACT' && a.effect === b.effect
    case 'JOKER_TAKE':
      return b.type === 'JOKER_TAKE' && a.take === b.take
    case 'GIVE_SEVENS':
      return false
  }
}
