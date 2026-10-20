import { activate, back, coreMenu, favorite, move, openSettings, options, switchTab, type Direction } from './focus'
import { SCREENSAVER_EVENT } from '../components/Screensaver'
import { noteInput } from './idle'

const DIRECTIONS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right'
}

const REPEAT_DELAY = 400
const REPEAT_INTERVAL = 130
/**
 * Holding a direction repeats for at most this long. The system's own key repeat
 * is ignored: if a key-up is lost (a device switched off mid-press), it repeats
 * forever with nothing touching the remote.
 */
const MAX_REPEAT = 4000

let held: { key: string; since: number } | null = null
let timer: ReturnType<typeof setTimeout> | undefined

function stop(): void {
  held = null
  clearTimeout(timer)
}

function repeat(key: string, direction: Direction, delay: number): void {
  timer = setTimeout(() => {
    if (held?.key !== key || performance.now() - held.since > MAX_REPEAT) return stop()
    move(direction, 'keyboard')
    repeat(key, direction, REPEAT_INTERVAL)
  }, delay)
}

export function startKeyboard(): void {
  // First, before any other key handler: a key that wakes the screensaver does nothing else.
  window.addEventListener(
    'keydown',
    (event) => {
      if (!noteInput(!event.repeat, DIRECTIONS[event.key])) return
      event.preventDefault()
      event.stopImmediatePropagation()
    },
    true
  )
  window.addEventListener('keydown', (event) => {
    // In a text box the keys edit the text; only up/down still move between rows.
    if (event.target instanceof HTMLInputElement && event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    const direction = DIRECTIONS[event.key]
    if (direction) {
      event.preventDefault()
      if (event.repeat) return
      stop()
      held = { key: event.key, since: performance.now() }
      move(direction, 'keyboard')
      repeat(event.key, direction, REPEAT_DELAY)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (!event.repeat) activate()
    } else if (event.key === 'Escape' || event.key === 'Backspace' || event.key === 'BrowserBack') {
      event.preventDefault()
      if (!event.repeat) back()
    } else if (event.key === 'F2') {
      // A remote's Guide button (mapped to F2): the screensaver now, as Settings' Test does.
      event.preventDefault()
      if (!event.repeat) {
        window.steamtv.logInput('screensaver key')
        window.dispatchEvent(new CustomEvent(SCREENSAVER_EVENT, { detail: 'preview' }))
      }
    } else if (event.key === 'ContextMenu' || event.key === 'Props') {
      // A keyboard's Menu key; remotes' Menu buttons send the HID "Menu" key, which is Props.
      event.preventDefault()
      if (!event.repeat) openSettings()
    } else if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault()
      if (!event.repeat) switchTab(event.key === 'PageUp' ? -1 : 1)
    } else if (event.key === 'c' || event.key === 'C') {
      event.preventDefault()
      if (!event.repeat) coreMenu()
    } else if (event.key === 'x' || event.key === 'X') {
      event.preventDefault()
      if (!event.repeat) options()
    } else if (event.key === 'f' || event.key === 'F') {
      event.preventDefault()
      if (!event.repeat) favorite()
    }
  })
  window.addEventListener('keyup', (event) => {
    if (event.key === held?.key) stop()
  })
  window.addEventListener('blur', stop)
}
