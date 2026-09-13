import { describe, expect, it } from 'vitest'
import { canPlace, cellAt } from './board.js'
import { applyAction } from './game.js'
import { legalActions, whoMustAct } from './legal.js'
import { act, makeState, p, turnOf } from './testing.js'
import { JOKER, MAX_PASSES } from './types.js'

describe('スキップ全般', () => {
  it('スキップは重なり、パスの残り回数は減らない', () => {
    let state = makeState({
      hands: [['S8', 'C1'], ['H1'], ['D5', 'D1']],
      placed: ['S7', 'D6', 'D7'],
    })
    state = act(state, { type: 'PLACE', playerId: 'p0', card: 'S8' }) // p0 スキップ1
    state = act(state, { type: 'PASS', playerId: 'p1' })
    state = act(state, { type: 'PLACE', playerId: 'p2', card: 'D5' }) // 次の p0 にスキップ +1
    // p0 は1回飛ばされて p1
    expect(turnOf(state)).toBe('p1')
    expect(p(state, 'p0').skips).toBe(1)

    state = act(state, { type: 'PASS', playerId: 'p1' })
    state = act(state, { type: 'PASS', playerId: 'p2' })
    // p0 はもう1回飛ばされる
    expect(turnOf(state)).toBe('p1')
    expect(p(state, 'p0').skips).toBe(0)
    expect(p(state, 'p0').passesLeft).toBe(MAX_PASSES)
  })

  it('通常配置で上がった後も、そのカードの効果は解決する', () => {
    let state = makeState({ hands: [['S5'], ['H1'], ['D1']], placed: ['S6', 'S7'] })
    state = act(state, { type: 'PLACE', playerId: 'p0', card: 'S5' })
    expect(state.finishOrder).toEqual(['p0'])
    expect(turnOf(state)).toBe('p2')
  })
})

describe('5スキ', () => {
  it('次の人の手番を飛ばす', () => {
    let state = makeState({ hands: [['S5', 'C1'], ['H1'], ['D1']], placed: ['S6', 'S7'] })
    state = act(state, { type: 'PLACE', playerId: 'p0', card: 'S5' })
    expect(turnOf(state)).toBe('p2')
    expect(p(state, 'p1').passesLeft).toBe(MAX_PASSES)
  })

  it('逆回り中は逆方向の次の人を飛ばす', () => {
    let state = makeState({
      hands: [['S5', 'C1'], ['H1'], ['D1']],
      placed: ['S6', 'S7'],
      direction: -1,
    })
    state = act(state, { type: 'PLACE', playerId: 'p0', card: 'S5' })
    expect(turnOf(state)).toBe('p1')
  })
})

describe('8切り・4止め', () => {
  it('8を出すと次の自分の手番が飛ぶ', () => {
    let state = makeState({ hands: [['S8', 'C1'], ['H1'], ['D1']], placed: ['S7'] })
    state = act(state, { type: 'PLACE', playerId: 'p0', card: 'S8' })
    expect(state.phase).toBe('turn') // 4止めできる人がいないので待たない
    state = act(state, { type: 'PASS', playerId: 'p1' })
    state = act(state, { type: 'PASS', playerId: 'p2' })
    expect(turnOf(state)).toBe('p1')
    expect(p(state, 'p0').passesLeft).toBe(MAX_PASSES)
  })

  it('4止めの受付は、宣言できる人全員の返事を待つ', () => {
    let state = makeState({
      hands: [['S8', 'C1'], ['H4', 'D4', 'H1'], ['S4', 'C4', 'D1']],
      placed: ['S7'],
    })
    state = act(state, { type: 'PLACE', playerId: 'p0', card: 'S8' })
    expect(state.pending?.type).toBe('fourStop')
    expect(whoMustAct(state).sort()).toEqual(['p1', 'p2'])

    state = act(state, { type: 'REACT', playerId: 'p2', effect: 'fourStop' })
    expect(state.phase).toBe('pending')
    state = act(state, { type: 'REACT', playerId: 'p1', effect: 'fourStop' })

    // 押した順(p2が先)ではなく、8を出した人の次から手番順で p1 が優先
    expect(p(state, 'p1').used.fourStop).toHaveLength(2)
    expect(p(state, 'p2').used.fourStop).toHaveLength(0)
    expect(p(state, 'p0').skips).toBe(0)
    // p1 はスキップを奪ったので飛ばされ、p2 の手番
    expect(turnOf(state)).toBe('p2')
    expect(p(state, 'p1').skips).toBe(0)
  })

  it('全員スキップなら8を出した人のスキップが残る', () => {
    let state = makeState({ hands: [['S8', 'C1'], ['H4', 'D4', 'H1'], ['D1']], placed: ['S7'] })
    state = act(state, { type: 'PLACE', playerId: 'p0', card: 'S8' })
    state = act(state, { type: 'REACT', playerId: 'p1', effect: 'skip' })
    expect(p(state, 'p0').skips).toBe(1)
    expect(turnOf(state)).toBe('p1')
  })

  it('使用済みの4では4止めできない', () => {
    let state = makeState({ hands: [['S8', 'C1'], ['H4', 'D4', 'H1'], ['D1']], placed: ['S7'] })
    p(state, 'p1').used.fourStop.push('H4', 'D4')
    state = act(state, { type: 'PLACE', playerId: 'p0', card: 'S8' })
    expect(state.phase).toBe('turn')
  })

  it('対象でない人は返事できない', () => {
    let state = makeState({ hands: [['S8', 'C1'], ['H4', 'D4', 'H1'], ['D1']], placed: ['S7'] })
    state = act(state, { type: 'PLACE', playerId: 'p0', card: 'S8' })
    expect(applyAction(state, { type: 'REACT', playerId: 'p2', effect: 'fourStop' }).ok).toBe(false)
  })
})

