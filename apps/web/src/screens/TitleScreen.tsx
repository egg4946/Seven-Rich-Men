import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import type { CpuLevel } from '@srm/game-ai'
import { LIMITS } from '@srm/protocol'
import { Button } from '../components/Button'
import { ChoiceChip } from '../components/ChoiceChip'
import { RulesDialog } from '../components/RulesDialog'
import { Toasts } from '../components/Toasts'
import { useGameStore } from '../game/store'
import { SLOW_CONNECT_MS, wakeServer } from '../online/client'
import { cx } from '../ui/cx'

/** タイトルで扇状に広げるカード(4枚の7とジョーカー) */
const HERO_CARDS = [
  { rank: '7', suit: '♠', color: 'text-slate-900' },
  { rank: '7', suit: '♥', color: 'text-red-600' },
  { rank: 'JK', suit: '★', color: 'text-primary-600' },
  { rank: '7', suit: '♦', color: 'text-red-600' },
  { rank: '7', suit: '♣', color: 'text-slate-900' },
]

const inputClass =
  'h-11 w-full rounded-lg border border-slate-300 px-3 text-base text-slate-900 caret-primary-500 transition-colors placeholder:text-slate-500 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/50 focus:outline-none'

/** サーバーの起動を待っている間の案内。止まっていたかどうかは画面から分からないので「かもしれない」と伝える */
function WakingNotice({ onCancel }: { onCancel: () => void }) {
  const [startedAt] = useState(() => Date.now())
  const [now, setNow] = useState(startedAt)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  // 案内が出るまでに待った分も足す
  const seconds = Math.floor((now - startedAt + SLOW_CONNECT_MS) / 1000)

  const message = 'しばらく遊ばれていないと、起動に1分ほどかかります。'

  return (
    <div className="flex items-start gap-3 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-sm text-primary-800">
      {/* 読み上げは最初の1回だけにする。毎秒変わる秒数を含めると、そのたびに読み上げ直される */}
      <p role="status" className="sr-only">
        サーバーを起動しています。{message}
      </p>
      <span
        aria-hidden="true"
        className="mt-1 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary-200 border-t-primary-500"
      />
      <p aria-hidden="true" className="flex-1">
        サーバーを起動しています({seconds}秒)。{message}
      </p>
      <Button variant="subtle" size="sm" onClick={onCancel} className="-my-0.5 shrink-0">
        やめる
      </Button>
    </div>
  )
}

