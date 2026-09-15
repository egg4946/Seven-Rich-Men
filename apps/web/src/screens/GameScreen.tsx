import { LayoutGroup } from 'motion/react'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { CardId, Cell } from '@srm/game-core'
import { Badge } from '../components/Badge'
import { Board } from '../components/Board'
import { Button } from '../components/Button'
import { ConnectionBanner } from '../components/ConnectionBanner'
import { DecisionPanel } from '../components/DecisionPanel'
import { Dialog } from '../components/Dialog'
import { Hand } from '../components/Hand'
import { LogPanel } from '../components/LogPanel'
import { OpponentSeat } from '../components/OpponentSeat'
import { ResultDialog } from '../components/ResultDialog'
import { RulesDialog } from '../components/RulesDialog'
import { TimerBar } from '../components/TimerBar'
import { Toasts } from '../components/Toasts'
import { CutinLayer } from '../components/fx/CutinLayer'
import { FX_LEVEL_LABEL, NEXT_FX_LEVEL, useFx } from '../fx/store'
import { boardMarks, quickAction, selectionMode, viewDecisionKey, type BoardMark } from '../game/selection'
import { useGameStore } from '../game/store'
import { nextPlayerId, opponentsInSeatOrder, sevensPlaced } from '../game/turnOrder'
import { cx } from '../ui/cx'
import { RotateIcon, SparkleIcon, TurnArrowIcon } from '../ui/icons'
import { directionLabel } from '../ui/labels'

/** 席の並びの両端に置く、自分の位置。両端とも自分で、一周してつながっていることを表す */
function YouCap({ active }: { active: boolean }) {
  return (
    <div aria-hidden="true" className="flex shrink-0 items-center">
      <span
        className={cx(
          'rounded-full border px-1 py-2 text-xs font-bold leading-none tracking-widest [writing-mode:vertical-rl]',
          active ? 'border-primary-500 bg-primary-500 text-white' : 'border-primary-200 bg-primary-50 text-primary-700',
        )}
      >
        あなた
      </span>
    </div>
  )
}

/** 席と席の間の、手番が回る向き。向きが変わったら回して見せる */
function FlowArrow({ direction }: { direction: 1 | -1 }) {
  return (
    <div aria-hidden="true" className="flex shrink-0 items-center text-primary-500">
      <span key={direction} className="fx-spin-in">
        <TurnArrowIcon direction={direction} className="h-5 w-5" strokeWidth={2.5} />
      </span>
    </div>
  )
}

/**
 * 対戦画面。見るのは自分の視点(PlayerView)だけなので、ソロでもオンラインでも同じ画面を使う。
 */
