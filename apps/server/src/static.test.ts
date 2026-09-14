import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { io as connect } from 'socket.io-client'
import { createAppServer } from './server.js'

const cleanups: (() => Promise<void> | void)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

/** index.html と assets/ だけの小さな画面のビルドを作る */
async function makeWebDir(): Promise<string> {
  const base = await mkdtemp(join(tmpdir(), 'srm-web-'))
  cleanups.push(() => rm(base, { recursive: true, force: true }))
  const dir = join(base, 'dist')
  await mkdir(join(dir, 'assets'), { recursive: true })
  await writeFile(join(dir, 'index.html'), '<!doctype html><title>SRM</title>')
  await writeFile(join(dir, 'assets', 'index-abc123.js'), 'console.log(1)')
  await writeFile(join(dir, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
  // 公開フォルダーのすぐ外に置いた、返してはいけないファイル
  await writeFile(join(base, 'srm-secret.txt'), 'secret')
  return dir
}

async function boot(webDir: string | null): Promise<string> {
  const app = createAppServer({
    timerBaseMs: 1000,
    timerReserveMs: 0,
    cpuDelayScale: 0.01,
    lobbyGraceMs: 1000,
    emptyRoomTtlMs: 1000,
    corsOrigins: [],
    webDir,
  })
  await new Promise<void>((resolve) => app.httpServer.listen(0, resolve))
  cleanups.push(() => app.close())
  const { port } = app.httpServer.address() as AddressInfo
  return `http://localhost:${port}`
}

describe('画面の配信', () => {
  it('入口の index.html を、キャッシュさせずに返す', async () => {
    const url = await boot(await makeWebDir())
    const res = await fetch(`${url}/`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(res.headers.get('cache-control')).toBe('no-cache')
    expect(await res.text()).toContain('<title>SRM</title>')
  })

  it('assets/ のファイルは種類を付けて長くキャッシュさせる', async () => {
    const url = await boot(await makeWebDir())
    const res = await fetch(`${url}/assets/index-abc123.js`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
    expect(res.headers.get('cache-control')).toContain('immutable')
    expect(await res.text()).toBe('console.log(1)')

    const svg = await fetch(`${url}/favicon.svg`)
    expect(svg.headers.get('content-type')).toBe('image/svg+xml')
    expect(svg.headers.get('cache-control')).toBe('no-cache')
  })

  it('拡張子のないパスは index.html を返し、存在しないファイルは 404 にする', async () => {
    const url = await boot(await makeWebDir())
    const page = await fetch(`${url}/room/abc?x=1`)
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('<title>SRM</title>')

    expect((await fetch(`${url}/assets/missing.js`)).status).toBe(404)
  })

  it('公開フォルダーの外のファイルは返さない', async () => {
    const url = await boot(await makeWebDir())
    for (const path of ['/..%2fsrm-secret.txt', '/%2e%2e/srm-secret.txt', '/assets/..%5c..%5csrm-secret.txt']) {
      const res = await fetch(`${url}${path}`)
      expect(res.status, path).toBe(404)
    }
  })

  it('HEAD は本文なしで返し、GET/HEAD 以外は受け付けない', async () => {
    const url = await boot(await makeWebDir())
    const head = await fetch(`${url}/`, { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')
    expect((await fetch(`${url}/`, { method: 'POST' })).status).toBe(405)
  })

  it('画面を配っていても、ヘルスチェックと Socket.IO の接続はそのまま使える', async () => {
    const url = await boot(await makeWebDir())
    const health = await fetch(`${url}/healthz`)
    expect(await health.text()).toBe('ok')

    const socket = connect(url, { transports: ['websocket'], forceNew: true })
    cleanups.push(() => {
      socket.close()
    })
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', resolve)
      socket.on('connect_error', reject)
    })
    expect(socket.connected).toBe(true)
  })

  it('画面のフォルダーがなければ、画面は配らない', async () => {
    const url = await boot(null)
    expect((await fetch(`${url}/`)).status).toBe(404)
    expect((await fetch(`${url}/healthz`)).status).toBe(200)
  })
})
