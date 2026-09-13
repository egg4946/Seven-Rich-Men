import { applyAction, viewFor, whoMustAct, type GameState } from '@srm/game-core'
import { decideAction, type CpuOptions } from './cpu.js'

export interface PlayOutResult {
  state: GameState
  steps: number
}

/**
 * 待たれているプレイヤーを全員 CPU として、終局まで進める。
 * CPU が不正な手を選んだら例外を投げる(テストとバランス計測用)。
 */
export function playOut(
  initial: GameState,
  options: CpuOptions & { maxSteps?: number } = {},
): PlayOutResult {
  const maxSteps = options.maxSteps ?? 5000
  let state = initial
  let steps = 0

  while (state.phase !== 'ended' && steps < maxSteps) {
    const actor = whoMustAct(state)[0]
    if (!actor) throw new Error('誰の入力も待っていないのに終局していない')
    const view = viewFor(state, actor)
    if (!view) throw new Error(`player ${actor} not found`)
    const action = decideAction(view, options)
    if (!action) throw new Error(`CPU ${actor} が手を選べなかった`)
    const result = applyAction(state, action)
    if (!result.ok) throw new Error(`CPU ${actor} の不正な手 (${action.type}): ${result.error}`)
    state = result.state
    steps++
  }
  return { state, steps }
}
