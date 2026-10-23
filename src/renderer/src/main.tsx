import { createRoot } from 'react-dom/client'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/700.css'
import './tokens.css'
import './app.css'
import { App } from './App'
import { startGamepad } from './input/gamepad'
import { startKeyboard } from './input/keyboard'
import { Setup } from './screens/Setup'
import './fonts'

// The AppImage opened in Desktop Mode: the install window, used with a mouse.
if (new URLSearchParams(location.search).has('setup')) {
  createRoot(document.getElementById('root')!).render(<Setup />)
} else {
  startKeyboard()
  startGamepad()
  createRoot(document.getElementById('root')!).render(<App />)
}
