import {
  createGame,
  cryptoRng,
  seriesTitles,
  shuffle,
  startSeries,
  type GameState,
  type PlayerSeed,
  type Rng,
  type Series,
  type SeriesRules,
} from '@srm/game-core'
import { CPU_NAMES, type CpuLevel } from '@srm/game-ai'

/**
 * ソロ(CPU対戦)の進行を決める関数群。React やタイマーには依存しない。
 * 自動操作(CPU・時間切れ)はオンライン対戦のサーバーと共有するため game-ai にある。
 */

export { decisionKey } from '@srm/game-core'
export { cpuActors, cpuDelayMs, decideCpu, timeoutAction, type CpuSpeed } from '@srm/game-ai'

export const HUMAN_ID = 'you'

/** ラウンド数・席順・4人戦の交換(docs/RULES.md §9-0)も含む */
export interface SoloSettings extends SeriesRules {
  name: string
  /** 2〜5人 */
  cpuCount: number
  level: CpuLevel
}

export function soloSeeds(settings: SoloSettings): PlayerSeed[] {
  const cpuCount = Math.min(5, Math.max(2, Math.floor(settings.cpuCount)))
  return [
    { id: HUMAN_ID, name: settings.name.trim() || 'あなた', isCpu: false },
    ...Array.from({ length: cpuCount }, (_, i) => ({
      id: `cpu${i + 1}`,
      name: CPU_NAMES[i] ?? `CPU${i + 1}`,
      isCpu: true,
    })),
  ]
}

export function startSoloSeries(settings: SoloSettings): Series {
  const { rounds, seating, fourPlayerExchange } = settings
  return startSeries(
    { rounds, seating, fourPlayerExchange },
    soloSeeds(settings).map((seed) => seed.id),
  )
}

/**
 * series の今のラウンドを始める。2ラウンド目以降は前の順位の身分でカード交換から始まる。
 * 席順が「毎ラウンドランダム」なら、1ラウンド目も含めて毎回並べ替える(§9-2)。
 */
export function createSoloRound(settings: SoloSettings, series: Series, rng: Rng = cryptoRng()): GameState {
  const seeds = soloSeeds(settings)
  const random = series.rules.rounds !== 1 && series.rules.seating === 'random'
  return createGame({ players: random ? shuffle(seeds, rng) : seeds, rng, titles: seriesTitles(series) })
}

export function createSoloGame(settings: SoloSettings, rng: Rng = cryptoRng()): GameState {
  return createSoloRound(settings, startSoloSeries(settings), rng)
}
