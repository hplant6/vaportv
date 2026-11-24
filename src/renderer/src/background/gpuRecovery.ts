import { useEffect, useState } from 'react'
import { registerDiagnostics } from '../diagnostics'
import { trail } from '../trail'

// Waking the box from sleep resets its GPU, and every WebGL context drawing then is lost: the
// backdrops (and the turning consoles) went on drawing into nothing, black until vaporTV was
// restarted. So when a context we're using is lost, or the system wakes, the WebGL views are
// started again from scratch on fresh canvases: `useGpuGeneration()` changes, and they're
// keyed by it.

/** A moment for the GPU to come back before drawing again. */
const SETTLE_MS = 1500

let generation = 0
const listeners = new Set<() => void>()
let pending: ReturnType<typeof setTimeout> | null = null

/** Contexts let go of on purpose (a backdrop stopping): their loss isn't the GPU's. */
const released = new WeakSet<EventTarget>()

/** Call just before letting go of a canvas's context yourself (loseContext / forceContextLoss). */
export function markReleased(canvas: EventTarget | null | undefined): void {
  if (canvas) released.add(canvas)
}

/** The last restarts, for Report a problem: when, and why. */
const restarts: string[] = []
registerDiagnostics('gpuRecovery', () => ({ generation, restartPending: !!pending, restarts }))

function restart(why: string): void {
  if (pending) return
  restarts.push(`${new Date().toISOString()} ${why}`)
  trail(`WebGL views restarting (${why})`)
  if (restarts.length > 10) restarts.shift()
  console.error(`steamtv: WebGL views restarting (${why})`)
  pending = setTimeout(() => {
    pending = null
    generation++
    for (const listener of listeners) listener()
  }, SETTLE_MS)
}

/** For a context not on the page (the turning consoles' shared one), whose loss the page-wide listener can't hear. */
export function reportContextLost(what: string): void {
  restart(`${what} context lost`)
}

let started = false
function start(): void {
  if (started) return
  started = true
  // Context events don't bubble; caught on the way down instead.
  document.addEventListener(
    'webglcontextlost',
    (event) => {
      const canvas = event.target
      if (!canvas || released.has(canvas) || !(canvas as Element).isConnected) return
      restart('context lost')
    },
    true
  )
  window.steamtv.onResume(() => restart('woke from sleep'))
}

/** Changes whenever the WebGL views should start again: key them by it. */
export function useGpuGeneration(): number {
  const [value, setValue] = useState(generation)
  useEffect(() => {
    start()
    const listener = (): void => setValue(generation)
    listeners.add(listener)
    setValue(generation)
    return () => {
      listeners.delete(listener)
    }
  }, [])
  return value
}
