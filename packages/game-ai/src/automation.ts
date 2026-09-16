import { viewFor, whoMustAct, type Action, type GameState, type PlayerId, type Rng } from '@srm/game-core'
import { decideAction, type CpuLevel } from './cpu.js'

/**
 * 人が操作しない場面の自動操作。ソロ対戦の画面とオンライン対戦のサーバーで共有する。
 */

export const CPU_NAMES = ['ミナト', 'ハルカ', 'ソウタ', 'ユイ', 'レン'] as const

export function decideCpu(state: GameState, id: PlayerId, level: CpuLevel, rng?: Rng): Action | null {
  const view = viewFor(state, id)
  return view ? decideAction(view, { level, rng }) : null
}

/** 今入力を待たれている CPU 席 */
export function cpuActors(state: GameState): PlayerId[] {
  return whoMustAct(state).filter((id) => state.players.some((p) => p.id === id && p.isCpu))
}

/**
 * 時間切れの操作(docs/RULES.md §4-5)。
 * 手番はパス、割り込み宣言はスキップ、効果の中の選択は CPU のロジックで自動選択する。
 */
export function timeoutAction(state: GameState, id: PlayerId): Action | null {
  if (!whoMustAct(state).includes(id)) return null
  const pending = state.pending
  if (!pending) return { type: 'PASS', playerId: id }
  switch (pending.type) {
    case 'fourStop':
    case 'jokerReaction':
      return { type: 'REACT', playerId: id, effect: 'skip' }
    case 'exchange':
    case 'giveSevens':
    case 'bombRank':
    case 'tenDiscard':
    case 'jokerTake':
      return decideCpu(state, id, 'normal')
  }
}

/** CPU が考えているように見せる待ち時間 */
export function cpuDelayMs(state: GameState, random: () => number = Math.random): number {
  const type = state.pending?.type
  const [min, max] =
    type === 'fourStop' || type === 'jokerReaction'
      ? [500, 1000]
      : type === 'giveSevens' || type === 'exchange'
        ? [700, 1500]
        : [700, 1200]
  return Math.round(min + (max - min) * random())
}
