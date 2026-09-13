export const SUITS = ['S', 'H', 'D', 'C'] as const
export type Suit = (typeof SUITS)[number]

/** A=1 ... K=13。AとKは繋がらない(ラップしない)。 */
export type Rank = number
export const RANK_MIN = 1
export const RANK_MAX = 13

/** カードID。通常カードは `${suit}${rank}`(例: S7, H12)、ジョーカーは JOKER。 */
export type CardId = string
export const JOKER: CardId = 'JOKER'

/** 効果を持つランク(docs/RULES.md §5) */
export const RANK = {
  SANDSTORM: 3,
  FOUR_STOP: 4,
  SKIP_NEXT: 5,
  ROKUROKUBI: 6,
  START: 7,
  EIGHT_CUT: 8,
  REVERSE: 9,
  TEN_DISCARD: 10,
  ELEVEN_BACK: 11,
  BOMB: 12,
} as const

/** 3スペに使うカード */
export const THREE_SPADE: CardId = 'S3'

export const MAX_PASSES = 3
export const MIN_PLAYERS = 3
export const MAX_PLAYERS = 6

export type PlayerId = string

export type PlayerStatus =
  /** 対戦中 */
  | 'playing'
  /** 通常配置で手札を0にした(上がり) */
  | 'finished'
  /** パス上限を超えて脱落した */
  | 'eliminated'
  /** 強制敗北した(§7) */
  | 'defeated'

/** 公開して使う効果。使用済みはこの単位で記録する(§4-2)。 */
export type RevealEffect = 'sandstorm' | 'threeSpade' | 'fourStop' | 'rokurokubi' | 'ambulance'
/** 手番中の宣言 */
export type SelfDeclareEffect = 'rokurokubi' | 'ambulance'
/** 割り込み宣言 */
export type ReactionEffect = 'sandstorm' | 'threeSpade' | 'fourStop'

export interface Player {
  id: PlayerId
  name: string
  isCpu: boolean
  hand: CardId[]
  passesLeft: number
  /** 残りスキップ回数。手番が来るたびに1減らしてその手番を飛ばす。重なる。 */
  skips: number
  status: PlayerStatus
  /** 効果ごとの使用済みカード。カードは手札に残り、全員に公開される。 */
  used: Record<RevealEffect, CardId[]>
}

export interface Cell {
  suit: Suit
  rank: Rank
}

/** 盤面の1マス。null は未配置。 */
export interface BoardCell {
  placedBy: PlayerId
  /** 隣接ルールを無視して置かれたか(Qボンバー、10捨て、ジョーカー関連、脱落) */
  forced: boolean
  /** ジョーカーの解決中、一時的にジョーカーが置かれている */
  joker?: boolean
}

/** スートごとに13マス(index = rank - 1)。飛び地があるためマスごとに持つ。 */
export type Board = Record<Suit, (BoardCell | null)[]>

/** 1 = 時計回り、-1 = 反時計回り */
export type Direction = 1 | -1

export type DefeatReason =
  /** Qボンバーで手札が0枚 */
  | 'bomb'
  /** ジョーカーで出させられて手札が0枚 */
  | 'jokerForced'
  /** 手札がジョーカー1枚だけになった */
  | 'onlyJoker'
  /** ジョーカーを出して手札が0枚(禁止アガリ) */
  | 'jokerFinish'

/** 誰かの入力を待っている場面 */
export type Pending =
  /** 7渡し。全員が同時に選ぶ。 */
  | { type: 'giveSevens'; required: Record<PlayerId, number>; chosen: Record<PlayerId, CardId[]> }
  /** Qボンバーのランク指定 */
  | { type: 'bombRank'; by: PlayerId }
  /** 10捨てで出すカードの選択 */
  | { type: 'tenDiscard'; by: PlayerId }
  /** 4止めの受付(雀魂式) */
  | {
      type: 'fourStop'
      eightBy: PlayerId
      eligible: PlayerId[]
      responses: Record<PlayerId, 'fourStop' | 'skip'>
    }
  /** 砂嵐・3スペの受付(雀魂式) */
  | {
      type: 'jokerReaction'
      jokerBy: PlayerId
      cell: Cell
      eligible: Record<PlayerId, ReactionEffect[]>
      responses: Record<PlayerId, ReactionEffect | 'skip'>
    }
  /** マスのカードの持ち主が、ジョーカーをもらうか選ぶ */
  | { type: 'jokerTake'; holder: PlayerId }

export type Phase = 'turn' | 'pending' | 'ended'

export type Action =
  | { type: 'GIVE_SEVENS'; playerId: PlayerId; cards: CardId[] }
  | { type: 'DECLARE'; playerId: PlayerId; effect: SelfDeclareEffect }
  | { type: 'PLACE'; playerId: PlayerId; card: CardId }
  | { type: 'USE_JOKER'; playerId: PlayerId; cell: Cell; withCard: CardId | null }
  | { type: 'PASS'; playerId: PlayerId }
  | { type: 'BOMB_RANK'; playerId: PlayerId; rank: Rank }
  | { type: 'TEN_DISCARD'; playerId: PlayerId; card: CardId }
  | { type: 'REACT'; playerId: PlayerId; effect: ReactionEffect | 'skip' }
  | { type: 'JOKER_TAKE'; playerId: PlayerId; take: boolean }

/** ログ。全員に配られるので、隠すべき情報(渡したカードの中身など)は入れない。 */
export type GameEvent =
  | { type: 'SEVENS_PLACED'; playerId: PlayerId; cards: CardId[] }
  | { type: 'SEVENS_GIVEN'; from: PlayerId; to: PlayerId; count: number }
  | { type: 'TURN_STARTED'; playerId: PlayerId }
  | { type: 'PLACED'; playerId: PlayerId; card: CardId; forced: boolean }
  | { type: 'PASSED'; playerId: PlayerId; passesLeft: number }
  | { type: 'SKIP_ADDED'; playerId: PlayerId; skips: number }
  | { type: 'SKIP_REMOVED'; playerId: PlayerId; skips: number }
  | { type: 'SKIPPED'; playerId: PlayerId }
  | { type: 'DIRECTION_CHANGED'; direction: Direction }
  | { type: 'DECLARED'; playerId: PlayerId; effect: RevealEffect; cards: CardId[] }
  | { type: 'BOMB_DECLARED'; playerId: PlayerId; rank: Rank }
  | { type: 'JOKER_USED'; playerId: PlayerId; cell: Cell; withCard: CardId | null }
  | { type: 'JOKER_MOVED'; to: PlayerId }
  | { type: 'JOKER_REMOVED' }
  | { type: 'FINISHED'; playerId: PlayerId }
  | { type: 'ELIMINATED'; playerId: PlayerId }
  | { type: 'DEFEATED'; playerId: PlayerId; reason: DefeatReason }
  | { type: 'GAME_ENDED'; ranking: PlayerId[] }

export interface GameState {
  players: Player[]
  board: Board
  /** 現在の手番(pending 中は、その場面を起こした手番のプレイヤー) */
  turnIndex: number
  direction: Direction
  phase: Phase
  pending: Pending | null
  /** ジョーカーがゲームから除外されたか */
  jokerRemoved: boolean
  /** 更新番号。protocol での取りこぼし検知と操作の冪等性判定に使う。 */
  version: number
  finishOrder: PlayerId[]
  eliminatedOrder: PlayerId[]
  defeatedOrder: PlayerId[]
  /** 終局時に確定する最終順位(上位から) */
  ranking: PlayerId[]
  log: GameEvent[]
}
