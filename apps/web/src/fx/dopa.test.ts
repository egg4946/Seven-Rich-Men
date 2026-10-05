import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cardId, type GameEvent } from '@srm/game-core'
import {
  DOPA_ZERO,
  PRAISE,
  PRAISE_HOT,
  PUSH_MAX,
  coinRate,
  comboRank,
  dopaFor,
  formatPower,
  holdTier,
  multTier,
  powerTier,
  pushRate,
} from './dopa'
import { NEXT_FX_LEVEL, particleCount, useFx, type FxLevel } from './store'

const YOU = 'you'
const first = () => 0
const placed = (rank: number, playerId = YOU, forced = false): GameEvent => ({
  type: 'PLACED',
  playerId,
  card: cardId('S', rank),
  forced,
})
const passed = (playerId: string): GameEvent => ({ type: 'PASSED', playerId, passesLeft: 2 })

const never = () => 1

describe('dopaFor', () => {
  it('自分がカードを出すたびにコンボが伸び、倍率は2のコンボ乗で跳ね上がって、パワーに足される', () => {
    const one = dopaFor([placed(6)], YOU, DOPA_ZERO, first, never)
    expect(one).toMatchObject({ combo: 1, chain: 1, mult: 2, gain: 200, power: 200, mine: true })
    expect(one.praise).toEqual({ text: PRAISE[0], hot: false })
    const two = dopaFor([placed(4)], YOU, one, first, never)
    expect(two).toMatchObject({ combo: 2, chain: 2, mult: 4, power: 600 })
    const three = dopaFor([placed(3)], YOU, two, first, never)
    // 場に3枚続いたので、チェインのぶん倍率が2倍になる
    expect(three).toMatchObject({ combo: 3, chain: 3, mult: 16, power: 2200 })
  })

  it('効果のあるカードは倍率が3倍になり、激アツの言葉で褒める', () => {
    expect(dopaFor([placed(8)], YOU, DOPA_ZERO, first, never)).toMatchObject({
      combo: 1,
      mult: 6,
      praise: { text: PRAISE_HOT[0], hot: true },
    })
  })

  it('1回に2枚出したら、倍率を足し合わせて「ダブル!」', () => {
    const result = dopaFor([placed(10), placed(6)], YOU, DOPA_ZERO, first, never)
    expect(result).toMatchObject({ combo: 2, mult: 6 + 4, gain: 1000, praise: { text: 'ダブル!', hot: true } })
  })

  it('相手のカードでもパワーは増える(チェイン × 自分のコンボ+1)。強制配置は何も動かさない', () => {
    const prev = { combo: 3, chain: 4, power: 3000 }
    expect(dopaFor([placed(6, 'cpu1'), placed(5, YOU, true)], YOU, prev, first, never)).toEqual({
      combo: 3,
      chain: 5,
      power: 5000,
      mult: 20,
      gain: 2000,
      mine: false,
      blackout: 0,
      praise: null,
      milestone: null,
      broke: 0,
    })
  })

  it('自分のパスでコンボが切れ(パワーは残る)、3コンボ以上なら知らせる。誰かのパスでチェインが切れる', () => {
    const prev = { combo: 4, chain: 6, power: 240 }
    expect(dopaFor([passed(YOU)], YOU, prev)).toMatchObject({ combo: 0, chain: 0, power: 240, mult: 0, broke: 4 })
    expect(dopaFor([passed('cpu1')], YOU, prev)).toMatchObject({ combo: 4, chain: 0, power: 240, broke: 0 })
    expect(dopaFor([passed(YOU)], YOU, { combo: 2, chain: 2, power: 6 }).broke).toBe(0)
  })

  it('コンボが5・8・12に届いたときだけ、節目を知らせる', () => {
    const at = (combo: number) => dopaFor([placed(6)], YOU, { combo, chain: 0, power: 1 }, first, never)
    expect(at(4)).toMatchObject({ milestone: 'fever', praise: { hot: true } })
    expect(at(5).milestone).toBeNull()
    expect(at(7).milestone).toBe('super')
    expect(at(11).milestone).toBe('god')
  })

  it('暗転に当たると、倍率がさらに跳ね上がる。相手のカードでは抽選しない', () => {
    const rolls = [0, 0.99]
    const hit = dopaFor([placed(6)], YOU, DOPA_ZERO, first, () => rolls.shift() ?? 1)
    expect(hit).toMatchObject({ blackout: 7777, mult: 2 * 7777, gain: 200 * 7777, praise: { hot: true } })
    expect(dopaFor([placed(6, 'cpu1')], YOU, DOPA_ZERO, first, () => 0)).toMatchObject({ blackout: 0, mult: 1 })
  })
})

describe('multTier / powerTier', () => {
  it('倍率もパワーも、大きいほど段が上がる', () => {
    expect([9, 10, 100, 1000, 10_000].map(multTier)).toEqual([0, 1, 2, 3, 4])
    expect([9999, 1e4, 1e8, 1e12, 1e30].map(powerTier)).toEqual([0, 1, 2, 3, 3])
  })
})

describe('comboRank / formatPower', () => {
  it('コンボが伸びるほどランクが上がる', () => {
    expect([2, 3, 4, 5, 8, 10, 12].map(comboRank)).toEqual(['C', 'B', 'A', 'S', 'SS', 'SSS', 'GOD'])
  })

  it('パワーは1万から 万・億・兆・京… の単位で表す', () => {
    expect(formatPower(5040)).toBe('5,040')
    expect(formatPower(39_916_800)).toBe('3,991万')
    expect(formatPower(87_178_291_200)).toBe('871億')
    expect(formatPower(2.5e12)).toBe('2兆')
    expect(formatPower(3.2e16)).toBe('3京')
    expect(formatPower(5e68)).toBe('5無量大数')
  })
})

