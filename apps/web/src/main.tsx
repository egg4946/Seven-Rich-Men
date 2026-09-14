import { MotionConfig } from 'motion/react'
import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { useFx } from './fx/store'
import './styles.css'

/** Motion の動き(カードの移動・登場)も演出の量に合わせる。オフでは止め、豪華・控えめでは動かす */
function MotionRoot({ children }: { children: ReactNode }) {
  const off = useFx((s) => s.level === 'off')
  return <MotionConfig reducedMotion={off ? 'always' : 'never'}>{children}</MotionConfig>
}

const root = document.getElementById('root')
if (!root) throw new Error('#root が見つかりません')

createRoot(root).render(
  <StrictMode>
    <MotionRoot>
      <App />
    </MotionRoot>
  </StrictMode>,
)