describe('9リバ・イレブンバック', () => {
  it('9で手番の向きが反転する', () => {
    let state = makeState({ hands: [['S9', 'C1'], ['H1'], ['D1'], ['C2']], placed: ['S7', 'S8'] })
    state = act(state, { type: 'PLACE', playerId: 'p0', card: 'S9' })
    expect(state.direction).toBe(-1)
    expect(turnOf(state)).toBe('p3')
  })

  it('9とJがそれぞれ反転し、2回で元に戻る', () => {
    let state = makeState({
      hands: [['S9', 'S11', 'C1'], ['H1'], ['D1'], ['C2']],
      placed: ['S7', 'S8', 'S10'],
    })
    // S10 は飛び地なので、S11 はまだ出せない
    expect(canPlace(state.board, 'S11')).toBe(false)
    state = act(state, { type: 'PLACE', playerId: 'p0', card: 'S9' })
    expect(turnOf(state)).toBe('p3')
    state = act(state, { type: 'PASS', playerId: 'p3' })
    state = act(state, { type: 'PASS', playerId: 'p2' })
    state = act(state, { type: 'PASS', playerId: 'p1' })
    // S9 で列が S10 まで繋がったので、S11 を出せる
    state = act(state, { type: 'PLACE', playerId: 'p0', card: 'S11' })
    expect(state.direction).toBe(1)
    expect(turnOf(state)).toBe('p1')
  })
})

describe('10捨て', () => {
  it('手札から1枚を隣接無視で出し、その効果は発動しない', () => {
    let state = makeState({ hands: [['S10', 'C5', 'H1'], ['D1'], ['D2']], placed: ['S7', 'S8', 'S9'] })
    state = act(state, { type: 'PLACE', playerId: 'p0', card: 'S10' })
    expect(state.pending?.type).toBe('tenDiscard')
    state = act(state, { type: 'TEN_DISCARD', playerId: 'p0', card: 'C5' })
    expect(cellAt(state.board, 'C', 5)?.forced).toBe(true)
    expect(p(state, 'p1').skips).toBe(0)
    expect(turnOf(state)).toBe('p1')
  })

  it('10を出した後の手札が1枚なら発生しない(禁止アガリ)', () => {
    let state = makeState({ hands: [['S10', 'H1'], ['D1'], ['D2']], placed: ['S7', 'S8', 'S9'] })
    state = act(state, { type: 'PLACE', playerId: 'p0', card: 'S10' })
    expect(state.phase).toBe('turn')
    expect(p(state, 'p0').hand).toEqual(['H1'])
  })

  it('ジョーカーを出すと除外される', () => {
    let state = makeState({ hands: [['S10', 'H1', JOKER], ['D1'], ['D2']], placed: ['S7', 'S8', 'S9'] })
    state = act(state, { type: 'PLACE', playerId: 'p0', card: 'S10' })
    state = act(state, { type: 'TEN_DISCARD', playerId: 'p0', card: JOKER })
    expect(state.jokerRemoved).toBe(true)
    expect(p(state, 'p0').hand).toEqual(['H1'])
  })

  it('手札がジョーカーだけになったら強制敗北', () => {
    let state = makeState({ hands: [['S10', 'H1', JOKER], ['D1'], ['D2']], placed: ['S7', 'S8', 'S9'] })
    state = act(state, { type: 'PLACE', playerId: 'p0', card: 'S10' })
    state = act(state, { type: 'TEN_DISCARD', playerId: 'p0', card: 'H1' })
    expect(p(state, 'p0').status).toBe('defeated')
    expect(state.jokerRemoved).toBe(true)
  })
})

