import type { SteamLayout } from './types'

// A game tab's sections: one per list in its left bar (All games, Recents, Favorites, the
// playlists shown on it, Steam's collections, Arcade's systems), stacked down the page in the
// order chosen in its Customize window, each in a style of its own, or hidden. A grid takes all
// the room below it, so there's at most one and it's always last.

export type SectionStyle = 'spotlight' | 'carousel' | 'posters' | 'wide'

export interface TabSection {
  /** The list's id (as the bar has it: all, recent, favorites, playlist:<id>, row:<id>). */
  id: string
  style: SectionStyle
  hidden?: boolean
}

/** The styles, in the order Customize steps through them. */
export const SECTION_STYLES: { id: SectionStyle; name: string }[] = [
  { id: 'spotlight', name: 'Spotlight' },
  { id: 'carousel', name: 'Carousel' },
  { id: 'posters', name: 'Poster grid' },
  { id: 'wide', name: 'Wide grid' }
]

export const isGrid = (style: SectionStyle): boolean => style === 'posters' || style === 'wide'

/**
 * A tab's two groups. The library: lists vaporTV makes (All games, Recents, Favorites) or brings
 * in (Steam's collections, the non-Steam games, Arcade's systems). Playlists: the ones made in
 * vaporTV (each its own list, or Music's one Playlists list of them all). A section moves only within its group, and the library always comes first.
 */
export type SectionGroup = 'library' | 'playlists'
export const sectionGroup = (id: string): SectionGroup => (id.startsWith('playlist:') || id === 'playlists' ? 'playlists' : 'library')

/** The library's sections, then the playlists', each in the order they were in. */
const grouped = (sections: TabSection[]): TabSection[] => [
  ...sections.filter((s) => sectionGroup(s.id) === 'library'),
  ...sections.filter((s) => sectionGroup(s.id) === 'playlists')
]

/**
 * The order the left bar and the Customize window list them: each group together, the library
 * first, a grid at the end of its own group (on the page it's at the very bottom).
 */
export function listOrder(sections: TabSection[]): TabSection[] {
  const grid = sections.find((s) => isGrid(s.style))
  const rest = sections.filter((s) => s !== grid)
  const group = (g: SectionGroup): TabSection[] => [...rest.filter((s) => sectionGroup(s.id) === g), ...(grid && sectionGroup(grid.id) === g ? [grid] : [])]
  return [...group('library'), ...group('playlists')]
}

/** The tab's old single layout (from before sections) as the main list's style. */
function mainStyle(layout: SteamLayout): SectionStyle {
  return layout === 'spotlight' ? 'spotlight' : layout === 'grid' ? 'wide' : 'posters'
}

/** The groups in order (the library, then playlists); one grid at most, and it last: a later one becomes a carousel, and the grid moves to the end. */
export function normalize(sections: TabSection[]): TabSection[] {
  let grid: TabSection | undefined
  const rest: TabSection[] = []
  for (const s of sections) {
    if (isGrid(s.style) && !grid) grid = s
    else rest.push(isGrid(s.style) ? { ...s, style: 'carousel' } : s)
  }
  return grid ? [...grouped(rest), grid] : grouped(rest)
}

/**
 * The sections for a tab whose bar has `listIds` (in the bar's order): the saved ones in their
 * saved order (lists that are gone dropped), lists new since added as carousels; with nothing
 * saved, what the tab's old layout looked like: All games in it, the other lists as carousels
 * (above it, when it's a grid).
 */
export function resolveSections(listIds: string[], saved: TabSection[] | undefined, layout: SteamLayout): TabSection[] {
  if (!saved?.length) {
    const main = mainStyle(layout)
    const others = listIds.filter((id) => id !== 'all').map((id): TabSection => ({ id, style: 'carousel' }))
    const all: TabSection[] = listIds.includes('all') ? [{ id: 'all', style: main }] : []
    return normalize(isGrid(main) ? [...others, ...all] : [...all, ...others])
  }
  const present = new Set(listIds)
  const kept = saved.filter((s) => present.has(s.id))
  const known = new Set(kept.map((s) => s.id))
  const added = listIds.filter((id) => !known.has(id)).map((id): TabSection => ({ id, style: 'carousel' }))
  return normalize([...kept, ...added])
}

/** At least one section has to show: hiding the last one shown isn't allowed (null). */
export function setHidden(sections: TabSection[], id: string, hidden: boolean): TabSection[] | null {
  const next = sections.map((s) => (s.id === id ? { ...s, hidden: hidden || undefined } : s))
  return next.some((s) => !s.hidden) ? next : null
}

/** A section given a style: a grid takes over from the one before it (now a carousel) and goes last. */
export function setStyle(sections: TabSection[], id: string, style: SectionStyle): TabSection[] {
  const next = sections.map((s) => (s.id === id ? { ...s, style } : isGrid(style) && isGrid(s.style) ? { ...s, style: 'carousel' as const } : s))
  if (!isGrid(style)) return normalize(next)
  const picked = next.find((s) => s.id === id)!
  return [...next.filter((s) => s.id !== id), picked]
}

/** A section moved one place up or down, within its group; the grid stays last, so nothing moves below it. */
export function moveSection(sections: TabSection[], id: string, by: -1 | 1): TabSection[] {
  const at = sections.findIndex((s) => s.id === id)
  const to = at + by
  if (at < 0 || to < 0 || to >= sections.length) return sections
  if (isGrid(sections[at].style) || isGrid(sections[to].style)) return sections
  if (sectionGroup(sections[at].id) !== sectionGroup(sections[to].id)) return sections
  const next = [...sections]
  ;[next[at], next[to]] = [next[to], next[at]]
  return next
}
