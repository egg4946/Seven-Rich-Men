import type { CSSProperties } from 'react'
import type { OpponentView, Title } from '@srm/game-core'
import { useFx } from '../fx/store'
import { cx } from '../ui/cx'
import { STATUS_LABEL, TITLE_LABEL } from '../ui/labels'
import { useChangeCount } from '../ui/useChangeCount'
import { Badge, STATUS_TONE, TITLE_TONE } from './Badge'
import { CardBack, MiniCard } from './PlayingCard'

/** 席に並べる裏向きの手札の、最大の枚数(実際の枚数は数字で出す) */
const FAN_MAX = 5

export function OpponentSeat({
  opponent,
  isTurn,
  isNext = false,
  sevens,
  title,
  exchange,
}: {
  opponent: OpponentView
  isTurn: boolean
  /** 今の手番の次に回ってくる */
  isNext?: boolean
  /** 7渡しの間だけ渡す: 置いた7の枚数と、まだ渡すカードを選んでいるか */
  sevens?: { count: number; choosing: boolean }
  /** ラウンド制の2ラウンド目以降の身分 */
  title?: Title
  /** カード交換の間だけ渡す: 交換する枚数(しなければ0)と、まだ選んでいるか */
  exchange?: { count: number; choosing: boolean }
}) {
  const out = opponent.status !== 'playing'
  // パス・出したカードなど、この人が今したことを一瞬だけ席の上に出す(内容はログと通知にもある)
  const pop = useFx((s) => s.seatPops[opponent.id])
  // パスが減ったら、残りの数を揺らして目を引く
  const passChanges = useChangeCount(opponent.passesLeft)
  return (
    <article
      aria-label={`${opponent.name}${isTurn ? '(手番)' : isNext ? '(次の手番)' : ''}`}
      className={cx(
        'relative min-w-36 flex-1 rounded-xl border px-3 py-1.5 leading-normal shadow-sm transition-colors md:min-w-40 md:py-2',
        // 手番が回ってきたら、席が小さく跳ねる
        isTurn && 'fx-hop',
        isTurn ? 'border-primary-500 ring-2 ring-primary-500/30' : 'border-slate-200',
        out ? 'bg-gray-50' : 'bg-white',
      )}
    >
      {isTurn && (
        <span
          aria-hidden="true"
          className="fx-turn-ring pointer-events-none absolute -inset-px rounded-xl border-2 border-primary-500"
        />
      )}
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate text-sm font-semibold text-slate-900">{opponent.name}</h3>
        {isTurn ? (
          <span key="turn" className="fx-stamp inline-flex">
            <Badge tone="accent">手番</Badge>
          </span>
        ) : out ? (
          <span key={opponent.status} className="fx-stamp inline-flex">
            <Badge tone={STATUS_TONE[opponent.status]}>{STATUS_LABEL[opponent.status]}</Badge>
          </span>
        ) : isNext ? (
          <Badge className="border border-dashed border-slate-300 bg-white">次</Badge>
        ) : null}
      </div>

      <dl className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-body">
        {title && (
          <div className="flex">
            <dt className="sr-only">身分</dt>
            <dd>
              <Badge tone={TITLE_TONE[title]} className="px-2 py-0">
                {TITLE_LABEL[title]}
              </Badge>
            </dd>
          </div>
        )}
        <div className="flex items-center gap-1">
          <dt>手札</dt>
          {opponent.handCount > 0 && (
            // 裏向きの手札。カードはここから場へ飛んでいく(data-seat-hand で位置を測る)
            <span
              aria-hidden="true"
              data-seat-hand={opponent.id}
              className={cx('seat-fan', out && 'opacity-40')}
              style={{ '--fan-n': Math.min(opponent.handCount, FAN_MAX) } as CSSProperties}
            >
              {Array.from({ length: Math.min(opponent.handCount, FAN_MAX) }, (_, i) => (
                <CardBack key={i} className="seat-fan-card" style={{ '--i': i } as CSSProperties} />
              ))}
            </span>
          )}
          <dd key={opponent.handCount} className="fx-bump font-semibold text-slate-900">
            {opponent.handCount}枚
          </dd>
        </div>
        <div className="flex gap-1">
          {/* スマホでは1行に収めて席を低くする */}
          <dt>
            パス<span className="max-sm:hidden">残り</span>
          </dt>
          <dd
            key={passChanges}
            className={cx(
              'font-semibold',
              passChanges > 0 && 'fx-wobble',
              opponent.passesLeft === 0 ? 'text-red-700' : 'text-slate-900',
            )}
          >
            {opponent.passesLeft}
          </dd>
        </div>
        {sevens && (
          // 7渡しの間だけ、この人が7を何枚出して何枚渡すのかを出しておく
          <div className="flex gap-1">
            <dt>7渡し</dt>
            <dd className="font-semibold text-slate-900">
              {sevens.count === 0 ? (
                'なし'
              ) : (
                <>
                  {sevens.count}枚
                  <span className={cx('ml-1 font-normal', sevens.choosing ? 'text-amber-700' : 'text-emerald-700')}>
                    {sevens.choosing ? '選択中' : '選択済み'}
                  </span>
                </>
              )}
            </dd>
          </div>
        )}
        {exchange && (
          // 交換の間だけ、この人が何枚交換するのかを出しておく
          <div className="flex gap-1">
            <dt>交換</dt>
            <dd className="font-semibold text-slate-900">
              {exchange.count === 0 ? (
                'なし'
              ) : (
                <>
                  {exchange.count}枚
                  <span className={cx('ml-1 font-normal', exchange.choosing ? 'text-amber-700' : 'text-emerald-700')}>
                    {exchange.choosing ? '選択中' : '選択済み'}
                  </span>
                </>
              )}
            </dd>
          </div>
        )}
        {opponent.skips > 0 && (
          <div className="flex gap-1">
            <dt>スキップ</dt>
            <dd className="font-semibold text-slate-900">{opponent.skips}</dd>
          </div>
        )}
      </dl>

      {opponent.revealed.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          <span className="sr-only">公開中のカード</span>
          {opponent.revealed.map((id) => (
            <MiniCard key={id} id={id} />
          ))}
        </div>
      )}

      {pop && (
        <span key={pop.seq} aria-hidden="true" className={cx('fx-pop', `fx-tone-${pop.tone}`)}>
          {pop.text}
        </span>
      )}
    </article>
  )
}
