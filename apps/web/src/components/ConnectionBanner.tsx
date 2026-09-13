import { useGameStore } from '../game/store'
import { AlertIcon } from '../ui/icons'

/** オンライン対戦で接続が切れているときだけ出す */
export function ConnectionBanner() {
  const mode = useGameStore((s) => s.mode)
  const connection = useGameStore((s) => s.connection)
  if (mode !== 'online' || (connection !== 'connecting' && connection !== 'reconnecting')) return null

  return (
    <p
      role="status"
      className="flex items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm leading-normal text-amber-800"
    >
      <AlertIcon className="h-4 w-4 shrink-0 text-amber-600" />
      {connection === 'connecting'
        ? 'サーバーに接続しています…'
        : '接続が切れました。再接続しています…(切断中はCPUが代わりに打ちます)'}
    </p>
  )
}
