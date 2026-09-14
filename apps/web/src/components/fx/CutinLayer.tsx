import type { CSSProperties } from 'react'
import { MINOR_KINDS } from '../../fx/events'
import { particleCount, useFx } from '../../fx/store'
import { cx } from '../../ui/cx'
import { RotateIcon } from '../../ui/icons'
import { Particles } from './Particles'

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
          <div className="fx-band">
            <span className="fx-band-shine" />
          </div>
          {cutin.kind === 'slash' && <span className="fx-slash" />}
          {cutin.kind === 'reverse' && <RotateIcon direction={1} className="fx-spin" />}
          <div className="fx-text">
            {cutin.by && <p className="fx-by">{cutin.by} の</p>}
            <p className="fx-title">{cutin.title}</p>
            {cutin.sub && <p className="fx-sub">{cutin.sub}</p>}
          </div>
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
