import { useState } from 'react'
import type { CpuLevel } from '@srm/game-ai'
import { Button } from '../components/Button'
import { ChoiceChip } from '../components/ChoiceChip'
import { RulesDialog } from '../components/RulesDialog'
import { useGameStore } from '../game/store'

export function TitleScreen() {
  const initial = useGameStore((s) => s.settings)
  const start = useGameStore((s) => s.start)
  const [name, setName] = useState(initial.name)
  const [cpuCount, setCpuCount] = useState(initial.cpuCount)
  const [level, setLevel] = useState<CpuLevel>(initial.level)
  const [rulesOpen, setRulesOpen] = useState(false)

  return (
    <main className="min-h-dvh bg-gray-50 px-4 py-10 md:py-16">
      <div className="mx-auto max-w-lg">
        <p className="text-sm font-medium text-primary-600">七並べ × 大富豪</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900 md:text-3xl">Seven Rich Men</h1>
        <p className="mt-3 text-base text-body">
          7から並べて、手札を先になくした人の勝ち。8切り・Qボンバー・ジョーカーなど、数字ごとの効果で場が大きく動きます。
        </p>

        <form
          className="mt-8 space-y-6 rounded-xl border border-slate-200 bg-white p-6 leading-normal shadow-sm"
          onSubmit={(event) => {
            event.preventDefault()
            start({ name: name.trim(), cpuCount, level })
          }}
        >
          <div>
            <label htmlFor="player-name" className="mb-1 block text-sm font-medium text-slate-700">
              あなたの名前
            </label>
            <input
              id="player-name"
              type="text"
              value={name}
              maxLength={12}
              autoComplete="nickname"
              placeholder="あなた"
              onChange={(event) => setName(event.target.value)}
              className="h-11 w-full rounded-lg border border-slate-300 px-3 text-base text-slate-900 caret-primary-500 transition-colors placeholder:text-slate-500 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/50 focus:outline-none"
            />
          </div>

          <div>
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-slate-700">対戦するCPUの人数</legend>
              <div className="grid grid-cols-4 gap-2">
                {[2, 3, 4, 5].map((count) => (
                  <ChoiceChip
                    key={count}
                    name="cpu-count"
                    checked={cpuCount === count}
                    onChange={() => setCpuCount(count)}
                    label={`${count}人`}
                    description={`${count + 1}人戦`}
                  />
                ))}
              </div>
            </fieldset>
          </div>

          <div>
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-slate-700">CPUの強さ</legend>
              <div className="grid grid-cols-2 gap-2">
                <ChoiceChip
                  name="cpu-level"
                  checked={level === 'normal'}
                  onChange={() => setLevel('normal')}
                  label="ふつう"
                  description="効果を考えて出す"
                />
                <ChoiceChip
                  name="cpu-level"
                  checked={level === 'easy'}
                  onChange={() => setLevel('easy')}
                  label="やさしい"
                  description="でたらめに出す"
                />
              </div>
            </fieldset>
          </div>

          <Button type="submit" size="lg" className="w-full">
            対戦をはじめる
          </Button>
        </form>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 leading-normal">
          <Button variant="subtle" onClick={() => setRulesOpen(true)}>
            ルールを見る
          </Button>
          <p className="text-xs text-slate-500">オンライン対戦は準備中です</p>
        </div>
      </div>

      <RulesDialog open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </main>
  )
}
