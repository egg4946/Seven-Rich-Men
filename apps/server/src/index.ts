import { SERVER_CONFIG } from './config.js'
import { createAppServer } from './server.js'

const app = createAppServer(SERVER_CONFIG)

app.httpServer.listen(SERVER_CONFIG.port, () => {
  console.log(`[server] Seven Rich Men: http://localhost:${SERVER_CONFIG.port}`)
})

function shutdown(): void {
  void app.close().finally(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
