import { createGame, cryptoRng, type GameState, type Rng } from '@srm/game-core'
import { CPU_NAMES, type CpuLevel } from '@srm/game-ai'

/**
 * ソロ(CPU対戦)の進行を決める関数群。React やタイマーには依存しない。
 * 自動操作(CPU・時間切れ)はオンライン対戦のサーバーと共有するため game-ai にある。
 */

export { decisionKey } from '@srm/game-core'
export { cpuActors, cpuDelayMs, decideCpu, timeoutAction } from '@srm/game-ai'

export const HUMAN_ID = 'you'

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