describe('holdTier', () => {
  it('最後の1枚は虹、ジョーカーは金、効果のあるカードは赤、ほかは青か緑', () => {
    expect(holdTier(6, 1)).toBe('rainbow')
    expect(holdTier(null, 5)).toBe('gold')
    expect(holdTier(8, 5)).toBe('red')
    expect(holdTier(12, 5)).toBe('red')
    expect(holdTier(6, 5)).toBe('green')
    expect(holdTier(13, 5)).toBe('blue')
  })
})

describe('音の高さ', () => {
  it('コインはコンボが伸びるほど高くなり、12で頭打ち', () => {
    expect(coinRate(0)).toBe(1)
    expect(coinRate(5)).toBeCloseTo(1.3)
    expect(coinRate(40)).toBe(coinRate(12))
  })

  it('PUSH は溜まるほど高くなり、溜まり切ったら最初の高さに戻る', () => {
    expect(pushRate(2)).toBeGreaterThan(pushRate(1))
    expect(pushRate(PUSH_MAX + 1)).toBe(pushRate(1))
  })
})

describe('演出の量: ドパガキ', () => {
  const name = (id: string) => id

  beforeEach(() => {
    // 暗転の抽選に当たらないようにする
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    useFx.getState().clear()
    useFx.getState().setLevel('full')
    vi.unstubAllGlobals()
    vi.resetModules()
    vi.useRealTimers()
  })

  it('豪華 → 控えめ → オフ → ドパガキ → 豪華 の順に切り替わる', () => {
    const order: FxLevel[] = []
    let level: FxLevel = 'full'
    for (let i = 0; i < 4; i++) order.push((level = NEXT_FX_LEVEL[level]))
    expect(order).toEqual(['lite', 'off', 'dopa', 'full'])
  })

  it('粒は端末の性能に関係なく3倍にする', () => {
    expect(particleCount(16, 'dopa')).toBe(48)
    expect(particleCount(16, 'lite')).toBe(0)
  })

  it('選んだら保存し、読み込み直しても残る', async () => {
    const items = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => items.get(k) ?? null,
      setItem: (k: string, v: string) => void items.set(k, v),
    })
    useFx.getState().setLevel('dopa')
    expect(items.get('srm:fx')).toBe('dopa')
    vi.resetModules()
    const reloaded = await import('./store')
    expect(reloaded.useFx.getState().level).toBe('dopa')
  })

  it('コンボとパワーは、ドパガキのときだけ数え、対戦が変わったら0に戻す', () => {
    vi.useFakeTimers()
    useFx.getState().emit([placed(6)], name, YOU)
    expect(useFx.getState().dopa.combo).toBe(0)
    useFx.getState().setLevel('dopa')
    useFx.getState().emit([placed(6)], name, YOU)
    useFx.getState().emit([placed(4, 'cpu1')], name, YOU)
    // コンボはすぐに進み、パワーはカードが着いたところで倍率と一緒に増える
    expect(useFx.getState().dopa).toMatchObject({ combo: 1, chain: 2, power: 0 })
    vi.advanceTimersByTime(700)
    expect(useFx.getState().dopa).toMatchObject({ power: 200 + 400, mult: { value: 4, gain: 400, mine: false } })
    useFx.getState().clear()
    expect(useFx.getState().dopa).toMatchObject({ combo: 0, chain: 0, power: 0 })
  })

  it('暗転に当たったら、真っ暗な間は増やさず、明けてから倍率を足す', () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    useFx.getState().setLevel('dopa')
    useFx.getState().emit([placed(6)], name, YOU)
    vi.advanceTimersByTime(700)
    expect(useFx.getState().dopa).toMatchObject({ blackout: { mult: 10 }, power: 0, mult: null })
    vi.advanceTimersByTime(1000)
    expect(useFx.getState().dopa).toMatchObject({ power: 2000, mult: { value: 20, mine: true } })
  })

  it('コンボが FEVER に届いたら、カードが着いたところで盤面と手札を弾け飛ばす', () => {
    vi.useFakeTimers()
    useFx.getState().setLevel('dopa')
    for (let i = 0; i < 4; i++) useFx.getState().emit([placed(6)], name, YOU)
    vi.advanceTimersByTime(1000)
    expect(useFx.getState().dopa.blast).toBeNull()
    useFx.getState().emit([placed(6)], name, YOU)
    vi.advanceTimersByTime(700)
    expect(useFx.getState().dopa).toMatchObject({ combo: 5, milestone: { kind: 'fever' }, blast: { target: 'both' } })
  })

  it('PUSH は押すたびに溜まり、溜まり切ると手札を弾け飛ばす。ドパガキ以外では何もしない', () => {
    useFx.getState().dopaPush()
    expect(useFx.getState().dopa.push).toBe(0)
    useFx.getState().setLevel('dopa')
    for (let i = 0; i < PUSH_MAX - 1; i++) useFx.getState().dopaPush()
    expect(useFx.getState().dopa).toMatchObject({ push: PUSH_MAX - 1, blast: null })
    useFx.getState().dopaPush()
    expect(useFx.getState().dopa).toMatchObject({ push: PUSH_MAX, blast: { target: 'hand' } })
  })

  it('Qボンバーは盤面を、GAME SET は盤面と手札を弾け飛ばす', () => {
    useFx.getState().setLevel('dopa')
    useFx.getState().push({ kind: 'bomb', tone: 'red', title: 'Qボンバー' })
    expect(useFx.getState().dopa.blast?.target).toBe('board')
    useFx.getState().clear()
    useFx.getState().push({ kind: 'gameEnd', tone: 'primary', title: 'GAME SET' })
    expect(useFx.getState().dopa.blast?.target).toBe('both')
  })
})