describe('Qボンバー', () => {
  const RUN_TO_J = ['S7', 'S8', 'S9', 'S10', 'S11']

  it('全員(本人含む)の指定ランクが隣接無視で場に出る。その飛び地の隣には出せない', () => {
    let state = makeState({
      hands: [['S12', 'C13', 'C3'], ['H3', 'D3', 'C5'], ['S3', 'C9']],
      placed: RUN_TO_J,
    })
    state = act(state, { type: 'PLACE', playerId: 'p0', card: 'S12' })
    expect(legalActions(state, 'p1')).toHaveLength(0)
    state = act(state, { type: 'BOMB_RANK', playerId: 'p0', rank: 3 })
    for (const suit of ['S', 'H', 'D', 'C'] as const) {
      expect(cellAt(state.board, suit, 3)?.forced).toBe(true)
    }
    expect(canPlace(state.board, 'S2')).toBe(false)
    expect(canPlace(state.board, 'S4')).toBe(false)
    expect(p(state, 'p0').hand).toEqual(['C13'])
    expect(turnOf(state)).toBe('p1')
  })

  it('手札が0枚になった人は強制敗北、ジョーカーだけになった人も強制敗北', () => {
    let state = makeState({
      hands: [['S12', 'C13'], ['H3', 'D3'], ['S3', JOKER], ['C9', 'C10']],
      placed: RUN_TO_J,
    })
    state = act(state, { type: 'PLACE', playerId: 'p0', card: 'S12' })
    state = act(state, { type: 'BOMB_RANK', playerId: 'p0', rank: 3 })
    expect(state.log).toContainEqual({ type: 'DEFEATED', playerId: 'p1', reason: 'bomb' })
    expect(state.log).toContainEqual({ type: 'DEFEATED', playerId: 'p2', reason: 'onlyJoker' })
    expect(state.jokerRemoved).toBe(true)
  })

  it('同時に強制敗北した人は、敗北の理由に関係なく手番順に並ぶ', () => {
    // p1 はジョーカーだけが残り、p2 は手札が0枚になる。手番順なので p1 → p2
    let state = makeState({
      hands: [['S12', 'C13'], ['H3', JOKER], ['D3'], ['C9', 'C10']],
      placed: RUN_TO_J,
    })
    state = act(state, { type: 'PLACE', playerId: 'p0', card: 'S12' })
    state = act(state, { type: 'BOMB_RANK', playerId: 'p0', rank: 3 })
    expect(state.defeatedOrder).toEqual(['p1', 'p2'])
    expect(state.log).toContainEqual({ type: 'DEFEATED', playerId: 'p1', reason: 'onlyJoker' })
    expect(state.log).toContainEqual({ type: 'DEFEATED', playerId: 'p2', reason: 'bomb' })
  })

  it('逆回り中の同時の強制敗北は、逆回りの手番順に並ぶ', () => {
    // 逆回りなので p0 の次は p3 → p2 → p1。p3 はジョーカーだけ、p1 は手札0枚
    let state = makeState({
      hands: [['S12', 'C13'], ['D3'], ['C9', 'C10'], ['H3', JOKER]],
      placed: RUN_TO_J,
      direction: -1,
    })
    state = act(state, { type: 'PLACE', playerId: 'p0', card: 'S12' })
    state = act(state, { type: 'BOMB_RANK', playerId: 'p0', rank: 3 })
    expect(state.defeatedOrder).toEqual(['p3', 'p1'])
  })

  it('強制配置された8ではスキップしない', () => {
    let state = makeState({ hands: [['S12', 'C13'], ['H8', 'C5'], ['D1']], placed: RUN_TO_J })
    state = act(state, { type: 'PLACE', playerId: 'p0', card: 'S12' })
    state = act(state, { type: 'BOMB_RANK', playerId: 'p0', rank: 8 })
    expect(p(state, 'p1').skips).toBe(0)
  })
})

