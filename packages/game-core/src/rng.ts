/**
 * 乱数は注入式にする。
 *
 * 重要: シードや内部状態を GameState に持たせないこと。持たせると viewFor() から
 * 漏れた瞬間に山札全体を逆算されうる。本作では配札時にしか乱数を使わないため、
 * Rng は createGame() の引数としてのみ受け取り、状態には一切残さない。
 */
export interface Rng {
  /** [0, 1) の乱数を返す */
  next(): number
}

/**
 * 固定シードで再現可能な乱数(mulberry32)。
 * テストとローカルのCPU対戦専用。オンライン対戦では使わないこと。
 */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0
  return {
    next(): number {
      a = (a + 0x6d2b79f5) >>> 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
  }
}

/** 予測困難な乱数。オンライン対戦ではサーバー側でこれを使う。 */
export function cryptoRng(): Rng {
  return {
    next(): number {
      const buf = new Uint32Array(1)
      globalThis.crypto.getRandomValues(buf)
      return (buf[0] ?? 0) / 4294967296
    },
  }
}

/** Fisher-Yates。元配列は変更しない。 */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1))
    const a = out[i] as T
    const b = out[j] as T
    out[i] = b
    out[j] = a
  }
  return out
}
