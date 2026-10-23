import { useEffect, useState } from 'react'
import type { HideableTab } from '../../shared/types'

// Which optional tabs show: those with something in them, less any switched off in
// Settings. Shared by the nav bar (to hide the rest) and L1/R1 (to skip them); refreshed
// now and then as games are added or removed, and at once when Settings changes them.

const REFRESH_MS = 5 * 60 * 1000

let tabs: Partial<Record<HideableTab, boolean>> = {}
const listeners = new Set<() => void>()

function load(): void {
  window.steamtv.getAvailableTabs().then((next) => {
    tabs = next
    for (const listener of listeners) listener()
  })
}

/** Settings changed which tabs show: look again now. */
export function refreshTabs(): void {
  load()
}

let started = false
function start(): void {
  if (started) return
  started = true
  load()
  setInterval(load, REFRESH_MS)
}

/** Whether a screen is shown: anything not known to be empty is. */
export function tabShown(screen: string): boolean {
  return tabs[screen as HideableTab] !== false
}

/** Re-renders when the available tabs change; returns the current check. */
export function useAvailableTabs(): (screen: string) => boolean {
  const [, setVersion] = useState(0)
  useEffect(() => {
    start()
    const listener = (): void => setVersion((v) => v + 1)
    listeners.add(listener)
    return () => void listeners.delete(listener)
  }, [])
  return tabShown
}
