import cardPut from '../assets/se/cardPut.mp3'
import cardSelect from '../assets/se/cardSelect.mp3'
import click from '../assets/se/click.mp3'
import deal from '../assets/se/deal.mp3'
import dopaSkip from '../assets/se/dopaSkip.mp3'
import dopaSlash from '../assets/se/dopaSlash.mp3'
import dopaReverse from '../assets/se/dopaReverse.mp3'
import dopaDiscard from '../assets/se/dopaDiscard.mp3'
import dopaBomb from '../assets/se/dopaBomb.mp3'
import dopaJoker from '../assets/se/dopaJoker.mp3'
import dopaReveal from '../assets/se/dopaReveal.mp3'
import dopaOut from '../assets/se/dopaOut.mp3'
import dopaTurn from '../assets/se/dopaTurn.mp3'
import dopaCoin from '../assets/se/dopaCoin.mp3'
import dopaPraise from '../assets/se/dopaPraise.mp3'
import dopaHot from '../assets/se/dopaHot.mp3'
import dopaFanfare from '../assets/se/dopaFanfare.mp3'
import dopaCheer from '../assets/se/dopaCheer.mp3'
import dopaImpact from '../assets/se/dopaImpact.mp3'
import dopaJackpot from '../assets/se/dopaJackpot.mp3'
import dopaReach from '../assets/se/dopaReach.mp3'
import dopaDrop from '../assets/se/dopaDrop.mp3'
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
  dopaSkip,
  dopaSlash,
  dopaReverse,
  dopaDiscard,
  dopaBomb,
  dopaJoker,
  dopaReveal,
  dopaOut,
  dopaTurn,
  dopaCoin,
  dopaPraise,
  dopaHot,
  dopaFanfare,
  dopaCheer,
  dopaImpact,
  dopaJackpot,
  dopaReach,
  dopaDrop,
}

/** 何度も鳴る音・もともと大きい音を抑える倍率(書いていない音は1) */
const TRIM: Partial<Record<SoundName, number>> = {
  click: 0.5,
  cardSelect: 0.6,
  win: 0.7,
  // ドパガキモードの音は、ほかの音に重ねて鳴らすので抑える
  dopaCoin: 0.45,
  dopaPraise: 0.5,
  dopaTurn: 0.6,
  dopaBomb: 0.7,
  dopaCheer: 0.7,
  dopaReach: 0.6,
}

/** 同じ音がこれより短い間隔で重なったら捨てる(一斉に着地したときに音が割れるのを防ぐ) */
const REPEAT_MS = 60
/** 読み込みが間に合わずこれより遅れた音は、場面とずれるので鳴らさない */
const LATE_MS = 400

let context: AudioContext | null = null
const buffers = new Map<SoundName, Promise<AudioBuffer | null>>()
const ready = new Map<SoundName, AudioBuffer>()
const lastAt = new Map<SoundName, number>()
/** ドパガキモードの音は、そのモードを選んだときに初めて読み込む */
let wantDopa = false

const isDopa = (name: SoundName) => name.startsWith('dopa')

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
  for (const name of Object.keys(URLS) as SoundName[]) {
    if (wantDopa || !isDopa(name)) void load(context, name)
  }
}

/** ドパガキモードの音を先に読み込んでおく(音の出口がまだ無ければ、最初の操作のときに読み込む) */
export function preloadDopaSounds(): void {
  wantDopa = true
  if (!context) return
  for (const name of Object.keys(URLS) as SoundName[]) void load(context, name)
}

if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', unlock, { capture: true })
  window.addEventListener('keydown', unlock, { capture: true })
}

/** rate は再生の速さ(音の高さ)。maxMs を渡すと、その長さで音を絞って止める */
export function playSound(name: SoundName, volume: number, rate = 1, maxMs?: number): void {
  const audio = context
  if (!audio || document.hidden) return
  const asked = performance.now()
  if (asked - (lastAt.get(name) ?? -Infinity) < REPEAT_MS) return
  lastAt.set(name, asked)
  const start = (buffer: AudioBuffer) => {
    const source = audio.createBufferSource()
    source.buffer = buffer
    source.playbackRate.value = rate
    const gain = audio.createGain()
    const level = volume * (TRIM[name] ?? 1)
    gain.gain.value = level
    source.connect(gain).connect(audio.destination)
    source.start()
    if (maxMs !== undefined) {
      const end = audio.currentTime + maxMs / 1000
      gain.gain.setValueAtTime(level, Math.max(audio.currentTime, end - 0.12))
      gain.gain.linearRampToValueAtTime(0, end)
      source.stop(end)
    }
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
