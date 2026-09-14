import { cardId, rankOf, type GameEvent, type PlayerId, type RevealEffect } from '@srm/game-core'
import { DEFEAT_REASON, EFFECT_NAME, cardName, rankLabel, type NameOf } from '../ui/labels'

/**
 * ゲームの出来事を、画面の演出(カットイン・席の吹き出し)に変換する。React には依存しない。
 * 読み上げは通知(Toast)とログが担うので、演出は見た目だけのものにする。
 */

export type CutinKind =
  | 'start'
  | 'skip'
  | 'slash'
  | 'reverse'
  | 'discard'
  | 'bomb'
  | 'joker'
  | 'reveal'
  | 'finish'
  | 'out'
  | 'gameEnd'
  | 'turn'
  | 'notice'

export type FxTone = 'primary' | 'sky' | 'amber' | 'red' | 'emerald' | 'violet' | 'slate' | 'gold'

export interface CutinSpec {
  kind: CutinKind
  tone: FxTone
  title: string
  /** 誰の効果か(「CPUA の」と添える) */
  by?: string
  sub?: string
  /** 自分に関わる演出か(自分の上がりで紙吹雪を出す、など) */
  mine?: boolean
  /** 場を揺らす強さ */
  shake?: 1 | 2
}

export interface SeatPopSpec {
  playerId: PlayerId
  text: string
  tone: FxTone
}

/** 画面中央の帯ではなく、小さな知らせで出す種類 */
export const MINOR_KINDS: ReadonlySet<CutinKind> = new Set<CutinKind>(['turn', 'notice'])

/** 待ち行列があふれても捨てない種類(順位に関わる出来事) */
export const KEEP_KINDS: ReadonlySet<CutinKind> = new Set<CutinKind>(['finish', 'out', 'gameEnd'])

/** 通常配置で発動する効果(Qはランク指定のときに出す) */
const PLACE_CUTIN: Record<number, Pick<CutinSpec, 'kind' | 'tone' | 'title' | 'sub'>> = {
  5: { kind: 'skip', tone: 'sky', title: '5スキ', sub: '次の人にスキップ +1' },
  8: { kind: 'slash', tone: 'red', title: '8切り', sub: 'スキップ +1' },
  9: { kind: 'reverse', tone: 'violet', title: '9リバ', sub: '手番の向きが反転' },
  10: { kind: 'discard', tone: 'emerald', title: '10捨て', sub: 'もう1枚を隣接無視で出す' },
  11: { kind: 'reverse', tone: 'violet', title: 'イレブンバック', sub: '手番の向きが反転' },
}

const DECLARE_CUTIN: Record<RevealEffect, Pick<CutinSpec, 'tone' | 'sub'>> = {
  sandstorm: { tone: 'amber', sub: 'ジョーカーを奪う' },
  threeSpade: { tone: 'amber', sub: 'ジョーカーを奪う' },
  fourStop: { tone: 'sky', sub: '8切りのスキップを奪う' },
  rokurokubi: { tone: 'emerald', sub: 'スキップ +1' },
  ambulance: { tone: 'red', sub: 'スキップ +1' },
}

export function startCutin(players: number): CutinSpec {
  return { kind: 'start', tone: 'primary', title: 'GAME START', sub: `${players}人対戦` }
}

export function cutinsFor(events: GameEvent[], name: NameOf, youId: PlayerId): CutinSpec[] {
  const out: CutinSpec[] = []
  for (const event of events) {
    switch (event.type) {
      case 'PLACED': {
        if (event.forced) break
        const rank = rankOf(event.card)
        const spec = rank === null ? undefined : PLACE_CUTIN[rank]
        if (spec) out.push({ ...spec, by: name(event.playerId), mine: event.playerId === youId })
        break
      }
      case 'BOMB_DECLARED':
        out.push({
          kind: 'bomb',
          tone: 'red',
          title: 'Qボンバー',
          by: name(event.playerId),
          sub: `全員が ${rankLabel(event.rank)} を場に出す`,
          mine: event.playerId === youId,
          shake: 2,
        })
        break
      case 'JOKER_USED':
        out.push({
          kind: 'joker',
          tone: 'gold',
          title: 'ジョーカー',
          by: name(event.playerId),
          sub: `${cardName(cardId(event.cell.suit, event.cell.rank))} を出させる`,
          mine: event.playerId === youId,
          shake: 1,
        })
        break
      case 'DECLARED':
        out.push({
          kind: 'reveal',
          ...DECLARE_CUTIN[event.effect],
          title: EFFECT_NAME[event.effect],
          by: name(event.playerId),
          mine: event.playerId === youId,
        })
        break
      case 'FINISHED':
        out.push({ kind: 'finish', tone: 'gold', title: '上がり!', by: name(event.playerId), mine: event.playerId === youId })
        break
      case 'ELIMINATED':
        out.push({ kind: 'out', tone: 'slate', title: '脱落', by: name(event.playerId), sub: 'パス切れ', mine: event.playerId === youId })
        break
      case 'DEFEATED':
        out.push({
          kind: 'out',
          tone: 'slate',
          title: '強制敗北',
          by: name(event.playerId),
          sub: DEFEAT_REASON[event.reason],
          mine: event.playerId === youId,
          shake: 1,
        })
        break
      case 'GAME_ENDED':
        out.push({ kind: 'gameEnd', tone: 'primary', title: 'GAME SET', mine: event.ranking[0] === youId })
        break
      case 'TURN_STARTED':
        if (event.playerId === youId) out.push({ kind: 'turn', tone: 'primary', title: 'あなたの番', mine: true })
        break
      case 'SKIPPED':
        if (event.playerId === youId) {
          out.push({ kind: 'notice', tone: 'amber', title: 'スキップ', sub: 'あなたの番は飛ばされました', mine: true })
        }
        break
      default:
        break
    }
  }
  return out
}

/** 相手の席に一瞬出す吹き出し。同じ人に複数あれば最後のものを使う */
export function seatPopsFor(events: GameEvent[], youId: PlayerId): SeatPopSpec[] {
  const pops = new Map<PlayerId, SeatPopSpec>()
  const put = (playerId: PlayerId, text: string, tone: FxTone) => {
    if (playerId !== youId) pops.set(playerId, { playerId, text, tone })
  }
  for (const event of events) {
    switch (event.type) {
      case 'PLACED':
        put(event.playerId, cardName(event.card), event.forced ? 'slate' : 'primary')
        break
      case 'PASSED':
        put(event.playerId, 'パス', 'amber')
        break
      case 'SKIPPED':
        put(event.playerId, 'スキップ', 'sky')
        break
      case 'SEVENS_GIVEN':
        put(event.from, `${event.count}枚渡した`, 'emerald')
        break
      case 'JOKER_MOVED':
        put(event.to, 'ジョーカー獲得', 'gold')
        break
      case 'FINISHED':
        put(event.playerId, '上がり', 'gold')
        break
      default:
        break
    }
  }
  return [...pops.values()]
}
