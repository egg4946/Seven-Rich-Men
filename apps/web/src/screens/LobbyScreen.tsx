import { useRef, useState } from 'react'
import { MAX_SEATS, MIN_SEATS } from '@srm/protocol'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { ChoiceChip } from '../components/ChoiceChip'
import { ConnectionBanner } from '../components/ConnectionBanner'
import { RulesDialog } from '../components/RulesDialog'
import { Toasts } from '../components/Toasts'
import { useGameStore } from '../game/store'

const SEAT_OPTIONS = Array.from({ length: MAX_SEATS - MIN_SEATS + 1 }, (_, i) => i + MIN_SEATS)

export function LobbyScreen() {
  const room = useGameStore((s) => s.room)
  const busy = useGameStore((s) => s.busy)
  const leaveRoom = useGameStore((s) => s.leaveRoom)
  const updateRoomSettings = useGameStore((s) => s.updateRoomSettings)
  const startOnlineGame = useGameStore((s) => s.startOnlineGame)
  const [copied, setCopied] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const inviteRef = useRef<HTMLInputElement>(null)

  if (!room) return null

  const isHost = room.hostId === room.you
  const humans = room.members.length
  const cpuCount = Math.max(0, room.settings.seats - humans)
  const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(room.name)}`

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // http の LAN 環境などでクリップボードが使えないときは、選択して手動でコピーしてもらう
      inviteRef.current?.select()
    }
  }

  return (
    <div className="min-h-dvh bg-gray-50 leading-normal">
      <ConnectionBanner />
      <main className="mx-auto max-w-lg px-4 py-10 md:py-16">
        <p className="text-sm font-medium text-primary-600">オンライン対戦</p>
        <h1 className="mt-1 text-2xl font-bold break-all text-slate-900 md:text-3xl">部屋「{room.name}」</h1>
        {room.phase === 'playing' && (
          <p role="status" className="mt-3 text-sm text-body">
            対戦中です。終わるまでお待ちください。
          </p>
        )}

        <section aria-labelledby="invite-heading" className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 id="invite-heading" className="text-base font-semibold text-slate-900">
            友達を招待する
          </h2>
          <label htmlFor="invite-url" className="mt-3 mb-1 block text-sm font-medium text-slate-700">
            招待リンク
          </label>
          <div className="flex gap-2">
            <input
              ref={inviteRef}
              id="invite-url"
              type="text"
              readOnly
              value={inviteUrl}
              onFocus={(event) => event.currentTarget.select()}
              className="h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-gray-50 px-3 text-sm text-slate-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/50 focus:outline-none"
            />
            <Button variant="secondary" onClick={() => void copyInvite()}>
              {copied ? 'コピーしました' : 'コピー'}
            </Button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            リンクを開くか、同じ部屋名を入れると、この部屋に入れます。
          </p>
        </section>

        <section aria-labelledby="members-heading" className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 id="members-heading" className="text-base font-semibold text-slate-900">
            メンバー({room.settings.seats}人戦)
          </h2>
          <ul className="mt-2">
            {room.members.map((member) => (
              <li key={member.id} className="flex items-center justify-between gap-3 border-b border-slate-200 py-2 last:border-b-0">
                <span className="truncate text-sm font-medium text-slate-900">{member.name}</span>
                <span className="flex shrink-0 gap-1">
                  {member.id === room.you && <Badge tone="accent">あなた</Badge>}
                  {member.isHost && <Badge>部屋主</Badge>}
                  {!member.connected && <Badge tone="warning">切断中</Badge>}
                </span>
              </li>
            ))}
            {cpuCount > 0 && (
              <li className="flex items-center justify-between gap-3 py-2">
                <span className="text-sm text-body">CPU × {cpuCount}</span>
                <Badge>空いた席</Badge>
              </li>
            )}
          </ul>
        </section>

        <section aria-labelledby="settings-heading" className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 id="settings-heading" className="text-base font-semibold text-slate-900">
            設定
          </h2>
          {!isHost && <p className="mt-1 text-sm text-body">設定を変えられるのは部屋主だけです。</p>}
          <div className="mt-4">
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-slate-700">人数(足りない分はCPU)</legend>
              <div className="grid grid-cols-4 gap-2">
                {SEAT_OPTIONS.map((seats) => (
                  <ChoiceChip
                    key={seats}
                    name="seats"
                    checked={room.settings.seats === seats}
                    disabled={!isHost || seats < humans || room.phase === 'playing'}
                    onChange={() => void updateRoomSettings({ ...room.settings, seats })}
                    label={`${seats}人`}
                  />
                ))}
              </div>
            </fieldset>
          </div>
          <div className="mt-4">
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-slate-700">CPUの強さ</legend>
              <div className="grid grid-cols-2 gap-2">
                <ChoiceChip
                  name="lobby-cpu-level"
                  checked={room.settings.cpuLevel === 'normal'}
                  disabled={!isHost || room.phase === 'playing'}
                  onChange={() => void updateRoomSettings({ ...room.settings, cpuLevel: 'normal' })}
                  label="ふつう"
                />
                <ChoiceChip
                  name="lobby-cpu-level"
                  checked={room.settings.cpuLevel === 'easy'}
                  disabled={!isHost || room.phase === 'playing'}
                  onChange={() => void updateRoomSettings({ ...room.settings, cpuLevel: 'easy' })}
                  label="やさしい"
                />
              </div>
            </fieldset>
          </div>
        </section>

        <div className="mt-6">
          {isHost ? (
            <Button
              size="lg"
              className="w-full"
              disabled={busy || room.phase === 'playing'}
              onClick={() => void startOnlineGame()}
            >
              対戦をはじめる({room.settings.seats}人戦)
            </Button>
          ) : (
            <p role="status" className="rounded-xl border border-slate-200 bg-gray-50 px-4 py-3 text-center text-sm text-body">
              部屋主が対戦を始めるのを待っています
            </p>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <Button variant="subtle" onClick={() => setRulesOpen(true)}>
            ルールを見る
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void leaveRoom()}>
            退室する
          </Button>
        </div>
      </main>

      <Toasts />
      <RulesDialog open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  )
}
