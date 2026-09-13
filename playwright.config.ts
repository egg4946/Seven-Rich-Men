import { defineConfig } from '@playwright/test'

/** 開発中のサーバー(8787 / 5173)と重ならないポートで、テスト専用に起動する */
const SERVER_PORT = 8797
const WEB_PORT = 5183

export default defineConfig({
  testDir: './e2e',
  timeout: 150_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    // ブラウザを別途ダウンロードせず、インストール済みの Chrome を使う。
    // Edge だと、終了後も補助プロセスが一時プロフィールをつかみ、Playwright の後片付けが終わらないことがあった
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'pnpm --filter @srm/server start',
      url: `http://localhost:${SERVER_PORT}/healthz`,
      reuseExistingServer: false,
      env: {
        PORT: String(SERVER_PORT),
        // 操作しなくても時間切れと CPU だけで早く終局するよう、時間を短くする
        SRM_TIMER_BASE_MS: '600',
        SRM_TIMER_RESERVE_MS: '0',
        SRM_CPU_DELAY_SCALE: '0.05',
      },
    },
    {
      command: `pnpm --filter @srm/web exec vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      env: { SRM_SERVER_PORT: String(SERVER_PORT) },
    },
  ],
})
