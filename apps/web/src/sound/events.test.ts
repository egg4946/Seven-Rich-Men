import { describe, expect, it } from 'vitest'
import { cardId, type GameEvent } from '@srm/game-core'
import { cutinSounds, soundsFor } from './events'

const YOU = 'you'

describe('soundsFor', () => {
  it('飛ばしたカードは、着地に合わせて1枚ずつ鳴らす', () => {
    const events: GameEvent[] = [
      { type: 'PLACED', playerId: YOU, card: cardId('S', 6), forced: false },
      { type: 'PLACED', playerId: YOU, card: cardId('S', 5), forced: false },
    ]
    expect(soundsFor(events, YOU, 600)).toEqual([
      { name: 'cardPut', delayMs: 600 },
      { name: 'cardPut', delayMs: 680 },
    ])
  })

  it('飛ばさずに置かれるカードは、まとめて1回だけすぐに鳴らす', () => {
    const many: GameEvent[] = [1, 2, 3, 4, 5].map((rank) => ({
      type: 'PLACED',
      playerId: 'cpu1',
      card: cardId('C', rank),
      forced: true,
    }))
    expect(soundsFor(many, YOU, 600)).toEqual([{ name: 'cardPut', delayMs: 0 }])
  })

  it('パスは誰のものでも鳴らし、最初の7の配置では鳴らさない', () => {
    expect(soundsFor([{ type: 'PASSED', playerId: 'cpu1', passesLeft: 2 }], YOU, 600)).toEqual([{ name: 'pass', delayMs: 0 }])
    expect(soundsFor([{ type: 'SEVENS_PLACED', playerId: 'cpu1', cards: [cardId('S', 7)] }], YOU, 600)).toEqual([])
  })

  it('ドパガキモードでは、着地のたびにコインの音を重ね、コンボが伸びるほど高くする', () => {
    const events: GameEvent[] = [{ type: 'PLACED', playerId: YOU, card: cardId('S', 6), forced: false }]
    expect(soundsFor(events, YOU, 600, 0)).toEqual([
      { name: 'cardPut', delayMs: 600 },
      { name: 'dopaCoin', delayMs: 600, rate: 1 },
    ])
    const [, coin] = soundsFor(events, YOU, 600, 5)
    expect(coin?.rate).toBeGreaterThan(1)
    expect(soundsFor([{ type: 'PASSED', playerId: 'cpu1', passesLeft: 2 }], YOU, 600, 3)).toEqual([{ name: 'pass', delayMs: 0 }])
  })
})

describe('cutinSounds', () => {
  it('自分が1位の GAME SET にだけ歓声を重ねる', () => {
    expect(cutinSounds({ kind: 'gameEnd', mine: true })).toEqual(['gameEnd', 'win'])
    expect(cutinSounds({ kind: 'gameEnd', mine: false })).toEqual(['gameEnd'])
  })

  it('カードの効果・自分の番・脱落は鳴らさない', () => {
    expect(cutinSounds({ kind: 'slash', mine: true })).toEqual([])
    expect(cutinSounds({ kind: 'turn', mine: true })).toEqual([])
    expect(cutinSounds({ kind: 'out', mine: true })).toEqual([])
  })

  it('ドパガキモードでは、カードの効果・自分の番・脱落にも音を重ねる', () => {
    expect(cutinSounds({ kind: 'slash', mine: true }, true)).toEqual(['dopaSlash'])
    expect(cutinSounds({ kind: 'turn', mine: true }, true)).toEqual(['dopaTurn'])
    expect(cutinSounds({ kind: 'out', mine: false }, true)).toEqual(['dopaOut'])
    expect(cutinSounds({ kind: 'finish', mine: true }, true)).toEqual(['finish', 'dopaFanfare'])
    expect(cutinSounds({ kind: 'gameEnd', mine: true }, true)).toEqual(['gameEnd', 'win'])
    // Qボンバーの爆発は、盤面が弾け飛ぶところで鳴らす(fx/store)
    expect(cutinSounds({ kind: 'bomb', mine: true }, true)).toEqual([])
  })
})
