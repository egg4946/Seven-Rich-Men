import { useEffect, useState, type CSSProperties } from 'react'

/** 5本の帯が抜けはじめる時間のずれ(ms)。上から順ではなく、ばらして並べる */
const BLOCK_DELAYS = [50, 150, 0, 200, 100]
/** 一番遅い帯が抜け切るまで(幕の 560ms + 淡い幕の遅れ 140ms + 帯のずれ 200ms)に余裕を足した時間 */
const WIPE_MS = 1000

/**
 * 画面が切り替わったときに、2色の幕が帯ごとに時間差で抜けて新しい画面を見せる。
 * 新しい画面と一緒に出して(key で出し直す)、抜け切ったら DOM から外す。操作は妨げない。
 */
export function ScreenWipe() {
  const [done, setDone] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setDone(true), WIPE_MS)
    return () => clearTimeout(timer)
  }, [])
  if (done) return null
  return (
    <div aria-hidden="true" className="fx-wipe">
      {BLOCK_DELAYS.map((d, i) => (
        <span key={i} className="fx-wipe-block" style={{ '--d': `${d}ms` } as CSSProperties} />
      ))}
    </div>
  )
}
