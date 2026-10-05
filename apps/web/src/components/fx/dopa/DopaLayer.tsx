import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  FEVER_COMBO,
  GOD_COMBO,
  SUPER_COMBO,
  comboRank,
  formatPower,
  multTier,
  powerTier,
  type DopaMilestone,
} from '../../../fx/dopa'
import { MINOR_KINDS, type CutinKind } from '../../../fx/events'
import {
  DOPA_BLACKOUT_MS,
  DOPA_BLAST_HUSH_MS,
  DOPA_FREEZE_MS,
  dopaFreezes,
  useFx,
  type BlastTarget,
  type Cutin,
} from '../../../fx/store'
import { useGameStore } from '../../../game/store'
import { useSound } from '../../../sound/store'
import { cx } from '../../../ui/cx'
import { burstAt, cannons, fireworks, jackpotRain, sparkAt } from './confetti'
import '../../../dopa.css'

/**
 * ドパガキモード(ネタ枠)の飾り。ふだんは静かにしておき、きっかけがあったときにだけ一気に騒がしくする
 * (静と動の差を付ける)。きっかけは、コンボが伸びる・大きな効果のカットイン・リーチ・PUSH の連打。
 * - 画面隅の POWER: 誰かがカードを出すたびに「×〇倍!!」が出て足される。倍率も数も、大きくなるほど派手に出す
 * - コンボ: 自分が出し続けた数(COMBO)とランク、場に続けて出た数(CHAIN)。伸びるほど倍率が跳ね上がる
 * - 暗転: 自分のカードでたまに真っ暗になって止まり、明けたら上乗せの倍率が出る
 * - FEVER(コンボ5から): 電飾と集中線が付き、コンボが切れると消えて静かに戻る
 * - 盤面・手札が弾け飛ぶ: 暗くして溜めてから弾け、元に戻る
 * 見た目だけのものなので aria-hidden にし、操作は通す。
 */
export function DopaLayer() {
  const on = useFx((s) => s.level === 'dopa')
  return on ? <DopaStage /> : null
}

/** カットインと一緒に落とすもの */
const YAKUMONO: Partial<Record<CutinKind, string>> = { bomb: '💣', joker: 'JOKER', finish: '7' }
/** カットインの前触れに、カードの群れを必ず走らせる種類 */
const SWARM_ALWAYS = new Set<CutinKind>(['bomb', 'joker', 'finish', 'gameEnd'])
/** 説明を読んでもらうカットイン。飾りを重ねない */
const QUIET_KINDS = new Set<CutinKind>(['sevens', 'exchange'])

const MILESTONE_TEXT: Record<DopaMilestone, string> = { fever: 'FEVER突入!!', super: '超FEVER!!', god: '神FEVER!!!' }

/** 弾け飛んで戻るまでの時間 */
const BLAST_MS = 1500

