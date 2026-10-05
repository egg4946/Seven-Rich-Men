import type { GameEvent, PlayerId } from '@srm/game-core'
import { flightsFor, type CutinKind, type CutinSpec } from '../fx/events'

/**
 * ゲームの出来事を、鳴らす音に変換する。React にも Web Audio にも依存しない。
 * 音源は assets/se に同じ名前で置く(差し替えるときはファイルを置き換えるか、ここの対応を変える)。
 */

export type SoundName =
  | 'cardPut'
  | 'cardSelect'
  | 'deal'
  | 'click'
  | 'pass'
  | 'finish'
  | 'start'
  | 'gameEnd'
  | 'win'

export interface SoundCue {
  name: SoundName
  delayMs: number
}

/**
 * カットインが出る瞬間に鳴らす音。カードの効果・自分の番・脱落は、合う音が見つかるまで鳴らさない
 * (足すときはここに種類を書く)
 */
const CUTIN_SOUND: Partial<Record<CutinKind, SoundName>> = {
  start: 'start',
  sevens: 'deal',
  exchange: 'deal',
  finish: 'finish',
  gameEnd: 'gameEnd',
}

/** 自分が1位で終わったら、GAME SET に歓声を重ねる */
export function cutinSounds(spec: Pick<CutinSpec, 'kind' | 'mine'>): SoundName[] {
  const name = CUTIN_SOUND[spec.kind]
  if (!name) return []
  return spec.kind === 'gameEnd' && spec.mine ? [name, 'win'] : [name]
}

/**
 * カットインを伴わない音。カードは場に着いたときに鳴らすので、飛ぶ時間(flyMs。演出がオフなら0)だけ遅らせる。
 * 飛ばさずに置かれるカード(強制配置が多いとき)は、まとめて1回だけ鳴らす。
 */
export function soundsFor(events: GameEvent[], youId: PlayerId, flyMs: number): SoundCue[] {
  const out: SoundCue[] = flightsFor(events, youId).map((flight) => ({
    name: 'cardPut',
    delayMs: flyMs + flight.delayMs,
  }))
  if (out.length === 0 && events.some((e) => e.type === 'PLACED')) out.push({ name: 'cardPut', delayMs: 0 })
  if (events.some((e) => e.type === 'PASSED')) out.push({ name: 'pass', delayMs: 0 })
  return out
}
