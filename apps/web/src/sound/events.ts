import type { GameEvent, PlayerId } from '@srm/game-core'
import { coinRate } from '../fx/dopa'
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
  | DopaSoundName

/** ドパガキモードでだけ鳴らす音 */
export type DopaSoundName =
  | 'dopaSkip'
  | 'dopaSlash'
  | 'dopaReverse'
  | 'dopaDiscard'
  | 'dopaBomb'
  | 'dopaJoker'
  | 'dopaReveal'
  | 'dopaOut'
  | 'dopaTurn'
  | 'dopaCoin'
  | 'dopaPraise'
  | 'dopaHot'
  | 'dopaFanfare'
  | 'dopaCheer'
  | 'dopaImpact'
  | 'dopaJackpot'
  | 'dopaReach'
  | 'dopaDrop'

export interface SoundCue {
  name: SoundName
  delayMs: number
  /** 再生の速さ(音の高さ)。書かなければ1 */
  rate?: number
}

/**
 * カットインが出る瞬間に鳴らす音。カードの効果・自分の番・脱落は、合う音が見つかるまで鳴らさない
 * (足すときはここに種類を書く)。ドパガキモードでだけ鳴らす音は DOPA_CUTIN_SOUND に書く
 */
const CUTIN_SOUND: Partial<Record<CutinKind, SoundName>> = {
  start: 'start',
  sevens: 'deal',
  exchange: 'deal',
  finish: 'finish',
  gameEnd: 'gameEnd',
}

/** ドパガキモードでは、カードの効果・自分の番・脱落にも音を重ねる(Qボンバーは盤面が弾け飛ぶところで鳴らす) */
const DOPA_CUTIN_SOUND: Partial<Record<CutinKind, DopaSoundName>> = {
  skip: 'dopaSkip',
  slash: 'dopaSlash',
  reverse: 'dopaReverse',
  discard: 'dopaDiscard',
  joker: 'dopaJoker',
  reveal: 'dopaReveal',
  out: 'dopaOut',
  turn: 'dopaTurn',
  finish: 'dopaFanfare',
}

/** 自分が1位で終わったら、GAME SET に歓声を重ねる */
export function cutinSounds(spec: Pick<CutinSpec, 'kind' | 'mine'>, dopa = false): SoundName[] {
  const out: SoundName[] = []
  const name = CUTIN_SOUND[spec.kind]
  if (name) out.push(name)
  if (spec.kind === 'gameEnd' && spec.mine) out.push('win')
  const extra = dopa ? DOPA_CUTIN_SOUND[spec.kind] : undefined
  if (extra) out.push(extra)
  return out
}

/**
 * カットインを伴わない音。カードは場に着いたときに鳴らすので、飛ぶ時間(flyMs。演出がオフなら0)だけ遅らせる。
 * 飛ばさずに置かれるカード(強制配置が多いとき)は、まとめて1回だけ鳴らす。
 * dopaCombo(ドパガキモードのコンボ数)を渡すと、着地のたびにコインの音を重ね、コンボが伸びるほど高くする。
 */
export function soundsFor(events: GameEvent[], youId: PlayerId, flyMs: number, dopaCombo?: number): SoundCue[] {
  const out: SoundCue[] = flightsFor(events, youId).map((flight) => ({
    name: 'cardPut',
    delayMs: flyMs + flight.delayMs,
  }))
  if (out.length === 0 && events.some((e) => e.type === 'PLACED')) out.push({ name: 'cardPut', delayMs: 0 })
  if (dopaCombo !== undefined) {
    const rate = coinRate(dopaCombo)
    out.push(...out.map((cue) => ({ name: 'dopaCoin' as const, delayMs: cue.delayMs, rate })))
  }
  if (events.some((e) => e.type === 'PASSED')) out.push({ name: 'pass', delayMs: 0 })
  return out
}
