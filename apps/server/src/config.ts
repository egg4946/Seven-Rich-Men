import type { AppOptions } from './server.js'

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

/** 環境変数から読むサーバー設定。テストや動作確認では時間を短くできる */
export const SERVER_CONFIG: AppOptions & { port: number } = {
  port: numberFromEnv('PORT', 8787),
  // 雀魂式の制限時間(docs/RULES.md §4-5)。暫定値
  timerBaseMs: numberFromEnv('SRM_TIMER_BASE_MS', 10_000),
  timerReserveMs: numberFromEnv('SRM_TIMER_RESERVE_MS', 30_000),
  cpuDelayScale: numberFromEnv('SRM_CPU_DELAY_SCALE', 1),
  lobbyGraceMs: numberFromEnv('SRM_LOBBY_GRACE_MS', 30_000),
  emptyRoomTtlMs: numberFromEnv('SRM_EMPTY_ROOM_TTL_MS', 5 * 60_000),
  corsOrigins: (process.env.SRM_CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
}
