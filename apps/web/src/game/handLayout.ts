/** 重ねても、1枚あたりこれだけは見えるようにする(ランクと記号が読め、指で押せる幅) */
const MIN_VISIBLE_PX = 24

/**
 * 手札を何行までに収めたいか。スマホで手札が3行になると、操作パネルが場を覆ってしまう。
 * 重ねても MIN_VISIBLE_PX を下回るときだけ、行を増やす。
 */
const MAX_ROWS = 2

/**
 * 手札のカードを左隣にどれだけ重ねるか(px)。0 なら重ねずに普通に並べる。
 * 重ねたときは、各カードを overlap だけ左にずらし、並びの左端に同じだけ余白を入れる前提で、
 * 1行に ceil(枚数 / 行数) 枚が入る値を返す。
 */
export function handOverlap(count: number, containerWidth: number, cardWidth: number, gap: number): number {
  if (count === 0 || containerWidth <= 0 || cardWidth <= 0) return 0
  const perRow = Math.max(1, Math.floor((containerWidth + gap) / (cardWidth + gap)))
  if (count <= perRow * MAX_ROWS) return 0

  for (let rows = MAX_ROWS; ; rows++) {
    const inRow = Math.ceil(count / rows)
    if (inRow <= perRow) return 0
    // inRow 枚が1行に入る条件: inRow * cardWidth - (inRow - 1) * overlap <= containerWidth
    const overlap = Math.ceil((inRow * cardWidth - containerWidth) / (inRow - 1))
    // 間隔をなくすだけで入るとき(overlap <= 0)も、0 を返すと普通の間隔に戻って入らないので、最低 1px は重ねる
    if (cardWidth - overlap >= MIN_VISIBLE_PX) return Math.max(1, overlap)
  }
}
