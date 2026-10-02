import { useEffect } from 'react'
import { ScreenWipe } from './components/fx/ScreenWipe'
import { useGameStore } from './game/store'
import { GameScreen } from './screens/GameScreen'
import { LobbyScreen } from './screens/LobbyScreen'
import { TitleScreen } from './screens/TitleScreen'

export function App() {
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
    </>
  )
}
