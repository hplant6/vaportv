import type { HideableTab, LayoutTab, PlaylistPlace, TabArrangement } from './types'

// The top bar's tabs, their labels and default order, and how many the bar holds. Past
// eleven names, the rest go in a second row under it, which Down from the bar opens.
// Settings → Tabs can move any tab (but Home, always first) between the bar and the second
// row, reorder them, or switch them off. (The second row is `more` in code and config: it
// was once opened by a More tab.)

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
  { id: 'neogeo', label: 'Neo Geo' },
  { id: 'arcade', label: 'Arcade' }
]

/** Names the bar holds, Home included. */
export const BAR_TABS = 11
/** Names the second row holds. */
export const MORE_TABS = 11

/**
 * Where the tabs that show go: those with something in them and not switched off. With a
 * saved arrangement, in its order (a tab it doesn't mention yet joins the bar if there's
 * room, else the second row); without one, in bar order, filling the bar first. The bar never
 * takes more than it holds; what doesn't fit moves to the front of the second row.
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
    // Without a saved arrangement, the second row only starts once the bar is full.
    if (bar.length < room && (saved || more.length === 0)) bar.push(id)
    else more.push(id)
  }
  more.unshift(...bar.splice(room))
  return { bar, more: more.slice(0, MORE_TABS) }
}

/** The tabs a game playlist can show on besides Home: every tab with games (all but Apps). */
export const PLAYLIST_TABS = TAB_LIST.flatMap(({ id }) => (id === 'home' || id === 'apps' ? [] : [id as LayoutTab]))

/**
 * Where a playlist made on `screen` shows to begin with: the left bar of the tab it was made
 * on (a console's, Arcade's or Steam's), or Home when made from Home, Apps or Settings.
 */
export function newPlaylistPlace(screen: string): PlaylistPlace {
  return (PLAYLIST_TABS as string[]).includes(screen) ? (screen as LayoutTab) : 'home'
}

/**
 * The tab a game is listed on, for its own tab's playlists: by its id's prefix (snes:…,
 * steam:…). Non-Steam games are on Steam's; Neo Geo sets, kept as arcade:neogeo/…, on Neo
 * Geo's. Null for anything that isn't a game on a tab (an app, a streaming service).
 */
export function gameTab(id: string): LayoutTab | null {
  const prefix = id.slice(0, id.indexOf(':'))
  const tab = prefix === 'shortcut' ? 'steam' : prefix === 'arcade' && id.startsWith('arcade:neogeo/') ? 'neogeo' : prefix
  return (PLAYLIST_TABS as string[]).includes(tab) ? (tab as LayoutTab) : null
}

/** Whether a playlist showing on `places` can take a game on `tab`: one on Home takes any game, one on a tab only its own. */
export function playlistTakes(places: PlaylistPlace[], tab: LayoutTab | null): boolean {
  return places.includes('home') || (tab !== null && places.includes(tab))
}

/** e.g. "Home, Switch", in the bar's order. */
export function playlistPlacesLabel(places: PlaylistPlace[]): string {
  return TAB_LIST.filter(({ id }) => (places as string[]).includes(id))
    .map(({ label }) => label)
    .join(', ')
}

/** Tabs with a left bar (their lists: All games, Recents, Favorites, playlists...): every tab with games. */
export function hasSideBar(tab: string): tab is LayoutTab {
  return (PLAYLIST_TABS as string[]).includes(tab)
}
