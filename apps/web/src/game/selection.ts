import type { PlayerView } from '@srm/game-core'

/** 手札をどう選ばせるか */
export type SelectionMode =
  /** 選べない */
  | { type: 'none' }
  /** 自分の手番。出すカードを1枚選ぶ */
  | { type: 'turn' }
  /** 7渡し。count 枚選ぶ */
  | { type: 'give'; count: number }
  /** 10捨て。もう1枚を選ぶ */
  | { type: 'ten' }

export function selectionMode(view: PlayerView): SelectionMode {
  if (view.phase === 'ended') return { type: 'none' }
  const pending = view.pending
  if (pending?.type === 'giveSevens') {
    return pending.yourCount > 0 ? { type: 'give', count: pending.yourCount } : { type: 'none' }
  }
  if (pending?.type === 'tenDiscard') {
    return pending.by === view.you.id ? { type: 'ten' } : { type: 'none' }
  }
  if (!pending && view.you.status === 'playing' && view.turnPlayerId === view.you.id) {
    return { type: 'turn' }
  }
  return { type: 'none' }
}

/**
 * 視点データから「答えるべき場面」を識別するキー(game-core の decisionKey と同じ規則)。
 * これが変わったら、選択中のカードをリセットする。
 */
export function viewDecisionKey(view: PlayerView): string {
  const turns = view.log.reduce((n, e) => n + (e.type === 'TURN_STARTED' ? 1 : 0), 0)
  return `${turns}|${view.phase}|${view.pending?.type ?? 'turn'}`
}
