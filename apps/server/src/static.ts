import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
}

/** URL のパスを、公開フォルダーの中のファイルパスに変換する。フォルダーの外を指す場合は null */
function toFilePath(root: string, url: string | undefined): string | null {
  let pathname: string
  try {
    pathname = decodeURIComponent(new URL(url ?? '/', 'http://localhost').pathname)
  } catch {
    return null
  }
  if (pathname.includes('\0')) return null
  const filePath = resolve(root, `.${pathname}`)
  return filePath === root || filePath.startsWith(root + sep) ? filePath : null
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile()
  } catch {
    return false
  }
}

/**
 * ビルド済みの画面(apps/web/dist)を配る。
 * Vite が出力する assets/ 以下はファイル名にハッシュが付くので長くキャッシュし、index.html は毎回確認させる。
 * 拡張子のないパスは画面の入口(index.html)を返す。
 */
export async function serveStatic(webDir: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const root = resolve(webDir)
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' }).end()
    return
  }
  const requested = toFilePath(root, req.url)
  if (requested === null) {
    res.writeHead(404).end()
    return
  }

  let filePath = requested
  if (!(await isFile(filePath))) {
    if (extname(filePath) !== '') {
      res.writeHead(404).end()
      return
    }
    filePath = join(root, 'index.html')
    if (!(await isFile(filePath))) {
      res.writeHead(404).end()
      return
    }
  }

  const { size } = await stat(filePath)
  const isAsset = filePath.startsWith(join(root, 'assets') + sep)
  res.writeHead(200, {
    'content-type': CONTENT_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    'content-length': size,
    'cache-control': isAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
    'x-content-type-options': 'nosniff',
  })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  createReadStream(filePath)
    .on('error', () => res.destroy())
    .pipe(res)
}
