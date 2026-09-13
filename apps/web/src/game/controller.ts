import {
  createGame,
  cryptoRng,
  viewFor,
  whoMustAct,
  type Action,
  type GameState,
  type PlayerId,
  type Rng,
} from '@srm/game-core'
import { decideAction, type CpuLevel } from '@srm/game-ai'

/**
 * ソロ(CPU対戦)の進行を決める純粋な関数群。React やタイマーには依存しない。
 * オンライン対戦ではサーバー側が同じ役割を担う。
 */

export const HUMAN_ID = 'you'
export const CPU_NAMES = ['ミナト', 'ハルカ', 'ソウタ', 'ユイ', 'レン'] as const

export interface SoloSettings {
  name: string
  /** 2〜5人 */
  cpuCount: number
  level: CpuLevel
}

export function createSoloGame(settings: SoloSettings, rng: Rng = cryptoRng()): GameState {
  const cpuCount = Math.min(5, Math.max(2, Math.floor(settings.cpuCount)))
  return createGame({
    players: [
      { id: HUMAN_ID, name: settings.name.trim() || 'あなた', isCpu: false },
      ...Array.from({ length: cpuCount }, (_, i) => ({
        id: `cpu${i + 1}`,
        name: CPU_NAMES[i] ?? `CPU${i + 1}`,
        isCpu: true,
      })),
    ],
    rng,
  })
}

/**
 * 「誰かが答えるべき場面」を識別するキー。
 * 手番中の宣言(ろくろっくび・救急車)では変わらないので、制限時間はリセットされない。
 */
export function decisionKey(state: GameState): string {
  const turns = state.log.reduce((n, e) => n + (e.type === 'TURN_STARTED' ? 1 : 0), 0)
  return `${turns}|${state.phase}|${state.pending?.type ?? 'turn'}`
}

export function cpuActors(state: GameState): PlayerId[] {
  return whoMustAct(state).filter((id) => state.players.some((p) => p.id === id && p.isCpu))
}

export function decideCpu(state: GameState, id: PlayerId, level: CpuLevel, rng?: Rng): Action | null {
  const view = viewFor(state, id)
  return view ? decideAction(view, { level, rng }) : null
}

/**
 * 時間切れの操作(§4-5)。
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
      : type === 'giveSevens'
        ? [700, 1500]
        : [700, 1200]
  return Math.round(min + (max - min) * random())
}
