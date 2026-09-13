import { LayoutGroup } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { viewFor, type CardId } from '@srm/game-core'
import { Badge } from '../components/Badge'
import { Board } from '../components/Board'
import { Button } from '../components/Button'
import { DecisionPanel } from '../components/DecisionPanel'
import { Dialog } from '../components/Dialog'
import { Hand } from '../components/Hand'
import { LogPanel } from '../components/LogPanel'
import { OpponentSeat } from '../components/OpponentSeat'
import { ResultDialog } from '../components/ResultDialog'
import { RulesDialog } from '../components/RulesDialog'
import { TimerBar } from '../components/TimerBar'
import { Toasts } from '../components/Toasts'
import { HUMAN_ID, decisionKey } from '../game/controller'
import { selectionMode } from '../game/selection'
import { useGameStore } from '../game/store'
import { RotateIcon } from '../ui/icons'
import { directionLabel } from '../ui/labels'

export function GameScreen() {
  const game = useGameStore((s) => s.game)
  const act = useGameStore((s) => s.act)
  const leave = useGameStore((s) => s.leave)
  const rematch = useGameStore((s) => s.rematch)

  const [selected, setSelected] = useState<CardId[]>([])
  const [rulesOpen, setRulesOpen] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [resultOpen, setResultOpen] = useState(true)

  // UI は人間の視点(viewFor)だけを見る。オンライン対戦でもサーバーから同じ形で受け取る。
  const view = useMemo(() => (game ? viewFor(game, HUMAN_ID) : null), [game])
  const key = game ? decisionKey(game) : ''

  useEffect(() => {
    setSelected([])
  }, [key])

  const players = game?.players
  const nameOf = useMemo(() => {
    const names = new Map((players ?? []).map((p) => [p.id, p.name]))
    return (id: string) => (id === HUMAN_ID ? 'あなた' : (names.get(id) ?? id))
  }, [players])

  if (!game || !view) return null

  const mode = selectionMode(view)
  const seat = game.players.findIndex((p) => p.id === HUMAN_ID)
  const nextPlayer = game.players[(seat + 1) % game.players.length]
  const giveToName = nextPlayer ? nameOf(nextPlayer.id) : '次の人'

  const toggle = (id: CardId) => {
    if (mode.type === 'none') return
    setSelected((current) => {
      if (current.includes(id)) return current.filter((x) => x !== id)
      if (mode.type === 'give') return current.length >= mode.count ? current : [...current, id]
      return [id]
    })
  }

  const selectedCard = selected[0]
  const highlight =
    mode.type === 'turn' &&
    selectedCard !== undefined &&
    view.legalActions.some((a) => a.type === 'PLACE' && a.card === selectedCard)
      ? selectedCard
      : null

  const setup = view.pending?.type === 'giveSevens'
  const turnText =
    view.phase === 'ended'
      ? '対戦終了'
      : setup
        ? '7渡し'
        : view.turnPlayerId === HUMAN_ID
          ? 'あなたの手番'
          : view.turnPlayerId
            ? `${nameOf(view.turnPlayerId)} の手番`
            : ''
  const isTurn = (id: string) => view.phase !== 'ended' && !setup && view.turnPlayerId === id

  return (
    <div className="flex min-h-dvh flex-col bg-gray-50 leading-normal">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <p className="truncate font-semibold text-slate-900">Seven Rich Men</p>
          <div className="flex items-center gap-1">
            <Button variant="subtle" size="sm" onClick={() => setRulesOpen(true)}>
              ルール
            </Button>
            <Button variant="subtle" size="sm" onClick={() => (view.phase === 'ended' ? leave() : setLeaveOpen(true))}>
              やめる
            </Button>
          </div>
        </div>
      </header>

      <LayoutGroup>
        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-4 md:py-6 lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-6">
          <main className="min-w-0 space-y-4">
            <section aria-label="対戦相手" className="-mx-4 overflow-x-auto px-4 pb-1">
              <div className="flex gap-3">
                {view.opponents.map((opponent) => (
                  <OpponentSeat key={opponent.id} opponent={opponent} isTurn={isTurn(opponent.id)} />
                ))}
              </div>
            </section>

            <section aria-label="場" className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:p-5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900">場</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>
                    <RotateIcon direction={view.direction} className="mr-1 h-3.5 w-3.5" />
                    {directionLabel(view.direction)}
                  </Badge>
                  {view.jokerRemoved && <Badge>ジョーカー除外済み</Badge>}
                </div>
              </div>
              <Board board={view.board} highlight={highlight} />
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
              mode={mode}
              selected={selected}
              decisionKey={key}
              act={act}
              nameOf={nameOf}
              giveToName={giveToName}
              onShowResult={() => setResultOpen(true)}
              onRematch={rematch}
            />
            <Hand view={view} mode={mode} selected={selected} onToggle={toggle} />
          </div>
        </div>
      </LayoutGroup>

      <Toasts />
      <RulesDialog open={rulesOpen} onClose={() => setRulesOpen(false)} />
      <Dialog
        open={leaveOpen}
        title="対戦をやめますか?"
        size="sm"
        onClose={() => setLeaveOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setLeaveOpen(false)}>
              続ける
            </Button>
            <Button variant="danger" onClick={leave}>
              やめる
            </Button>
          </>
        }
      >
        <p>この対戦の進行は保存されません。</p>
      </Dialog>
      <ResultDialog
        open={view.phase === 'ended' && resultOpen}
        game={game}
        onClose={() => setResultOpen(false)}
        onRematch={rematch}
        onLeave={leave}
      />
    </div>
  )
}
