import { createRoot } from 'react-dom/client'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/700.css'
import './tokens.css'
import './app.css'
import { App } from './App'
import { startGamepad } from './input/gamepad'
import { startKeyboard } from './input/keyboard'

startKeyboard()
startGamepad()

createRoot(document.getElementById('root')!).render(<App />)
