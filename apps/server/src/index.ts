import { SERVER_CONFIG } from './config.js'
import { createAppServer } from './server.js'

const app = createAppServer(SERVER_CONFIG)

app.httpServer.listen(SERVER_CONFIG.port, () => {
  console.log(`[server] Seven Rich Men: http://localhost:${SERVER_CONFIG.port}`)
  console.log(
    SERVER_CONFIG.webDir
      ? `[server] 画面も配信します: ${SERVER_CONFIG.webDir}`
      : '[server] 画面のビルドがないため、通信だけを受け付けます(開発中は Vite から開く)',
  )
})

function shutdown(): void {
  void app.close().finally(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
