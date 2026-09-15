import { describe, expect, it } from 'vitest'
import { handOverlap } from './handLayout'

/** 重ねたときに1行に入る枚数(Hand.tsx と同じく、左端に overlap の余白を入れる) */
function perRow(containerWidth: number, cardWidth: number, overlap: number): number {
  return Math.floor((containerWidth - overlap) / (cardWidth - overlap))
}

describe('handOverlap', () => {
  it('2行に収まる枚数なら重ねない', () => {
    // 328px 幅に 44px のカードが 4px 間隔で6枚ずつ並ぶ
    expect(handOverlap(12, 328, 44, 4)).toBe(0)
    expect(handOverlap(0, 328, 44, 4)).toBe(0)
  })

  it('2行に収まらなければ、1行の半分ずつ入るように重ねる', () => {
    const overlap = handOverlap(17, 328, 44, 4)
    expect(overlap).toBeGreaterThan(0)
    expect(perRow(328, 44, overlap)).toBeGreaterThanOrEqual(9)
    expect(44 - overlap).toBeGreaterThanOrEqual(24)
  })

  it('間隔をなくすだけで2行に入るときも、重ねる側に切り替える', () => {
    // 358px 幅: 間隔ありだと1行7枚、間隔なしなら8枚入る
    const overlap = handOverlap(15, 358, 44, 4)
    expect(overlap).toBeGreaterThan(0)
    expect(perRow(358, 44, overlap)).toBeGreaterThanOrEqual(8)
  })

  it('重ねすぎて読めなくなるなら、3行に増やす', () => {
    const overlap = handOverlap(30, 328, 44, 4)
    expect(44 - overlap).toBeGreaterThanOrEqual(24)
    expect(perRow(328, 44, overlap) * 3).toBeGreaterThanOrEqual(30)
  })

  it('広い画面では重ねない', () => {
    expect(handOverlap(20, 1100, 56, 8)).toBe(0)
  })
})
