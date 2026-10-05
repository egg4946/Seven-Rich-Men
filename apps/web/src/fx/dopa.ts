import { rankOf, type GameEvent, type PlayerId } from '@srm/game-core'

/**
 * ドパガキモードの飾り(コンボ・場のチェイン・倍率・画面隅のパワー・褒め言葉・暗転)。React には依存しない。
 * どれも勝敗に関係のない見た目だけの数字で、対戦が変わったら0に戻す。
 * ふだんは静かにしておき、コンボが伸びたときにだけ騒がしくする(静と動の差を付ける)。
 */

export interface DopaCount {
  /** 自分がカードを出し続けている回数(自分のパス・スキップ・脱落で0に戻る) */
  combo: number
  /** 誰のカードでも、場に続けて出た枚数(誰かのパス・スキップで0に戻る) */
  chain: number
  /** 画面隅の数。誰かがカードを出すたびに「100 × 倍率」が足され、対戦が終わるまで増え続ける */
  power: number
}

export const DOPA_ZERO: DopaCount = { combo: 0, chain: 0, power: 0 }

export interface DopaPraise {
  text: string
  /** 激アツ(効果のあるカード・まとめ出し・コンボが伸びているとき) */
  hot: boolean
}

/** コンボの節目。fever から先は、コンボが切れるまで画面が騒がしくなる */
export type DopaMilestone = 'fever' | 'super' | 'god'

export interface DopaResult extends DopaCount {
  /** 今回の倍率(誰もカードを出していなければ0)。パワーには 100 × 倍率 が足される */
  mult: number
  /** 今回パワーに足した数 */
  gain: number
  /** 自分のカードで増えたか(相手のカードだけなら false。小さく出す) */
  mine: boolean
  /** 暗転の抽選に当たったときの、上乗せの倍率(外れは0)。mult には掛けてある */
  blackout: number
  praise: DopaPraise | null
  milestone: DopaMilestone | null
  /** コンボが切れたときの、切れる前のコンボ数(切れていなければ0) */
  broke: number
}

export const PRAISE = ['ナイス!', '天才!', '神!', 'えぐい!', 'うますぎ!', 'すごい!', '最高!', 'つよい!']
export const PRAISE_HOT = ['激アツ!', '神引き!', '確定!', '超絶!', '優勝!']
const PRAISE_MULTI = ['', '', 'ダブル!', 'トリプル!', 'クアドラ!']

/** コンボがこの数に届いたら節目の帯を出す */
export const FEVER_COMBO = 5
export const SUPER_COMBO = 8
export const GOD_COMBO = 12
/** これ以上のコンボが切れたら「COMBO BREAK」を出す */
export const BREAK_COMBO = 3

/** 1枚あたりの元の数。これに倍率を掛けてパワーに足す */
const BASE = 100
/** 自分のカードで暗転が起きる確率 */
export const BLACKOUT_CHANCE = 0.14
/** 暗転が明けたときに上乗せされる倍率。右ほど出にくい */
export const BLACKOUT_MULTS = [10, 10, 10, 50, 50, 100, 100, 777, 1000, 7777]

/** 出したときにカットインが出るランク(5スキ・8切り・9リバ・10捨て・イレブンバック) */
const EFFECT_RANKS = new Set([5, 8, 9, 10, 11])

/**
 * pick は褒め言葉を、roll は暗転の抽選を決める。どちらも 0以上1未満の数を返す(テストで固定できるようにしている)。
 * 倍率:
 * - 自分のカード: 2 のコンボ乗 ×(1 + チェインの3枚ごとに1)。効果のあるカードはさらに3倍
 * - 相手のカード: チェイン ×(自分のコンボ + 1)。自分のコンボが続いているほど、相手のカードでも増える
 * - 暗転に当たったら、そこへさらに 10〜7777 倍
 */
