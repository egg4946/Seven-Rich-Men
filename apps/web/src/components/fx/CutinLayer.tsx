import type { CSSProperties } from 'react'
import { MINOR_KINDS } from '../../fx/events'
import { particleCount, useFx } from '../../fx/store'
import { cx } from '../../ui/cx'
import { RotateIcon } from '../../ui/icons'
import { BouncyText } from './BouncyText'
import { Kira, type KiraSpot } from './Kira'
import { Particles } from './Particles'

/** きらっと光らせるカットイン(上がり・終了・ジョーカー) */
const KIRA_KINDS = new Set(['finish', 'gameEnd', 'joker'])
/** 帯の上下の縁に散らすキラ(画面に対する %) */
const BAND_KIRA: KiraSpot[] = [
  { x: 18, y: 40, size: 22, delay: 0 },
  { x: 82, y: 58, size: 26, delay: 140 },
  { x: 30, y: 62, size: 14, delay: 260 },
  { x: 70, y: 38, size: 16, delay: 360 },
  { x: 92, y: 44, size: 12, delay: 460 },
  { x: 8, y: 56, size: 12, delay: 520 },
]

/**
 * 効果発動のカットイン。1つずつ順番に出す(待ち行列は fx/store)。
 * 画面の操作を妨げないよう pointer-events を切り、読み上げは通知に任せて aria-hidden にする。
 */
export function CutinLayer() {
  const cutin = useFx((s) => s.current)
  const level = useFx((s) => s.level)
  if (!cutin) return null

  const full = level === 'full'
  const style = { '--fx-dur': `${cutin.durationMs}ms` } as CSSProperties
  const tone = `fx-tone-${cutin.tone}`

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[45] overflow-hidden">
      {MINOR_KINDS.has(cutin.kind) ? (
        <div key={cutin.id} className={cx('fx-banner', tone)} style={style}>
          <p className="fx-banner-title">{cutin.title}</p>
          {cutin.sub && <p className="fx-banner-sub">{cutin.sub}</p>}
        </div>
      ) : (
        <div key={cutin.id} className={cx('fx-cutin', tone)} style={style}>
          {full && <div className="fx-flash" />}
          {full && cutin.kind === 'bomb' && (
            <>
              <span className="fx-shock" />
              <span className="fx-shock fx-shock-late" />
            </>
          )}
          {/* 淡い帯が先に開いて後から閉じ、帯に厚みを出す(2層のワイプ) */}
          <div className="fx-band-under" />
          <div className="fx-band">
            <span className="fx-band-shine" />
          </div>
          {cutin.kind === 'slash' && <span className="fx-slash" />}
          {cutin.kind === 'reverse' && <RotateIcon direction={1} className="fx-spin" />}
          <div className="fx-text">
            {cutin.by && <p className="fx-by">{cutin.by} の</p>}
            <p className="fx-title">
              <BouncyText text={cutin.title} className="fx-char" />
            </p>
            {cutin.sub && <p className="fx-sub">{cutin.sub}</p>}
          </div>
          {full && KIRA_KINDS.has(cutin.kind) && (
            <Kira
              spots={BAND_KIRA}
              color={cutin.tone === 'gold' ? '#fde68a' : '#ffffff'} delay={Math.round(cutin.durationMs * 0.2)} />
          )}
          {cutin.kind === 'joker' && <Particles variant="spark" count={particleCount(16, level)} />}
          {(cutin.kind === 'finish' || cutin.kind === 'gameEnd') &&
            (cutin.mine ? (
              <Particles variant="confetti" count={particleCount(40, level)} />
            ) : (
              cutin.kind === 'finish' && <Particles variant="spark" count={particleCount(12, level)} />
            ))}
        </div>
      )}
    </div>
  )
}