export function TitleScreen() {
  const initial = useGameStore((s) => s.settings)
  const busy = useGameStore((s) => s.busy)
  const startSolo = useGameStore((s) => s.startSolo)
  const joinRoom = useGameStore((s) => s.joinRoom)
  const cancelJoin = useGameStore((s) => s.cancelJoin)
  const waking = useGameStore((s) => s.connection === 'waking')

  // 開いたまま時間がたつと公開環境のサーバーは止まるので、画面を開いた・戻ってきたときに起こしておく
  useEffect(() => {
    wakeServer()
    const onVisible = () => {
      if (document.visibilityState === 'visible') wakeServer()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  // 招待リンク(?room=部屋名)から来たら、部屋名を入れておく
  const invitedRoom = useMemo(() => new URLSearchParams(window.location.search).get('room') ?? '', [])
  const [name, setName] = useState(initial.name)
  const [roomName, setRoomName] = useState(invitedRoom)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [cpuCount, setCpuCount] = useState(initial.cpuCount)
  const [level, setLevel] = useState<CpuLevel>(initial.level)
  const [rulesOpen, setRulesOpen] = useState(false)

  const submitJoin = async (event: FormEvent) => {
    event.preventDefault()
    setJoinError(null)
    const error = await joinRoom(name.trim(), roomName.trim())
    if (error) setJoinError(error)
  }

  return (
    <main className="min-h-dvh bg-gray-50 px-4 py-10 md:py-16">
      <div className="mx-auto max-w-lg">
        <div aria-hidden="true" className="fx-hero relative mb-6 h-28 w-56">
          {HERO_CARDS.map((card, i) => (
            <span
              key={card.suit}
              className={cx(
                'fx-hero-card flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-1.5 leading-none shadow-md',
                card.color,
              )}
              style={{ '--i': `${i - 2}`, animationDelay: `${i * 80}ms` } as CSSProperties}
            >
              <span className="text-base leading-none font-semibold">{card.rank}</span>
              <span className="self-center text-2xl leading-none">{card.suit}</span>
              <span />
            </span>
          ))}
        </div>
        <p className="text-sm font-medium text-primary-600">七並べ × 大富豪</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900 md:text-3xl">Seven Rich Men</h1>
        <p className="mt-3 text-base text-body">
          7から並べて、手札を先になくした人の勝ち。8切り・Qボンバー・ジョーカーなど、数字ごとの効果で場が大きく動きます。
        </p>

        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 leading-normal shadow-sm">
          <label htmlFor="player-name" className="mb-1 block text-sm font-medium text-slate-700">
            あなたの名前
          </label>
          <input
            id="player-name"
            type="text"
            value={name}
            maxLength={LIMITS.playerName}
            autoComplete="nickname"
            placeholder="あなた"
            onChange={(event) => setName(event.target.value)}
            className={inputClass}
          />
        </div>

        <section
          aria-labelledby="online-heading"
          className="mt-6 rounded-xl border border-slate-200 bg-white p-6 leading-normal shadow-sm"
        >
          <h2 id="online-heading" className="text-lg font-semibold text-slate-900">
            友達と遊ぶ
          </h2>
          <p className="mt-1 text-sm text-body">同じ部屋名を入れた人と遊べます。部屋がなければ新しく作られます。</p>
          <form className="mt-4 space-y-4" onSubmit={(event) => void submitJoin(event)}>
            <div>
              <label htmlFor="room-name" className="mb-1 block text-sm font-medium text-slate-700">
                部屋名
              </label>
              <input
                id="room-name"
                type="text"
                value={roomName}
                maxLength={LIMITS.roomName}
                autoFocus={invitedRoom !== ''}
                placeholder="例: いつものメンバー"
                aria-invalid={joinError ? true : undefined}
                aria-describedby={joinError ? 'join-error' : undefined}
                onChange={(event) => {
                  setRoomName(event.target.value)
                  setJoinError(null)
                }}
                className={inputClass}
              />
              {joinError && (
                <p id="join-error" role="alert" className="mt-1 text-sm text-red-700">
                  {joinError}
                </p>
              )}
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={busy || roomName.trim() === ''}>
              {waking ? 'サーバーを起動しています…' : busy ? '接続しています…' : '部屋に入る'}
            </Button>
            {waking && <WakingNotice onCancel={cancelJoin} />}
          </form>
        </section>

        <section
          aria-labelledby="solo-heading"
          className="mt-6 space-y-6 rounded-xl border border-slate-200 bg-white p-6 leading-normal shadow-sm"
        >
          <h2 id="solo-heading" className="text-lg font-semibold text-slate-900">
            ひとりで遊ぶ
          </h2>

          <div>
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-slate-700">対戦するCPUの人数</legend>
              <div className="grid grid-cols-4 gap-2">
                {[2, 3, 4, 5].map((count) => (
                  <ChoiceChip
                    key={count}
                    name="cpu-count"
                    checked={cpuCount === count}
                    onChange={() => setCpuCount(count)}
                    label={`${count}人`}
                    description={`${count + 1}人戦`}
                  />
                ))}
              </div>
            </fieldset>
          </div>

          <div>
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-slate-700">CPUの強さ</legend>
              <div className="grid grid-cols-2 gap-2">
                <ChoiceChip
                  name="cpu-level"
                  checked={level === 'normal'}
                  onChange={() => setLevel('normal')}
                  label="ふつう"
                  description="効果を考えて出す"
                />
                <ChoiceChip
                  name="cpu-level"
                  checked={level === 'easy'}
                  onChange={() => setLevel('easy')}
                  label="やさしい"
                  description="でたらめに出す"
                />
              </div>
            </fieldset>
          </div>

          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            disabled={busy}
            onClick={() => startSolo({ name: name.trim(), cpuCount, level })}
          >
            CPUと対戦する
          </Button>
        </section>

        <div className="mt-6 leading-normal">
          <Button variant="subtle" onClick={() => setRulesOpen(true)}>
            ルールを見る
          </Button>
        </div>
      </div>

      <Toasts />
      <RulesDialog open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </main>
  )
}
