/** 開発中だけ、URL に ?timer=off を付けると制限時間を止められる(ルール確認・動作確認用) */
function timerDisabledByQuery(): boolean {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('timer') === 'off'
}

/**
 * 雀魂式の制限時間(docs/RULES.md §4-5)。
 * 1回30秒 + 持ち時間2分。
 */
export const TIMER = {
  /** 1回の操作ごとの基本時間 */
  baseMs: 30_000,
  /** 基本時間を超えると減っていく持ち時間(1試合ぶん) */
  reserveMs: 120_000,
  enabled: !timerDisabledByQuery(),
}
