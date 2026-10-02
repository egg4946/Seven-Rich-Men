import type { CSSProperties } from 'react'

/**
 * 文字を1文字ずつ span に分けて、時間差で動かす(.fx-letter / .fx-char)。
 * 1文字ずつ読み上げられないよう、分けた文字は aria-hidden にして、元の文は sr-only で添える。
 */
export function BouncyText({
  text,
  className = 'fx-letter',
  fromMs,
}: {
  text: string
  /** 1文字ずつに付けるクラス */
  className?: string
  /** 最初の文字が動きはじめるまでの時間(.fx-letter の --from) */
  fromMs?: number
}) {
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {Array.from(text).map((char, i) => (
          <span
            key={i}
            className={className}
            style={{ '--i': i, ...(fromMs !== undefined && { '--from': `${fromMs}ms` }) } as CSSProperties}
          >
            {char === ' ' ? ' ' : char}
          </span>
        ))}
      </span>
    </>
  )
}

/** 待っている間の3つの点。つぶれて跳ねる */
export function LoadingDots() {
  return (
    <span aria-hidden="true" className="fx-dots">
      {[0, 1, 2].map((i) => (
        <i key={i} style={{ '--i': i } as CSSProperties} />
      ))}
    </span>
  )
}
