import cardPut from '../assets/se/cardPut.mp3'
import cardSelect from '../assets/se/cardSelect.mp3'
import click from '../assets/se/click.mp3'
import deal from '../assets/se/deal.mp3'
import finish from '../assets/se/finish.mp3'
import gameEnd from '../assets/se/gameEnd.mp3'
import pass from '../assets/se/pass.mp3'
import start from '../assets/se/start.mp3'
import win from '../assets/se/win.mp3'
import type { SoundName } from './events'

/** Web Audio で効果音を鳴らす。音源は最初の操作のあとにまとめて読み込む */

const URLS: Record<SoundName, string> = {
  cardPut,
  cardSelect,
  deal,
  click,
  pass,
  finish,
  start,
  gameEnd,
  win,
}

/** 何度も鳴る音・もともと大きい音を抑える倍率(書いていない音は1) */
const TRIM: Partial<Record<SoundName, number>> = {
  click: 0.5,
  cardSelect: 0.6,
  win: 0.7,
}

/** 同じ音がこれより短い間隔で重なったら捨てる(一斉に着地したときに音が割れるのを防ぐ) */
const REPEAT_MS = 60
/** 読み込みが間に合わずこれより遅れた音は、場面とずれるので鳴らさない */
const LATE_MS = 400

let context: AudioContext | null = null
const buffers = new Map<SoundName, Promise<AudioBuffer | null>>()
const ready = new Map<SoundName, AudioBuffer>()
const lastAt = new Map<SoundName, number>()

function load(audio: AudioContext, name: SoundName): Promise<AudioBuffer | null> {
  let buffer = buffers.get(name)
  if (!buffer) {
    buffer = fetch(URLS[name])
      .then((res) => res.arrayBuffer())
      .then((data) => audio.decodeAudioData(data))
      .then((decoded) => {
        ready.set(name, decoded)
        return decoded
      })
      // 読めなくても遊べる(その音が鳴らないだけ)
      .catch(() => null)
    buffers.set(name, buffer)
  }
  return buffer
}

/** ブラウザは操作の前に音を鳴らせないので、最初の操作で音の出口を作る */
function unlock(): void {
  if (context) {
    if (context.state === 'suspended') void context.resume()
    return
  }
  if (typeof AudioContext === 'undefined') return
  context = new AudioContext()
  for (const name of Object.keys(URLS) as SoundName[]) void load(context, name)
}

if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', unlock, { capture: true })
  window.addEventListener('keydown', unlock, { capture: true })
}

export function playSound(name: SoundName, volume: number): void {
  const audio = context
  if (!audio || document.hidden) return
  const asked = performance.now()
  if (asked - (lastAt.get(name) ?? -Infinity) < REPEAT_MS) return
  lastAt.set(name, asked)
  const start = (buffer: AudioBuffer) => {
    const source = audio.createBufferSource()
    source.buffer = buffer
    const gain = audio.createGain()
    gain.gain.value = volume * (TRIM[name] ?? 1)
    source.connect(gain).connect(audio.destination)
    source.start()
  }
  // 読み込み済みならその場で鳴らす(画面の描き直しが重い瞬間でも、待たされて捨てられない)
  const buffer = ready.get(name)
  if (buffer) start(buffer)
  else {
    void load(audio, name).then((loaded) => {
      if (loaded && performance.now() - asked <= LATE_MS) start(loaded)
    })
  }
}
