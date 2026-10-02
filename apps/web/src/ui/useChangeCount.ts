import { useState } from 'react'

/**
 * 値が変わった回数(最初の表示は0)。key に使うと、値が変わったときだけ CSS アニメーションを出し直せる。
 * 最初の表示で動かさないので、画面を開いただけで数字が揺れることはない。
 */
export function useChangeCount<T>(value: T): number {
  const [state, setState] = useState({ value, count: 0 })
  if (!Object.is(state.value, value)) {
    // 描画中に前の値と比べて更新する(React の「前の props を覚える」書き方。effect を待たずに1回で描ける)
    const next = { value, count: state.count + 1 }
    setState(next)
    return next.count
  }
  return state.count
}