export function dopaFor(
  events: GameEvent[],
  youId: PlayerId,
  prev: DopaCount,
  pick: () => number = Math.random,
  roll: () => number = Math.random,
): DopaResult {
  let { combo, chain } = prev
  let mult = 0
  let mine = 0
  let hot = false
  let broke = 0
  const place = (playerId: PlayerId, effect: boolean) => {
    chain += 1
    if (playerId !== youId) {
      mult += chain * (combo + 1)
      return
    }
    combo += 1
    mine += 1
    mult += 2 ** Math.min(combo, 40) * (1 + Math.floor(chain / 3)) * (effect ? 3 : 1)
    if (effect) hot = true
  }
  for (const event of events) {
    switch (event.type) {
      case 'PLACED': {
        if (event.forced) break
        const rank = rankOf(event.card)
        place(event.playerId, rank !== null && EFFECT_RANKS.has(rank))
        break
      }
      case 'JOKER_USED':
        place(event.playerId, true)
        break
      case 'PASSED':
      case 'SKIPPED':
        chain = 0
        if (event.playerId === youId) {
          broke = Math.max(broke, combo)
          combo = 0
        }
        break
      case 'ELIMINATED':
      case 'DEFEATED':
        if (event.playerId === youId) {
          broke = Math.max(broke, combo)
          combo = 0
        }
        break
      default:
        break
    }
  }
  // 暗転は自分のカードでだけ抽選する
  let blackout = 0
  if (mine > 0 && roll() < BLACKOUT_CHANCE) {
    blackout = BLACKOUT_MULTS[Math.floor(roll() * BLACKOUT_MULTS.length) % BLACKOUT_MULTS.length]!
    mult *= blackout
  }
  const gain = BASE * mult
  const crossed = (at: number) => prev.combo < at && combo >= at
  const milestone: DopaMilestone | null = crossed(GOD_COMBO)
    ? 'god'
    : crossed(SUPER_COMBO)
      ? 'super'
      : crossed(FEVER_COMBO)
        ? 'fever'
        : null
  hot = hot || mine >= 2 || combo >= FEVER_COMBO || blackout > 0
  const words = hot ? PRAISE_HOT : PRAISE
  const text = PRAISE_MULTI[Math.min(mine, PRAISE_MULTI.length - 1)] || words[Math.floor(pick() * words.length) % words.length]!
  return {
    combo,
    chain,
    power: prev.power + gain,
    mult,
    gain,
    mine: mine > 0,
    blackout,
    praise: mine > 0 ? { text, hot } : null,
    milestone,
    broke: broke >= BREAK_COMBO ? broke : 0,
  }
}

/** 倍率の大きさの段。大きいほど、大きく派手に出す(0: 10倍未満 … 4: 1万倍以上) */
export function multTier(mult: number): 0 | 1 | 2 | 3 | 4 {
  if (mult >= 10_000) return 4
  if (mult >= 1000) return 3
  if (mult >= 100) return 2
  if (mult >= 10) return 1
  return 0
}

/** パワーの大きさの段。桁が上がるほど、隅の数字を大きく派手にする(0: 1万未満、1: 万、2: 億、3: 兆から上) */
export function powerTier(power: number): 0 | 1 | 2 | 3 {
  if (power >= 1e12) return 3
  if (power >= 1e8) return 2
  if (power >= 1e4) return 1
  return 0
}

/** コンボの数に付けるランク。伸びるほど上がる */
export function comboRank(combo: number): string {
  if (combo >= GOD_COMBO) return 'GOD'
  if (combo >= 10) return 'SSS'
  if (combo >= SUPER_COMBO) return 'SS'
  if (combo >= FEVER_COMBO) return 'S'
  if (combo >= 4) return 'A'
  if (combo >= 3) return 'B'
  return 'C'
}

const UNITS: [string, number][] = [
  ['無量大数', 1e68],
  ['不可思議', 1e64],
  ['那由他', 1e60],
  ['阿僧祇', 1e56],
  ['恒河沙', 1e52],
  ['極', 1e48],
  ['載', 1e44],
  ['正', 1e40],
  ['澗', 1e36],
  ['溝', 1e32],
  ['穣', 1e28],
  ['秭', 1e24],
  ['垓', 1e20],
  ['京', 1e16],
  ['兆', 1e12],
  ['億', 1e8],
  ['万', 1e4],
]

/** パワー・倍率の表示。1万からは 万・億・兆・京・垓 の単位で、桁が上がっていくのを見せる */
export function formatPower(power: number): string {
  for (const [unit, size] of UNITS) {
    if (power >= size) return `${Math.floor(power / size).toLocaleString('ja-JP')}${unit}`
  }
  return Math.floor(power).toLocaleString('ja-JP')
}

/** 出せるカードの縁の色。右ほど熱い */
export type HoldTier = 'blue' | 'green' | 'red' | 'gold' | 'rainbow'

/**
 * 出せるカードの縁の色。最後の1枚(出せば上がり)は虹、ジョーカーは金、効果のあるカードは赤。
 * それ以外はカードごとに青か緑で、選び直しても色が変わらないようランクから決める。
 */
export function holdTier(rank: number | null, handSize: number): HoldTier {
  if (handSize === 1) return 'rainbow'
  if (rank === null) return 'gold'
  if (EFFECT_RANKS.has(rank) || rank === 12) return 'red'
  return rank % 2 === 0 ? 'green' : 'blue'
}

/** コインの音の高さ。コンボが伸びるほど高くなる */
export function coinRate(combo: number): number {
  return 1 + Math.min(Math.max(combo, 0), 12) * 0.06
}

/** PUSH をこの回数押すたびに、手札が弾け飛ぶ */
export const PUSH_MAX = 10

/** PUSH の音の高さ。溜まるほど高くなる */
export function pushRate(push: number): number {
  return 1 + (((push - 1) % PUSH_MAX) + 1) * 0.08
}
