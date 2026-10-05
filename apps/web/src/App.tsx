import { Suspense, lazy, useEffect } from 'react'
import { ScreenWipe } from './components/fx/ScreenWipe'
import { useFx } from './fx/store'
import { useGameStore } from './game/store'
import { GameScreen } from './screens/GameScreen'
import { LobbyScreen } from './screens/LobbyScreen'
import { TitleScreen } from './screens/TitleScreen'

/** ドパガキモードの飾り。選んだときに初めて読み込む(紙吹雪のライブラリと専用の CSS を含む) */
const DopaLayer = lazy(() => import('./components/fx/dopa/DopaLayer').then((m) => ({ default: m.DopaLayer })))

export function App() {
  const dopa = useFx((s) => s.level === 'dopa')
  const screen = useGameStore((s) => s.screen)
  const gameId = useGameStore((s) => s.gameId)
  const resumeSession = useGameStore((s) => s.resumeSession)

  // リロード前にオンラインの部屋にいたら、同じ部屋(同じ席)に戻る
  useEffect(() => {
    resumeSession()
  }, [resumeSession])

  return (
    <>
      {screen === 'lobby' ? <LobbyScreen /> : screen === 'game' ? <GameScreen key={gameId} /> : <TitleScreen />}
      {/* 画面・対戦(ラウンド)が変わるたびに幕を抜いて見せる */}
      <ScreenWipe key={`${screen}-${screen === 'game' ? gameId : 0}`} />
      {dopa && (
        <Suspense fallback={null}>
          <DopaLayer />
        </Suspense>
      )}
    </>
  )
}
