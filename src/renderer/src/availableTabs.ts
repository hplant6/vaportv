import { useEffect, useState } from 'react'
import type { LayoutTab } from '../../shared/types'

// Which optional tabs have something to show. Shared by the nav bar (to hide the rest)
// and L1/R1 (to skip them); refreshed now and then as games are added or removed.

const REFRESH_MS = 5 * 60 * 1000

let tabs: Partial<Record<LayoutTab, boolean>> = {}
const listeners = new Set<() => void>()

function load(): void {
  window.steamtv.getAvailableTabs().then((next) => {
    tabs = next
    for (const listener of listeners) listener()
  })
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
  return tabs[screen as LayoutTab] !== false
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
