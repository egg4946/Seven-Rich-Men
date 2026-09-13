import { createServer } from 'node:http'
import { Server } from 'socket.io'
import {
  parseAct,
  parseJoin,
  parseSettings,
  type Ack,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@srm/protocol'
import { RoomManager, type ManagerOptions } from './rooms.js'

export interface AppOptions extends ManagerOptions {
  /** 別のオリジンから接続を許可する URL(開発中は Vite のプロキシ経由なので空でよい) */
  corsOrigins: string[]
}

function invalid(error: string): { ok: false; code: 'invalid'; error: string } {
  return { ok: false, code: 'invalid', error }
}

/** 一定時間内の操作回数を制限する(連打や悪意ある大量送信への最低限の対策) */
function rateLimiter(limit: number, windowMs: number): () => boolean {
  let windowStart = Date.now()
  let count = 0
  return () => {
    const now = Date.now()
    if (now - windowStart >= windowMs) {
      windowStart = now
      count = 0
    }
    count += 1
    return count <= limit
  }
}

export function createAppServer(options: AppOptions) {
  const httpServer = createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end('ok')
      return
    }
    res.writeHead(404).end()
  })

  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: options.corsOrigins.length > 0 ? { origin: options.corsOrigins } : undefined,
    maxHttpBufferSize: 16 * 1024,
    pingInterval: 10_000,
    pingTimeout: 10_000,
  })

  const manager = new RoomManager(
    {
      // 空の配列を io.to() に渡すと全員に送られてしまうので、必ず確認する
      sendRoom: (socketIds, room) => {
        if (socketIds.length > 0) io.to(socketIds).emit('room:state', room)
      },
      sendGame: (socketIds, update) => {
        if (socketIds.length > 0) io.to(socketIds).emit('game:update', update)
      },
    },
    options,
  )

  io.on('connection', (socket) => {
    const allow = rateLimiter(60, 10_000)

    const handle = <T>(ack: unknown, run: () => Ack<T>) => {
      if (typeof ack !== 'function') return
      const reply = ack as (res: Ack<T>) => void
      if (!allow()) {
        reply({ ok: false, code: 'rate_limited', error: '操作が多すぎます。少し待ってからやり直してください' })
        return
      }
      try {
        reply(run())
      } catch (error) {
        console.error('[server] 処理中にエラー', error)
        reply(invalid('サーバーでエラーが発生しました'))
      }
    }

    socket.on('room:join', (payload, ack) =>
      handle(ack, () => {
        const parsed = parseJoin(payload)
        return parsed ? manager.join(socket.id, parsed) : invalid('部屋名と名前を確認してください')
      }),
    )
    socket.on('room:leave', (ack) => handle(ack, () => manager.leave(socket.id)))
    socket.on('room:settings', (payload, ack) =>
      handle(ack, () => {
        const parsed = parseSettings(payload)
        return parsed ? manager.updateSettings(socket.id, parsed) : invalid('設定が正しくありません')
      }),
    )
    socket.on('room:start', (ack) => handle(ack, () => manager.start(socket.id)))
    socket.on('game:act', (payload, ack) =>
      handle(ack, () => {
        const parsed = parseAct(payload)
        return parsed ? manager.act(socket.id, parsed) : invalid('操作の形式が正しくありません')
      }),
    )
    socket.on('disconnect', () => manager.disconnect(socket.id))
  })

  return {
    httpServer,
    io,
    manager,
    async close(): Promise<void> {
      manager.dispose()
      await io.close()
    },
  }
}
