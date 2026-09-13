import { useGameStore } from './game/store'
import { GameScreen } from './screens/GameScreen'
import { TitleScreen } from './screens/TitleScreen'

export function App() {
  const screen = useGameStore((s) => s.screen)
  const gameId = useGameStore((s) => s.gameId)
  return screen === 'title' ? <TitleScreen /> : <GameScreen key={gameId} />
}
