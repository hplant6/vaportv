import type { LaunchKind } from '../../shared/types'
import { toast } from './components/Toast'

// The launch overlay: "Launching X" while Steam brings an app up, and "Closing X"
// while Select + Start shuts one down.

// Steam takes a few seconds to bring an app up. Until it does (our window loses
// focus) or this long passes, further launches are ignored, so a second press
// while waiting doesn't send a second launch.
const LAUNCH_TIMEOUT = 15000

export interface OverlayState {
  mode: 'launching' | 'closing'
  /** What's launching or closing, when known. */
  name?: string
}

type Listener = (state: OverlayState | null) => void

let state: OverlayState | null = null
let timer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<Listener>()

function set(next: OverlayState | null): void {
  state = next
  clearTimeout(timer)
  if (next?.mode === 'launching') timer = setTimeout(() => set(null), LAUNCH_TIMEOUT)
  for (const listener of listeners) listener(next)
}

// The app has come up in front of us.
window.addEventListener('blur', () => {
  if (state?.mode === 'launching') set(null)
})

window.steamtv.onClosing(({ active, name }) => set(active ? { mode: 'closing', name } : null))

/** Calls back with what the overlay should show, or null; returns an unsubscribe. */
export function onOverlay(listener: Listener): () => void {
  listeners.add(listener)
  listener(state)
  return () => listeners.delete(listener)
}

export function startLaunch(kind: LaunchKind, id: string, name: string, unavailable: string): void {
  if (state) return
  set({ mode: 'launching', name })
  window.steamtv.launch(kind, id, name).then((ok) => {
    if (ok) return
    set(null)
    toast(unavailable)
  })
}
