import { createRoot } from 'react-dom/client'
import '@fontsource/space-grotesk/400.css'
import '@fontsource/space-grotesk/700.css'
import './tokens.css'
import './app.css'
import { App } from './App'
import { startGamepad } from './input/gamepad'
import { startKeyboard } from './input/keyboard'
import { startModalExits } from './modalExit'
import { Setup } from './screens/Setup'
import './fonts'

// The AppImage opened in Desktop Mode: the install window, used with a mouse.
if (new URLSearchParams(location.search).has('setup')) {
  createRoot(document.getElementById('root')!).render(<Setup />)
} else {
  startKeyboard()
  startGamepad()
  startModalExits()
  createRoot(document.getElementById('root')!).render(<App />)
}