describe('ろくろっくび・救急車', () => {
  it('宣言してもそのターンは続き、次の自分の手番が飛ぶ', () => {
    let state = makeState({ hands: [['H6', 'D6', 'C1'], ['H1'], ['D1']] })
    state = act(state, { type: 'DECLARE', playerId: 'p0', effect: 'rokurokubi' })
    expect(turnOf(state)).toBe('p0')
    expect(p(state, 'p0').used.rokurokubi).toEqual(['H6', 'D6'])
    expect(legalActions(state, 'p0').some((a) => a.type === 'DECLARE')).toBe(false)

    state = act(state, { type: 'PASS', playerId: 'p0' })
    state = act(state, { type: 'PASS', playerId: 'p1' })
    state = act(state, { type: 'PASS', playerId: 'p2' })
    expect(turnOf(state)).toBe('p1')
    expect(p(state, 'p0').passesLeft).toBe(MAX_PASSES - 1)
  })

  it('6を4枚持っていれば2回使え、救急車と合わせてスキップが重なる', () => {
    let state = makeState({ hands: [['S6', 'H6', 'D6', 'C6', 'H9', 'D9', 'C1'], ['H1'], ['D1']] })
    state = act(state, { type: 'DECLARE', playerId: 'p0', effect: 'rokurokubi' })
    state = act(state, { type: 'DECLARE', playerId: 'p0', effect: 'rokurokubi' })
    state = act(state, { type: 'DECLARE', playerId: 'p0', effect: 'ambulance' })
    expect(p(state, 'p0').skips).toBe(3)
    expect(applyAction(state, { type: 'DECLARE', playerId: 'p0', effect: 'rokurokubi' }).ok).toBe(false)
  })

  it('救急車に使った9でも、通常配置すれば9リバが発動する', () => {
    let state = makeState({ hands: [['H9', 'D9', 'C1'], ['H1'], ['D1']], placed: ['H7', 'H8'] })
    state = act(state, { type: 'DECLARE', playerId: 'p0', effect: 'ambulance' })
    state = act(state, { type: 'PLACE', playerId: 'p0', card: 'H9' })
    expect(state.direction).toBe(-1)
  })

  it('手番でなければ宣言できない', () => {
    const state = makeState({ hands: [['C1'], ['H6', 'D6'], ['D1']] })
    expect(applyAction(state, { type: 'DECLARE', playerId: 'p1', effect: 'rokurokubi' }).ok).toBe(false)
  })
})

describe('パスと終局', () => {
  it('パス上限を超えると脱落し、手札は場へ、ジョーカーは除外', () => {
    let state = makeState({ hands: [['C2', JOKER], ['H1'], ['D1']] })
    p(state, 'p0').passesLeft = 0
    state = act(state, { type: 'PASS', playerId: 'p0' })
    expect(p(state, 'p0').status).toBe('eliminated')
    expect(cellAt(state.board, 'C', 2)?.forced).toBe(true)
    expect(state.jokerRemoved).toBe(true)
  })

  it('残り1人で終局し、順位は 上がり > 生き残り > 脱落 > 強制敗北', () => {
    let state = makeState({ hands: [['S8'], ['C2'], ['H8'], ['D1']], placed: ['S7', 'H7'] })
    state.players[1]!.status = 'eliminated'
    state.eliminatedOrder = ['p1']
    state.players[3]!.status = 'defeated'
    state.defeatedOrder = ['p3']
    state = act(state, { type: 'PLACE', playerId: 'p0', card: 'S8' })
    expect(state.phase).toBe('ended')
    expect(state.ranking).toEqual(['p0', 'p2', 'p1', 'p3'])
  })
})