function DopaStage() {
  const cutin = useFx((s) => s.current)
  const dopa = useFx((s) => s.dopa)
  const flights = useFx((s) => s.flights)
  const inGame = useGameStore((s) => s.screen === 'game')
  // 自分の手札が残り1枚の間は、画面の枠を脈打たせる
  const myReach = useGameStore((s) => s.screen === 'game' && s.view?.phase === 'turn' && s.view.you.hand.length === 1)

  /** 最後にカードが着いたマスの中心(倍率を、そこから出す) */
  const lastLanding = useRef<{ x: number; y: number } | null>(null)

  // きっかけがあった間だけ、電飾と集中線を付ける(FEVER 中は付けたままにする)
  const [flaring, setFlaring] = useState(false)
  const flareEnd = useRef(0)
  const flareTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flare = useCallback((ms: number) => {
    const end = performance.now() + ms
    if (end <= flareEnd.current) return
    flareEnd.current = end
    setFlaring(true)
    if (flareTimer.current) clearTimeout(flareTimer.current)
    flareTimer.current = setTimeout(() => setFlaring(false), ms)
  }, [])
  useEffect(() => () => void (flareTimer.current && clearTimeout(flareTimer.current)), [])

  const fever = dopa.combo >= FEVER_COMBO
  const hype = fever || flaring
  // ボタンや出せるマスの印も、騒がしい間だけ虹色にする(dopa.css)
  useEffect(() => {
    document.documentElement.toggleAttribute('data-dopa-hype', hype)
    return () => document.documentElement.removeAttribute('data-dopa-hype')
  }, [hype])

  // ボタンや手札を押した位置で火花を出す
  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target.closest('button, label, [role="button"]') : null
      if (target) sparkAt(event.clientX, event.clientY)
    }
    window.addEventListener('pointerdown', onDown, { capture: true })
    return () => window.removeEventListener('pointerdown', onDown, { capture: true })
  }, [])

  // カードが場に着くたびに、そのマスから紙吹雪を吹き上げる
  const seenFlights = useRef(new Set<number>())
  const landingTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => {
    for (const flight of flights) {
      if (seenFlights.current.has(flight.id)) continue
      seenFlights.current.add(flight.id)
      const rect = document.querySelector(`[data-cell="${flight.cell}"]`)?.getBoundingClientRect()
      if (!rect) continue
      const at = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      lastLanding.current = at
      landingTimers.current.push(setTimeout(() => burstAt(at.x, at.y), flight.delayMs + flight.durationMs))
    }
  }, [flights])
  useEffect(() => {
    const timers = landingTimers.current
    return () => timers.forEach(clearTimeout)
  }, [])

  // 大きなカットインに合わせて、音と紙吹雪を重ねる
  const cutinId = cutin?.id
  useEffect(() => {
    const current = useFx.getState().current
    if (!current || current.id !== cutinId || MINOR_KINDS.has(current.kind) || QUIET_KINDS.has(current.kind)) return
    const sound = useSound.getState()
    const timers: ReturnType<typeof setTimeout>[] = []
    let stopFireworks: (() => void) | null = null
    const freeze = dopaFreezes(current) ? DOPA_FREEZE_MS : 0
    flare(current.durationMs)

    if (freeze > 0) {
      // 暗転して溜めてから、一気に弾ける
      sound.play('dopaJackpot', freeze)
      timers.push(
        setTimeout(() => {
          cannons(140)
          jackpotRain()
          stopFireworks = fireworks(current.durationMs - freeze)
        }, freeze),
      )
    } else {
      cannons(current.kind === 'bomb' || current.kind === 'joker' || current.kind === 'start' ? 110 : 60)
    }
    if (YAKUMONO[current.kind]) sound.play('dopaDrop', freeze + 330)

    return () => {
      timers.forEach(clearTimeout)
      stopFireworks?.()
    }
  }, [cutinId, flare])

  // リーチの間も騒がしくする
  const reachSeq = dopa.reach?.seq
  useEffect(() => {
    if (reachSeq !== undefined) flare(1900)
  }, [reachSeq, flare])

  // 盤面・手札を弾け飛ばす
  const blastSeq = dopa.blast?.seq
  useEffect(() => {
    const blast = useFx.getState().dopa.blast
    if (!blast || blast.seq !== blastSeq) return
    flare(BLAST_MS + 300)
    const animations = scatter(blast.target)
    const timer = setTimeout(() => cannons(130), DOPA_BLAST_HUSH_MS)
    return () => {
      clearTimeout(timer)
      animations.forEach((a) => a.cancel())
    }
  }, [blastSeq, flare])

  // 暗転が明けたところで、一気に騒がしくする
  const blackoutSeq = dopa.blackout?.seq
  useEffect(() => {
    if (blackoutSeq === undefined) return
    let stopFireworks: (() => void) | null = null
    const timer = setTimeout(() => {
      flare(1700)
      cannons(150)
      stopFireworks = fireworks(1200)
    }, DOPA_BLACKOUT_MS)
    return () => {
      clearTimeout(timer)
      stopFireworks?.()
    }
  }, [blackoutSeq, flare])

  // 倍率は、カードが着いたマスから出す
  const multSeq = dopa.mult?.seq
  const [multAt, setMultAt] = useState({ x: 0, y: 0 })
  useEffect(() => {
    if (multSeq !== undefined) setMultAt(lastLanding.current ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 })
  }, [multSeq])

  const big = cutin && !MINOR_KINDS.has(cutin.kind) && !QUIET_KINDS.has(cutin.kind) ? cutin : null
  const yakumono = big ? YAKUMONO[big.kind] : undefined
  const freeze = !!big && dopaFreezes(big)
  const swarm = !!big && big.kind !== 'start' && (SWARM_ALWAYS.has(big.kind) || big.id % 2 === 0)
  const tier = dopa.combo >= GOD_COMBO ? 'god' : dopa.combo >= SUPER_COMBO ? 'super' : fever ? 'fever' : 'calm'

  return (
    <div aria-hidden="true" className="dopa-layer">
      {hype && (
        <>
          <div className="dopa-sunburst" />
          <Marquee />
        </>
      )}
      {myReach && <div className="dopa-reach-frame" />}

      {inGame && (
        <div className={cx('dopa-hud', `dopa-hud-${tier}`)}>
          <div className={cx('dopa-total', `dopa-total-${powerTier(dopa.power)}`)}>
            <span>POWER</span>
            <b key={multSeq ?? 0}>
              <CountUp value={dopa.power} />
            </b>
          </div>
          {dopa.combo >= 2 && (
            <div key={dopa.combo} className="dopa-combo">
              <i>{comboRank(dopa.combo)}</i>
              <b>{dopa.combo}</b>
              <span>COMBO</span>
            </div>
          )}
          {dopa.chain >= 3 && (
            <div key={`chain-${dopa.chain}`} className="dopa-chain">
              場 <b>{dopa.chain}</b> CHAIN
            </div>
          )}
        </div>
      )}

      {dopa.blast && <div key={`hush-${dopa.blast.seq}`} className="dopa-hush" />}
      {dopa.blackout && (
        <div
          key={`blackout-${dopa.blackout.seq}`}
          className="dopa-blackout"
          style={{ '--wait': `${DOPA_BLACKOUT_MS}ms` } as CSSProperties}
        >
          <span className="dopa-blackout-dark" />
          <span className="dopa-blackout-dot" />
          <span className="dopa-blackout-flash" />
          <p className="dopa-blackout-mult">
            <small>暗転チャンス</small>
            <b>×{formatPower(dopa.blackout.mult)}倍!!</b>
          </p>
        </div>
      )}
      {swarm && big && <Swarm key={`swarm-${big.id}`} seed={big.id} />}
      {freeze && big && <Freeze key={`freeze-${big.id}`} cutin={big} />}
      {yakumono && big && (
        <div
          key={`yaku-${big.id}`}
          className={cx('dopa-yakumono', yakumono.length > 2 && 'dopa-yakumono-word')}
          style={{ '--dur': `${big.durationMs}ms`, '--wait': `${freeze ? DOPA_FREEZE_MS : 0}ms` } as CSSProperties}
        >
          <span>{yakumono}</span>
          <i className="dopa-yakumono-shock" />
        </div>
      )}

      {dopa.reach && (
        <div key={dopa.reach.seq} className="dopa-reach">
          <span className="dopa-lamp dopa-lamp-left" />
          <span className="dopa-lamp dopa-lamp-right" />
          <div className="dopa-reach-band">
            <p className="dopa-reach-title">リーチ!</p>
            <p className="dopa-reach-sub">{dopa.reach.name} あと1枚</p>
          </div>
        </div>
      )}

      {dopa.milestone && (
        <div key={dopa.milestone.seq} className={cx('dopa-milestone', `dopa-milestone-${dopa.milestone.kind}`)}>
          <p>{MILESTONE_TEXT[dopa.milestone.kind]}</p>
        </div>
      )}

      {dopa.broke && (
        <div key={dopa.broke.seq} className="dopa-break">
          <p>COMBO BREAK…</p>
          <span>{dopa.broke.combo} COMBO で終了</span>
        </div>
      )}

      {dopa.praise && (
        <p
          key={dopa.praise.seq}
          className={cx('dopa-praise', dopa.praise.hot && 'dopa-praise-hot')}
          style={
            {
              left: `${50 + ((dopa.praise.seq * 37) % 36) - 18}%`,
              top: `${24 + ((dopa.praise.seq * 53) % 16)}%`,
              '--tilt': `${((dopa.praise.seq * 29) % 24) - 12}deg`,
            } as CSSProperties
          }
        >
          <span>{dopa.praise.text}</span>
        </p>
      )}

      {dopa.mult && (
        <div
          key={dopa.mult.seq}
          className={cx('dopa-mult', dopa.mult.mine ? `dopa-mult-${multTier(dopa.mult.value)}` : 'dopa-mult-other')}
          // 1000倍からは、画面の真ん中に大きく出す
          style={
            dopa.mult.mine && multTier(dopa.mult.value) >= 3
              ? { left: '50%', top: '46%' }
              : { left: multAt.x, top: multAt.y }
          }
        >
          <b>×{formatPower(dopa.mult.value)}倍!!</b>
          <span>+{formatPower(dopa.mult.gain)}</span>
        </div>
      )}
    </div>
  )
}

