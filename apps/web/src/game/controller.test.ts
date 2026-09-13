import { describe, expect, it } from 'vitest'
import { applyAction, seededRng, whoMustAct } from '@srm/game-core'
import { HUMAN_ID, createSoloGame, decideCpu, decisionKey, timeoutAction } from './controller'

describe('ソロ対戦の進行', () => {
  it('人間とCPUの人数、名前が設定される', () => {
    const state = createSoloGame({ name: '  たろう ', cpuCount: 4, level: 'normal' }, seededRng(1))
    expect(state.players).toHaveLength(5)
    expect(state.players[0]).toMatchObject({ id: HUMAN_ID, name: 'たろう', isCpu: false })
    expect(state.players.slice(1).every((p) => p.isCpu)).toBe(true)
  })

  it('名前が空なら「あなた」、CPUの人数は2〜5人に丸める', () => {
    const state = createSoloGame({ name: '', cpuCount: 9, level: 'easy' }, seededRng(1))
    expect(state.players[0]?.name).toBe('あなた')
    expect(state.players).toHaveLength(6)
  })

  it('人間がずっと時間切れでも、最後まで進んで終局する', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      let state = createSoloGame({ name: 'テスト', cpuCount: 3, level: 'normal' }, seededRng(seed))
      const rng = seededRng(seed * 31)
      let steps = 0
      while (state.phase !== 'ended' && steps < 5000) {
        const actor = whoMustAct(state)[0]
        if (!actor) throw new Error('誰の入力も待っていない')
        const action = actor === HUMAN_ID ? timeoutAction(state, actor) : decideCpu(state, actor, 'normal', rng)
        if (!action) throw new Error(`${actor} の操作が決まらない`)
        const result = applyAction(state, action)
        if (!result.ok) throw new Error(`${action.type}: ${result.error}`)
        state = result.state
        steps++
      }
      expect(state.phase).toBe('ended')
      expect(state.ranking).toContain(HUMAN_ID)
    }
  })

  it('手番中の宣言では decisionKey が変わらず、パスすると変わる', () => {
    // 7渡しを済ませて、人間の手番が来るまで CPU に進めさせる
    let state = createSoloGame({ name: 'テスト', cpuCount: 2, level: 'normal' }, seededRng(11))
    let guard = 0
    while (!(state.phase === 'turn' && whoMustAct(state)[0] === HUMAN_ID) && guard++ < 200) {
      const actor = whoMustAct(state)[0]!
      const action = actor === HUMAN_ID ? timeoutAction(state, actor)! : decideCpu(state, actor, 'normal')!
      const result = applyAction(state, action)
      if (!result.ok) throw new Error(result.error)
      state = result.state
    }
    const before = decisionKey(state)
    const passed = applyAction(state, { type: 'PASS', playerId: HUMAN_ID })
    if (!passed.ok) throw new Error(passed.error)
    expect(decisionKey(passed.state)).not.toBe(before)
  })
})
