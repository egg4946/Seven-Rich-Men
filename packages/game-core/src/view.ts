import { legalActions, requiredGiveCount, whoMustAct } from './legal.js'
import type {
  Action,
  Board,
  CardId,
  Cell,
  Direction,
  GameEvent,
  GameState,
  Phase,
  Player,
  PlayerId,
  PlayerStatus,
  ReactionEffect,
  RevealEffect,
} from './types.js'

/** 自分から見た他プレイヤー。手札は枚数と、公開されたカードしか見えない。 */
export interface OpponentView {
  id: PlayerId
  name: string
  isCpu: boolean
  handCount: number
  revealed: CardId[]
  passesLeft: number
  skips: number
  status: PlayerStatus
}

export interface SelfView {
  id: PlayerId
  name: string
  hand: CardId[]
  revealed: CardId[]
  used: Record<RevealEffect, CardId[]>
  passesLeft: number
  skips: number
  status: PlayerStatus
}

/**
 * 待ち状態の見え方。割り込み宣言では「誰が宣言できるか」は本人以外に見せない。
 * (受付があること自体は見えるが、これは仕様上許容している §4-4)
 */
export type PendingView =
  | { type: 'giveSevens'; yourCount: number; waitingFor: PlayerId[] }
  | { type: 'bombRank'; by: PlayerId }
  | { type: 'tenDiscard'; by: PlayerId }
  | { type: 'fourStop'; eightBy: PlayerId; yourTurnToAnswer: boolean }
  | {
      type: 'jokerReaction'
      jokerBy: PlayerId
      cell: Cell
      yourOptions: ReactionEffect[]
      yourTurnToAnswer: boolean
    }
  | { type: 'jokerTake'; holder: PlayerId }

export interface PlayerView {
  /** 元の GameState.version。取りこぼし検知と操作の冪等性判定に使う。 */
  version: number
  you: SelfView
  opponents: OpponentView[]
  board: Board
  direction: Direction
  phase: Phase
  /** 手番のプレイヤー(待ち状態の間は、その場面を起こした手番の人) */
  turnPlayerId: PlayerId | null
  pending: PendingView | null
  /** 自分が今取れる操作(7渡しは列挙されないので pending を見る) */
  legalActions: Action[]
  jokerRemoved: boolean
  ranking: PlayerId[]
  log: GameEvent[]
}

function revealedCards(player: Player): CardId[] {
  const used = new Set(Object.values(player.used).flat())
  return player.hand.filter((id) => used.has(id))
}

/**
 * 送信用の視点データを作る。
 *
 * オンライン対戦では GameState をそのまま配ってはいけない。他人の手札や、
 * 7渡しで他人が選んだカードが見えてしまう。必ずこの関数を通したものだけを送ること。
 * CPU にも原則としてこの視点を渡し、内部状態を直接読ませない。
 */
export function viewFor(state: GameState, playerId: PlayerId): PlayerView | null {
  const me = state.players.find((p) => p.id === playerId)
  if (!me) return null

  const actors = whoMustAct(state)
  const pending = state.pending
  let pendingView: PendingView | null = null
  if (pending) {
    switch (pending.type) {
      case 'giveSevens':
        pendingView = {
          type: 'giveSevens',
          yourCount: requiredGiveCount(state, playerId),
          waitingFor: actors,
        }
        break
      case 'bombRank':
      case 'tenDiscard':
        pendingView = { type: pending.type, by: pending.by }
        break
      case 'fourStop':
        pendingView = {
          type: 'fourStop',
          eightBy: pending.eightBy,
          yourTurnToAnswer: actors.includes(playerId),
        }
        break
      case 'jokerReaction':
        pendingView = {
          type: 'jokerReaction',
          jokerBy: pending.jokerBy,
          cell: { ...pending.cell },
          yourOptions: (pending.eligible[playerId] ?? []).slice(),
          yourTurnToAnswer: actors.includes(playerId),
        }
        break
      case 'jokerTake':
        pendingView = { type: 'jokerTake', holder: pending.holder }
        break
    }
  }

  return {
    version: state.version,
    you: {
      id: me.id,
      name: me.name,
      hand: me.hand.slice(),
      revealed: revealedCards(me),
      used: structuredClone(me.used),
      passesLeft: me.passesLeft,
      skips: me.skips,
      status: me.status,
    },
    opponents: state.players
      .filter((p) => p.id !== playerId)
      .map((p) => ({
        id: p.id,
        name: p.name,
        isCpu: p.isCpu,
        handCount: p.hand.length,
        revealed: revealedCards(p),
        passesLeft: p.passesLeft,
        skips: p.skips,
        status: p.status,
      })),
    board: structuredClone(state.board),
    direction: state.direction,
    phase: state.phase,
    turnPlayerId: state.phase === 'ended' ? null : (state.players[state.turnIndex]?.id ?? null),
    pending: pendingView,
    legalActions: legalActions(state, playerId),
    jokerRemoved: state.jokerRemoved,
    ranking: state.ranking.slice(),
    log: structuredClone(state.log),
  }
}
