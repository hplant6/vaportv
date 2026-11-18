import { useEffect, useState } from 'react'
import type { HideableTab, TabArrangement } from '../../shared/types'
import { arrangeTabs, TAB_LIST } from '../../shared/tabs'

// Which tabs show, and where: the bar (after Home) or the More screen. Those with something in
// them, less any switched off, arranged as in Settings → Tabs. Shared by the nav bar, More and
// L1/R1 (which steps through the bar in that order); refreshed now and then as games are added
// or removed, and at once when Settings changes them.

const REFRESH_MS = 5 * 60 * 1000

// Until the first answer, every tab, in bar order.
let arrangement: TabArrangement = arrangeTabs(
  TAB_LIST.map((t) => t.id).filter((t): t is HideableTab => t !== 'home'),
  []
)
const listeners = new Set<() => void>()

function load(): void {
  window.steamtv.getAvailableTabs().then((next) => {
    arrangement = next
    for (const listener of listeners) listener()
  })
}

/** Settings changed which tabs show or where: look again now. */
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

/**
 * The screens in the order L1/R1 step through them: Settings, Home, the bar's tabs, then More
 * (one stop: its tabs are picked from its grid, not stepped through).
 */
export function tabOrder(): string[] {
  return ['settings', 'home', ...arrangement.bar, ...(arrangement.more.length ? ['more'] : [])]
}

/** Every tab on show, the bar's then More's (the Consoles screensaver shows them all). */
export function allTabs(): string[] {
  return ['home', ...arrangement.bar, ...arrangement.more]
}

/** Whether a screen is one of More's tabs: the bar lights More for it, and B goes back to More. */
export function inMore(screen: string): boolean {
  return (arrangement.more as string[]).includes(screen)
}

/** Re-renders when the tabs change; returns where they go now. */
export function useTabArrangement(): TabArrangement {
  const [, setVersion] = useState(0)
  useEffect(() => {
    start()
    const listener = (): void => setVersion((v) => v + 1)
    listeners.add(listener)
    return () => void listeners.delete(listener)
  }, [])
  return arrangement
}
