import { useEffect } from 'react'
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

  if (screen === 'lobby') return <LobbyScreen />
  if (screen === 'game') return <GameScreen key={gameId} />
  return <TitleScreen />
}
