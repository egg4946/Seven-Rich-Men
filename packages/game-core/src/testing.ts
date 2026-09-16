import { createEmptyBoard, putCard } from './board.js'
import { applyAction } from './game.js'
import { MAX_PASSES, type Action, type CardId, type Direction, type GameState, type Player } from './types.js'

/** テスト専用。手札と盤面を指定して、手番中の state を直接組み立てる。 */
export function makeState(opts: {
  hands: CardId[][]
  placed?: CardId[]
  turnIndex?: number
  direction?: Direction
}): GameState {
  const players: Player[] = opts.hands.map((hand, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    isCpu: false,
    hand: hand.slice(),
    passesLeft: MAX_PASSES,
    skips: 0,
    status: 'playing',
    used: { sandstorm: [], threeSpade: [], fourStop: [], rokurokubi: [], ambulance: [] },
  }))
  const board = createEmptyBoard()
  for (const id of opts.placed ?? []) putCard(board, id, 'setup', false)
  return {
    players,
    board,
    titles: null,
    turnIndex: opts.turnIndex ?? 0,
    direction: opts.direction ?? 1,
    phase: 'turn',
    pending: null,
    jokerRemoved: false,
    version: 0,
    finishOrder: [],
    eliminatedOrder: [],
    defeatedOrder: [],
    ranking: [],
    log: [],
  }
}

/** 操作を適用する。拒否されたらテストを失敗させる。 */
export function act(state: GameState, action: Action): GameState {
  const result = applyAction(state, action)
  if (!result.ok) throw new Error(`操作が拒否された (${action.type}): ${result.error}`)
  return result.state
}

export function turnOf(state: GameState): string {
  return state.players[state.turnIndex]?.id ?? ''
}

export function p(state: GameState, id: string): Player {
  const player = state.players.find((x) => x.id === id)
  if (!player) throw new Error(`player ${id} not found`)
  return player
}
