import { create } from 'zustand'
import type { CutinSpec } from '../fx/events'
import { cutinSounds, type SoundName } from './events'
import { playSound } from './player'

/** 効果音の大きさ。演出の量(fx)とは別に選べる */
export type SoundLevel = 'loud' | 'soft' | 'off'

export const SOUND_LEVEL_LABEL: Record<SoundLevel, string> = { loud: '大', soft: '小', off: 'オフ' }
export const NEXT_SOUND_LEVEL: Record<SoundLevel, SoundLevel> = { loud: 'soft', soft: 'off', off: 'loud' }

const VOLUME: Record<Exclude<SoundLevel, 'off'>, number> = { loud: 0.8, soft: 0.35 }

const LEVEL_KEY = 'srm:sound'

function loadLevel(): SoundLevel {
  try {
    const saved = localStorage.getItem(LEVEL_KEY)
    if (saved === 'loud' || saved === 'soft' || saved === 'off') return saved
  } catch {
    // 読めなければ既定値
  }
  return 'soft'
}

interface SoundStore {
  level: SoundLevel
  setLevel: (level: SoundLevel) => void
  /** delayMs だけ待ってから鳴らす。鳴らす時点の大きさを使う */
  play: (name: SoundName, delayMs?: number, rate?: number, maxMs?: number) => void
  /** カットインが出るときの音。dopa はドパガキモードの音を重ねるか */
  playCutin: (spec: Pick<CutinSpec, 'kind' | 'mine'>, delayMs?: number, dopa?: boolean) => void
}

export const useSound = create<SoundStore>()((set, get) => ({
  level: loadLevel(),

  setLevel(level) {
    set({ level })
    try {
      localStorage.setItem(LEVEL_KEY, level)
    } catch {
      // 保存できなくても遊べる
    }
  },

  play(name, delayMs = 0, rate = 1, maxMs) {
    const now = () => {
      const level = get().level
      if (level !== 'off') playSound(name, VOLUME[level], rate, maxMs)
    }
    if (delayMs > 0) setTimeout(now, delayMs)
    else now()
  },

  playCutin(spec, delayMs = 0, dopa = false) {
    for (const name of cutinSounds(spec, dopa)) get().play(name, delayMs)
  },
}))
