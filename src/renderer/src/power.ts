import { useSyncExternalStore } from 'react'
import type { BatteryState } from '../../shared/types'

// The system battery (see main's battery.ts), shared by the top bar's indicator and the
// backdrops (which slow down on battery). Checked every minute and on return to vaporTV.

const REFRESH_MS = 60_000

let battery: BatteryState | null = null
const listeners = new Set<() => void>()
let started = false

function load(): void {
  window.steamtv.getBattery().then((next) => {
    if (next?.percent === battery?.percent && next?.charging === battery?.charging) return
    battery = next
    for (const listener of listeners) listener()
  })
}

function subscribe(listener: () => void): () => void {
  if (!started) {
    started = true
    load()
    setInterval(load, REFRESH_MS)
    window.addEventListener('focus', load)
  }
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The battery, or null for a box without one. */
export function useBattery(): BatteryState | null {
  return useSyncExternalStore(subscribe, () => battery)
}

/** Running on battery: there is one, and it isn't plugged in. */
export function onBattery(): boolean {
  if (!started) subscribe(() => {})
  return !!battery && !battery.charging
}