export function GameScreen() {
  const view = useGameStore((s) => s.view)
  const mode = useGameStore((s) => s.mode)
  const room = useGameStore((s) => s.room)
  const busy = useGameStore((s) => s.busy)
  const act = useGameStore((s) => s.act)
  const rematch = useGameStore((s) => s.rematch)
  const leaveSolo = useGameStore((s) => s.leaveSolo)
  const leaveRoom = useGameStore((s) => s.leaveRoom)
  const startOnlineGame = useGameStore((s) => s.startOnlineGame)
  const showLobby = useGameStore((s) => s.showLobby)

  const [selected, setSelected] = useState<CardId[]>([])
  /** ジョーカーを置く位置として選んだマス(一緒に出すカードを選ぶとき) */
  const [jokerCell, setJokerCell] = useState<Cell | null>(null)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [resultOpen, setResultOpen] = useState(true)

  const key = view ? viewDecisionKey(view) : ''
  useEffect(() => {
    setSelected([])
    setJokerCell(null)
  }, [key])

  const nameOf = useMemo(() => {
    if (!view) return (id: string) => id
    const names = new Map([[view.you.id, view.you.name], ...view.opponents.map((o) => [o.id, o.name] as [string, string])])
    return (id: string) => (id === view.you.id ? 'あなた' : (names.get(id) ?? id))
  }, [view])

  const fxLevel = useFx((s) => s.level)
  const setFxLevel = useFx((s) => s.setLevel)
  const shake = useFx((s) => s.shake)
  // 演出が流れ終わってから結果を出す(GAME SET のカットインと重ねない)
  const fxIdle = useFx((s) => s.current === null && s.queue.length === 0)
  const boardRef = useRef<HTMLElement>(null)

  // Qボンバーなどで場を揺らす。Web Animations の transform なので React の再描画は起きない
  useEffect(() => {
    const el = boardRef.current
    if (!shake || !el || typeof el.animate !== 'function') return
    const a = shake.strength === 2 ? 7 : 4
    const animation = el.animate(
      [
        { transform: 'translate(0, 0)' },
        { transform: `translate(${-a}px, ${a / 2}px)` },
        { transform: `translate(${a}px, ${-a / 2}px)` },
        { transform: `translate(${-a / 2}px, ${a / 2}px)` },
        { transform: `translate(${a / 2}px, 0)` },
        { transform: 'translate(0, 0)' },
      ],
      { duration: shake.strength === 2 ? 480 : 320, easing: 'ease-out' },
    )
    return () => animation.cancel()
  }, [shake])

  if (!view) {
    return (
      <div className="flex min-h-dvh flex-col bg-gray-50 leading-normal">
        <ConnectionBanner />
        <p role="status" className="m-auto text-sm text-body">
          対戦を準備しています…
        </p>
      </div>
    )
  }

  const you = view.you.id
  const online = mode === 'online'
  const isHost = !!room && room.hostId === room.you
  const mode_ = selectionMode(view)
  const seat = view.seatOrder.indexOf(you)
  const nextPlayer = view.seatOrder[(seat + 1) % view.seatOrder.length]
  const giveToName = nextPlayer ? nameOf(nextPlayer) : '次の人'
  const seats = opponentsInSeatOrder(view)
  const next = nextPlayerId(view)
  const sevens = sevensPlaced(view)

  const toggle = (id: CardId) => {
    if (mode_.type === 'none') return
    setJokerCell(null)
    setSelected((current) => {
      if (current.includes(id)) return current.filter((x) => x !== id)
      if (mode_.type === 'give') return current.length >= mode_.count ? current : [...current, id]
      return [id]
    })
  }

  /** ダブルクリック・上スワイプ。確かめが要る手は、選択して案内を出すだけにする */
  const playNow = (id: CardId) => {
    const action = quickAction(view, mode_, id)
    if (action) {
      act(action)
      return
    }
    setJokerCell(null)
    setSelected([id])
  }

  const marks = boardMarks(view, mode_, selected, jokerCell)
  const pressMark = (mark: BoardMark) => {
    if (mark.action) act(mark.action)
    else setJokerCell(mark.cell)
  }

  const setup = view.pending?.type === 'giveSevens'
  const turnText =
    view.phase === 'ended'
      ? '対戦終了'
      : setup
        ? '7渡し'
        : view.turnPlayerId === you
          ? 'あなたの手番'
          : view.turnPlayerId
            ? `${nameOf(view.turnPlayerId)} の手番${next === you ? '(次はあなた)' : ''}`
            : ''
  const isTurn = (id: string) => view.phase !== 'ended' && !setup && view.turnPlayerId === id

  const confirmLeave = () => {
    setLeaveOpen(false)
    if (online) void leaveRoom()
    else leaveSolo()
  }

  // 対戦が終わったあとの操作。オンラインでは次の対戦を始められるのは部屋主だけ
  const endActions = online ? (
    <>
      {isHost && (
        <Button disabled={busy} onClick={() => void startOnlineGame()}>
          同じメンバーでもう一度
        </Button>
      )}
      <Button variant="secondary" onClick={showLobby}>
        ロビーに戻る
      </Button>
    </>
  ) : (
    <>
      <Button variant="secondary" onClick={leaveSolo}>
        タイトルに戻る
      </Button>
      <Button onClick={rematch}>もう一度遊ぶ</Button>
    </>
  )

  return (
    <div className="flex min-h-dvh flex-col bg-gray-50 leading-normal">
      {/* スマホでは画面の高さが足りないので、上の帯は固定せず、場と手札の表示に高さを回す */}
      <header className="z-30 border-b border-slate-200 bg-white md:sticky md:top-0">
        <div className="mx-auto flex h-12 max-w-6xl items-center justify-between gap-3 px-4 md:h-14">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate font-semibold text-slate-900">Seven Rich Men</p>
            {online && room && <Badge className="hidden max-w-40 truncate sm:inline-flex">部屋: {room.name}</Badge>}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="subtle"
              size="sm"
              aria-label={`演出: ${FX_LEVEL_LABEL[fxLevel]}(押すと${FX_LEVEL_LABEL[NEXT_FX_LEVEL[fxLevel]]}に切り替え)`}
              onClick={() => setFxLevel(NEXT_FX_LEVEL[fxLevel])}
              className="px-2 sm:px-3"
            >
              <SparkleIcon className={cx('h-4 w-4', fxLevel === 'off' ? 'text-slate-400' : 'text-primary-500')} />
              <span className="hidden sm:inline">演出:</span>
              {FX_LEVEL_LABEL[fxLevel]}
            </Button>
            <Button variant="subtle" size="sm" onClick={() => setRulesOpen(true)}>
              ルール
            </Button>
            <Button
              variant="subtle"
              size="sm"
              onClick={() => {
                if (view.phase !== 'ended') setLeaveOpen(true)
                else if (online) showLobby()
                else leaveSolo()
              }}
            >
              {online ? '退室' : 'やめる'}
            </Button>
          </div>
        </div>
        <div className="hidden md:block">
          <ConnectionBanner />
        </div>
      </header>

      <LayoutGroup>
        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-2 sm:py-4 md:py-6 lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-6">
          <main className="min-w-0 space-y-2 sm:space-y-4">
            {/* 席は自分の次の人から手番の順に並べ、両端の「あなた」とつないで一周を表す */}
            <section
              aria-label={`対戦相手(左から、あなたの次の席の順。手番は${directionLabel(view.direction)})`}
              className="-mx-4 overflow-x-auto px-4 pb-1"
            >
              <div className="flex items-stretch gap-1">
                <YouCap active={isTurn(you)} />
                {seats.map((opponent) => (
                  <Fragment key={opponent.id}>
                    <FlowArrow direction={view.direction} />
                    <OpponentSeat
                      opponent={opponent}
                      isTurn={isTurn(opponent.id)}
                      isNext={next === opponent.id}
                      sevens={
                        view.pending?.type === 'giveSevens'
                          ? {
                              count: sevens.get(opponent.id) ?? 0,
                              choosing: view.pending.waitingFor.includes(opponent.id),
                            }
                          : undefined
                      }
                    />
                  </Fragment>
                ))}
                <FlowArrow direction={view.direction} />
                <YouCap active={isTurn(you)} />
              </div>
            </section>

            <section
              ref={boardRef}
              aria-label="場"
              className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm sm:p-3 md:p-5"
            >
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2 sm:mb-2">
                <h2 className="text-sm font-semibold text-slate-900">場</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>
                    {/* 向きが変わるたびに回して見せる */}
                    <span key={view.direction} className="fx-spin-in mr-1">
                      <RotateIcon direction={view.direction} className="h-3.5 w-3.5" />
                    </span>
                    {directionLabel(view.direction)}
                  </Badge>
                  {view.jokerRemoved && <Badge>ジョーカー除外済み</Badge>}
                </div>
              </div>
              <Board board={view.board} marks={marks} onMark={pressMark} />
            </section>

            <details className="rounded-xl border border-slate-200 bg-white shadow-sm lg:hidden">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900">ログ</summary>
              <LogPanel log={view.log} nameOf={nameOf} className="max-h-64 border-t border-slate-200 px-4 py-3" />
            </details>
          </main>

          <aside
            aria-label="ログ"
            className="hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:sticky lg:top-20 lg:block"
          >
            <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">ログ</h2>
            <LogPanel log={view.log} nameOf={nameOf} className="max-h-[calc(100dvh-26rem)] min-h-40 px-4 py-3" />
          </aside>
        </div>

        <div className="sticky bottom-0 z-30 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
          {/* スマホでは上の帯が固定されないので、切断の知らせは操作パネルに出す */}
          <div className="md:hidden">
            <ConnectionBanner />
          </div>
          {mode_.type !== 'none' && <div aria-hidden="true" className="fx-turn-line" />}
          <div className="mx-auto max-w-6xl space-y-2 px-4 py-2 md:space-y-3 md:py-3">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <p aria-live="polite" className="text-sm font-semibold text-slate-900">
                {turnText}
              </p>
              <dl className="flex gap-3 text-xs text-body">
                <div className="flex gap-1">
                  <dt>パス残り</dt>
                  <dd className="font-semibold text-slate-900">{view.you.passesLeft}</dd>
                </div>
                {view.you.skips > 0 && (
                  <div className="flex gap-1">
                    <dt>スキップ</dt>
                    <dd className="font-semibold text-slate-900">{view.you.skips}</dd>
                  </div>
                )}
              </dl>
            </div>
            <TimerBar />
            <DecisionPanel
              view={view}
              mode={mode_}
              selected={selected}
              jokerCell={jokerCell}
              onJokerCell={setJokerCell}
              decisionKey={key}
              act={act}
              nameOf={nameOf}
              giveToName={giveToName}
              endDescription={online && !isHost ? '部屋主が次の対戦を始めるのを待っています。' : undefined}
              endActions={endActions}
            />
            <Hand view={view} mode={mode_} selected={selected} onToggle={toggle} onPlay={playNow} />
          </div>
        </div>
      </LayoutGroup>

      <CutinLayer />
      <Toasts />
      <RulesDialog open={rulesOpen} onClose={() => setRulesOpen(false)} />
      <Dialog
        open={leaveOpen}
        title={online ? '退室しますか?' : '対戦をやめますか?'}
        size="sm"
        onClose={() => setLeaveOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setLeaveOpen(false)}>
              続ける
            </Button>
            <Button variant="danger" onClick={confirmLeave}>
              {online ? '退室する' : 'やめる'}
            </Button>
          </>
        }
      >
        <p>
          {online
            ? 'この対戦の残りは、CPUがあなたの代わりに打ちます。対戦が終わるまで、この部屋には戻れません。'
            : 'この対戦の進行は保存されません。'}
        </p>
      </Dialog>
      <ResultDialog
        open={view.phase === 'ended' && resultOpen && fxIdle}
        view={view}
        onClose={() => setResultOpen(false)}
        actions={endActions}
      />
    </div>
  )
}
