import type { HideableTab, TabArrangement } from './types'

// The top bar's tabs, their labels and default order, and how many the bar holds. Past ten
// names, More joins them and the rest go in a second row under it. Settings → Tabs can
// move any tab (but Home, always first) between the bar and More, reorder them, or
// switch them off.

export const TAB_LIST: { id: 'home' | HideableTab; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'steam', label: 'Steam' },
  { id: 'apps', label: 'Apps' },
  { id: 'switch', label: 'Switch' },
  { id: 'ps3', label: 'PS3' },
  { id: 'xbox', label: 'Xbox' },
  { id: 'xbox360', label: 'Xbox 360' },
  { id: 'ps2', label: 'PS2' },
  { id: 'psx', label: 'PSX' },
  { id: 'psp', label: 'PSP' },
  { id: 'gamecube', label: 'GameCube' },
  { id: 'wii', label: 'Wii' },
  { id: 'wiiu', label: 'Wii U' },
  { id: 'dreamcast', label: 'Dreamcast' },
  { id: 'saturn', label: 'Saturn' },
  { id: 'n64', label: 'N64' },
  { id: 'nes', label: 'NES' },
  { id: 'snes', label: 'SNES' },
  { id: 'genesis', label: 'Genesis' },
  { id: 'sega32x', label: '32X' },
  { id: 'amiga', label: 'Amiga' },
  { id: 'arcade', label: 'Arcade' }
]

/** Names the bar holds, Home included; More is added after them when there are more. */
export const BAR_TABS = 10
/** Names the More row holds. */
export const MORE_TABS = 11

/**
 * Where the tabs that show go: those with something in them and not switched off. With a
 * saved arrangement, in its order (a tab it doesn't mention yet joins the bar if there's
 * room, else More); without one, in bar order, filling the bar before More. The bar never
 * takes more than it holds; what doesn't fit moves to the front of More.
 */
export function arrangeTabs(available: Iterable<HideableTab>, hidden: Iterable<HideableTab>, saved?: TabArrangement): TabArrangement {
  const has = new Set(available)
  const off = new Set(hidden)
  const shows = (tab: HideableTab): boolean => has.has(tab) && !off.has(tab)
  const bar = (saved?.bar ?? []).filter(shows)
  const more = (saved?.more ?? []).filter(shows)
  const room = BAR_TABS - 1
  for (const { id } of TAB_LIST) {
    if (id === 'home' || !shows(id) || bar.includes(id) || more.includes(id)) continue
    // Without a saved arrangement, More only starts once the bar is full.
    if (bar.length < room && (saved || more.length === 0)) bar.push(id)
    else more.push(id)
  }
  more.unshift(...bar.splice(room))
  return { bar, more: more.slice(0, MORE_TABS) }
}