/**
 * 盤面のカード・手札を弾け飛ばす。少し縮んで溜めてから外へ飛び、回りながら元の位置へ戻る。
 * もとの位置やつぶれ(Motion の transform)に足す形で動かすので、終わればそのまま元に戻る。
 */
function scatter(target: BlastTarget): Animation[] {
  const selectors = [
    target !== 'hand' ? '[data-cell] > *' : '',
    target !== 'board' ? '[data-card]' : '',
  ].filter(Boolean)
  const elements = Array.from(document.querySelectorAll<HTMLElement>(selectors.join(', ')))
  if (elements.length === 0) return []
  const rects = elements.map((el) => el.getBoundingClientRect())
  const cx0 = rects.reduce((sum, r) => sum + r.left + r.width / 2, 0) / rects.length
  const cy0 = rects.reduce((sum, r) => sum + r.top + r.height / 2, 0) / rects.length
  const hush = DOPA_BLAST_HUSH_MS / BLAST_MS
  return elements.flatMap((el, i) => {
    if (typeof el.animate !== 'function') return []
    const rect = rects[i]!
    // 群れの中心から外へ。中心に近いものも止まって見えないよう、向きをばらつかせる
    const angle = Math.atan2(rect.top + rect.height / 2 - cy0, rect.left + rect.width / 2 - cx0) + (Math.random() - 0.5) * 1.4
    const distance = 140 + Math.random() * 320
    const dx = Math.round(Math.cos(angle) * distance)
    const dy = Math.round(Math.sin(angle) * distance - 80)
    const rot = Math.round((Math.random() - 0.5) * 1080)
    return [
      el.animate(
        [
          { transform: 'translate(0px, 0px) rotate(0deg) scale(1)', offset: 0 },
          { transform: 'translate(0px, 0px) rotate(0deg) scale(0.82)', offset: hush, easing: 'cubic-bezier(0, 0.9, 0.2, 1)' },
          { transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(1.3)`, offset: 0.52 },
          {
            transform: `translate(${Math.round(dx * 1.06)}px, ${Math.round(dy * 1.06) + 24}px) rotate(${Math.round(rot * 1.1)}deg) scale(1.25)`,
            offset: 0.68,
            easing: 'cubic-bezier(0.5, 0, 0.2, 1.4)',
          },
          { transform: 'translate(0px, 0px) rotate(0deg) scale(1)', offset: 1 },
        ],
        { duration: BLAST_MS, composite: 'add' },
      ),
    ]
  })
}

/** 数字を回しながら増やす */
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const start = from.current
    if (start === value) return
    const began = performance.now()
    let frame = 0
    const step = (now: number) => {
      const t = Math.min((now - began) / 600, 1)
      const current = start + (value - start) * (1 - (1 - t) ** 3)
      from.current = current
      setShown(current)
      if (t < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [value])
  return <>{formatPower(shown)}</>
}

/** 画面の四辺を走る電飾 */
function Marquee() {
  return (
    <>
      <span className="dopa-marquee dopa-marquee-top" />
      <span className="dopa-marquee dopa-marquee-bottom" />
      <span className="dopa-marquee dopa-marquee-left" />
      <span className="dopa-marquee dopa-marquee-right" />
    </>
  )
}

const SWARM_MARKS = ['♠', '♥', '♦', '♣', '7', '★']

/** カードの群れが画面を横に駆け抜ける */
function Swarm({ seed }: { seed: number }) {
  const items = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => {
        const n = seed * 7 + i * 13
        return {
          mark: SWARM_MARKS[n % SWARM_MARKS.length]!,
          red: n % SWARM_MARKS.length === 1 || n % SWARM_MARKS.length === 2,
          style: {
            top: `${(n * 17) % 92}%`,
            fontSize: `${28 + ((n * 11) % 44)}px`,
            animationDelay: `${(i * 23) % 420}ms`,
            animationDuration: `${520 + ((n * 7) % 300)}ms`,
          } as CSSProperties,
        }
      }),
    [seed],
  )
  return (
    <div className="dopa-swarm">
      {items.map((item, i) => (
        <span key={i} className={cx(item.red && 'dopa-swarm-red')} style={item.style}>
          {item.mark}
        </span>
      ))}
    </div>
  )
}

/** 暗転して溜めてから、虹色に弾けて勝ちを祝う */
function Freeze({ cutin }: { cutin: Cutin }) {
  const style = { '--dur': `${cutin.durationMs}ms`, '--wait': `${DOPA_FREEZE_MS}ms` } as CSSProperties
  return (
    <div className="dopa-freeze" style={style}>
      <span className="dopa-freeze-dark" />
      <span className="dopa-freeze-burst" />
      <p className="dopa-jackpot">
        <span>{cutin.kind === 'gameEnd' ? '優勝!!' : '勝ち抜け!!'}</span>
      </p>
    </div>
  )
}
