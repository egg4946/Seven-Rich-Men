import { applyToDraft } from './actions.js'
import { validateAction } from './legal.js'
import type { Action, GameState } from './types.js'

export type ApplyResult =
  | { ok: true; state: GameState }
  | { ok: false; error: string }

/** 純粋関数。state は変更せず、検証した上で新しい state を返す。 */
export function applyAction(state: GameState, action: Action): ApplyResult {
  const error = validateAction(state, action)
  if (error) return { ok: false, error }

  const next = structuredClone(state)
  applyToDraft(next, action)
  next.version += 1
  return { ok: true, state: next }
}
