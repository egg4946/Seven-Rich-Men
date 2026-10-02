import {
  RANK_MAX,
  RANK_MIN,
  cardId,
  parseCard,
  rankOf,
  type CardId,
  type DefeatReason,
  type Direction,
  type GameEvent,
  type PlayerId,
  type PlayerStatus,
  type RevealEffect,
  type RoundCount,
  type Series,
  type Suit,
  type Title,
} from '@srm/game-core'
import type { CpuSpeed } from '@srm/game-ai'

export type ToastTone = 'info' | 'success' | 'alert' | 'error'
export type NameOf = (id: PlayerId) => string

export const RANKS: number[] = Array.from({ length: RANK_MAX - RANK_MIN + 1 }, (_, i) => i + RANK_MIN)

export const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' }
export const SUIT_NAME: Record<Suit, string> = { S: 'スペード', H: 'ハート', D: 'ダイヤ', C: 'クラブ' }

export function isRedSuit(suit: Suit): boolean {
  return suit === 'H' || suit === 'D'
}

export function rankLabel(rank: number): string {
  return ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' } as Record<number, string>)[rank] ?? String(rank)
}

export function cardName(id: CardId): string {
  const cell = parseCard(id)
  return cell ? `${SUIT_SYMBOL[cell.suit]}${rankLabel(cell.rank)}` : 'ジョーカー'
}

/** 手札のカードに添える短い効果名 */
export const RANK_EFFECT_SHORT: Record<number, string> = {
  3: '砂嵐',
  4: '4止め',
  5: '5スキ',
  6: 'ろくろ',
  8: '8切り',
  9: '9リバ',
  10: '10捨て',
  11: 'Jバック',
  12: 'Qボム',
}

export const EFFECT_NAME: Record<RevealEffect, string> = {
  sandstorm: '砂嵐',
  threeSpade: '3スペ',
  fourStop: '4止め',
  rokurokubi: 'ろくろっくび',
  ambulance: '救急車',
}

export const DEFEAT_REASON: Record<DefeatReason, string> = {
  bomb: 'Qボンバーで手札が0枚',
  jokerForced: 'ジョーカーで出させられて手札が0枚',
  onlyJoker: '手札がジョーカーだけになった',
  jokerFinish: '禁止アガリ',
}

export const STATUS_LABEL: Record<PlayerStatus, string> = {
  playing: '対戦中',
  finished: '上がり',
  eliminated: '脱落',
  defeated: '強制敗北',
}

export const TITLE_LABEL: Record<Title, string> = {
  daifugo: '大富豪',
  fugo: '富豪',
  heimin: '平民',
  hinmin: '貧民',
  daihinmin: '大貧民',
}

export const ROUNDS_LABEL: Record<string, string> = {
  1: 'シングル',
  3: '3ラウンド',
  5: '5ラウンド',
  endless: 'エンドレス',
}

export function roundsLabel(rounds: RoundCount): string {
  return ROUNDS_LABEL[String(rounds)] ?? String(rounds)
}

/** 例: ラウンド 2/5、エンドレスは ラウンド 4 */
export function roundProgress(series: Pick<Series, 'round' | 'rules'>): string {
  const { rounds } = series.rules
  return rounds === 'endless' ? `ラウンド ${series.round}` : `ラウンド ${series.round}/${rounds}`
}

export const CPU_SPEED_LABEL: Record<CpuSpeed, string> = { slow: '遅い', normal: 'ふつう', fast: '速い' }
export const NEXT_CPU_SPEED: Record<CpuSpeed, CpuSpeed> = { normal: 'fast', fast: 'slow', slow: 'normal' }

export function directionLabel(direction: Direction): string {
  return direction === 1 ? '時計回り' : '反時計回り'
}

/** 配置で発動する効果の通知名(Qはランク指定の通知があるので除く) */
const PLACE_EFFECT_TOAST: Record<number, string> = {
  5: '5スキ',
  8: '8切り',
  9: '9リバ',
  10: '10捨て',
  11: 'イレブンバック',
}

