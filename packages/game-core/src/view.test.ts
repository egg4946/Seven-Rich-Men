import { describe, expect, it } from 'vitest'
import { whoMustAct } from './legal.js'
import { seededRng } from './rng.js'
import { createGame } from './setup.js'
import { act, makeState, p } from './testing.js'
import { viewFor } from './view.js'

describe('viewFor', () => {
  it('他人の手札は枚数しか見えない', () => {
    const state = makeState({ hands: [['C1'], ['C13', 'H2'], ['D1']] })
    const view = viewFor(state, 'p0')!
    const opponent = view.opponents.find((o) => o.id === 'p1')!
    expect(opponent.handCount).toBe(2)
    expect('hand' in opponent).toBe(false)
    expect(JSON.stringify(view)).not.toContain('"C13"')
  })

  it('公開(使用済み)のカードは他人にも見える', () => {
    let state = makeState({ hands: [['C1'], ['H6', 'D6', 'H1'], ['D1']], turnIndex: 1 })
    state = act(state, { type: 'DECLARE', playerId: 'p1', effect: 'rokurokubi' })
    const opponent = viewFor(state, 'p0')!.opponents.find((o) => o.id === 'p1')!
    expect(opponent.revealed).toEqual(['H6', 'D6'])
  })

  it('7渡しで他人が選んだカードは見えない', () => {
    let state = createGame({
      players: Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isCpu: true })),
      rng: seededRng(42),
    })
    const [first, second] = whoMustAct(state)
    if (!first || !second || state.pending?.type !== 'giveSevens') throw new Error('setup')
    const count = state.pending.required[first] ?? 0
    const cards = p(state, first).hand.slice(0, count)
    state = act(state, { type: 'GIVE_SEVENS', playerId: first, cards })

    const other = viewFor(state, second)!
    expect(JSON.stringify(other.pending)).not.toContain(cards[0]!)
    expect(other.pending).toMatchObject({ type: 'giveSevens' })
    if (other.pending?.type === 'giveSevens') expect(other.pending.waitingFor).not.toContain(first)
    expect(viewFor(state, first)!.pending).toMatchObject({ yourCount: 0 })
  })

  it('割り込み宣言の受付で、誰が宣言できるかは本人以外に見えない', () => {
    let state = makeState({ hands: [['S8', 'C1'], ['H4', 'D4', 'H1'], ['D1']], placed: ['S7'] })
    state = act(state, { type: 'PLACE', playerId: 'p0', card: 'S8' })

    const eligible = viewFor(state, 'p1')!
    const bystander = viewFor(state, 'p2')!
    expect(eligible.pending).toMatchObject({ type: 'fourStop', yourTurnToAnswer: true })
    expect(eligible.legalActions).toHaveLength(2)
    expect(bystander.pending).toMatchObject({ type: 'fourStop', yourTurnToAnswer: false })
    expect(bystander.legalActions).toHaveLength(0)
    expect(JSON.stringify(bystander)).not.toContain('eligible')
  })
})
