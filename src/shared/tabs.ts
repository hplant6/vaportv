import type { HideableTab } from './types'

// The top bar's tabs, in order, and how many it shows. The bar's middle fits ten names;
// past that, the first ones in this order show, and Settings won't switch on another until
// one is switched off. Home always shows.

export const TAB_LIST: { id: 'home' | HideableTab; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'steam', label: 'Steam' },
  { id: 'apps', label: 'Apps' },
  { id: 'switch', label: 'Switch' },
  { id: 'ps3', label: 'PS3' },
  { id: 'xbox', label: 'Xbox' },
  { id: 'xbox360', label: 'Xbox 360' },
  { id: 'ps2', label: 'PS2' },
  { id: 'gamecube', label: 'GameCube' },
  { id: 'wii', label: 'Wii' },
  { id: 'dreamcast', label: 'Dreamcast' },
  { id: 'arcade', label: 'Arcade' }
]

export const MAX_TABS = 10

/** The tabs the bar shows (Home included): those with something in them and not switched off, up to MAX_TABS. */
export function shownTabs(available: Iterable<HideableTab>, hidden: Iterable<HideableTab>): ('home' | HideableTab)[] {
  const has = new Set(available)
  const off = new Set(hidden)
  const shown: ('home' | HideableTab)[] = []
  for (const tab of TAB_LIST) {
    if (shown.length >= MAX_TABS) break
    if (tab.id === 'home' || (has.has(tab.id) && !off.has(tab.id))) shown.push(tab.id)
  }
  return shown
}