export function describeEvent(event: GameEvent, name: NameOf): string | null {
  switch (event.type) {
    case 'CARDS_EXCHANGED':
      return `${name(event.upper)} ⇄ ${name(event.lower)}:${event.count}枚ずつ交換しました`
    case 'SEVENS_PLACED':
      return `${name(event.playerId)} が 7 を${event.cards.length}枚置きました`
    case 'SEVENS_GIVEN':
      return `${name(event.from)} → ${name(event.to)}:${event.count}枚渡しました`
    case 'TURN_STARTED':
      return null
    case 'PLACED':
      return `${name(event.playerId)}:${cardName(event.card)}${event.forced ? '(強制)' : ''}`
    case 'PASSED':
      return `${name(event.playerId)} がパス(残り${event.passesLeft}回)`
    case 'SKIP_ADDED':
      return `${name(event.playerId)} のスキップ +1(${event.skips})`
    case 'SKIP_REMOVED':
      return `${name(event.playerId)} のスキップ −1(${event.skips})`
    case 'SKIPPED':
      return `${name(event.playerId)} の手番を飛ばしました`
    case 'DIRECTION_CHANGED':
      return `手番が${directionLabel(event.direction)}になりました`
    case 'DECLARED':
      return `${name(event.playerId)} の${EFFECT_NAME[event.effect]}(${event.cards.map(cardName).join(' ')})`
    case 'BOMB_DECLARED':
      return `${name(event.playerId)} のQボンバー:${rankLabel(event.rank)} を指定`
    case 'JOKER_USED':
      return `${name(event.playerId)} がジョーカーを ${cardName(cardId(event.cell.suit, event.cell.rank))} の位置に置きました${
        event.withCard ? `(${cardName(event.withCard)} も一緒に)` : ''
      }`
    case 'JOKER_MOVED':
      return `ジョーカーが ${name(event.to)} の手札に入りました`
    case 'JOKER_REMOVED':
      return 'ジョーカーがゲームから除外されました'
    case 'FINISHED':
      return `${name(event.playerId)} が上がりました`
    case 'ELIMINATED':
      return `${name(event.playerId)} がパス切れで脱落しました`
    case 'DEFEATED':
      return `${name(event.playerId)} が強制敗北(${DEFEAT_REASON[event.reason]})`
    case 'GAME_ENDED':
      return 'ゲーム終了'
  }
}

export function toastForEvent(
  event: GameEvent,
  name: NameOf,
  humanId: PlayerId,
): { tone: ToastTone; message: string } | null {
  switch (event.type) {
    case 'PLACED': {
      if (event.forced) return null
      const rank = rankOf(event.card)
      const effect = rank === null ? undefined : PLACE_EFFECT_TOAST[rank]
      return effect ? { tone: 'info', message: `${name(event.playerId)} の${effect}` } : null
    }
    case 'CARDS_EXCHANGED': {
      const partner = event.upper === humanId ? event.lower : event.lower === humanId ? event.upper : null
      return partner ? { tone: 'info', message: `${name(partner)} と${event.count}枚ずつ交換しました` } : null
    }
    case 'SEVENS_GIVEN':
      return event.to === humanId
        ? { tone: 'info', message: `${name(event.from)} から${event.count}枚受け取りました` }
        : null
    case 'SKIPPED':
      return event.playerId === humanId ? { tone: 'alert', message: 'あなたの手番が飛ばされました' } : null
    case 'DECLARED':
    case 'BOMB_DECLARED':
    case 'JOKER_USED':
    case 'JOKER_MOVED':
    case 'JOKER_REMOVED':
      return { tone: 'info', message: describeEvent(event, name) ?? '' }
    case 'FINISHED':
      return { tone: 'success', message: describeEvent(event, name) ?? '' }
    case 'ELIMINATED':
    case 'DEFEATED':
      return { tone: 'alert', message: describeEvent(event, name) ?? '' }
    default:
      return null
  }
}
