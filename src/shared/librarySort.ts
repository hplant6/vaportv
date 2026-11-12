import type { RecentItem } from './types'

// The left bar's Sort, and its Genres and Years lists, from a console tab's game cards.

export type LibrarySort = 'title' | 'lastPlayed' | 'mostPlayed' | 'added'

/** In the order A cycles them. */
export const LIBRARY_SORTS: { id: LibrarySort; name: string }[] = [
  { id: 'title', name: 'Title' },
  { id: 'lastPlayed', name: 'Last played' },
  { id: 'mostPlayed', name: 'Most played' },
  { id: 'added', name: 'Recently added' }
]

export function nextSort(sort: LibrarySort): LibrarySort {
  const i = LIBRARY_SORTS.findIndex((s) => s.id === sort)
  return LIBRARY_SORTS[(i + 1) % LIBRARY_SORTS.length].id
}

const byTitle = (a: RecentItem, b: RecentItem): number => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true })

/** Newest or biggest first; games without one (never played, date unknown) after, A–Z. */
function descending(value: (item: RecentItem) => string | number | undefined): (a: RecentItem, b: RecentItem) => number {
  return (a, b) => {
    const [x, y] = [value(a), value(b)]
    if (x === undefined || y === undefined) return x === y ? byTitle(a, b) : x === undefined ? 1 : -1
    return x < y ? 1 : x > y ? -1 : byTitle(a, b)
  }
}

const COMPARE: Record<LibrarySort, (a: RecentItem, b: RecentItem) => number> = {
  title: byTitle,
  lastPlayed: descending((item) => item.lastPlayed),
  mostPlayed: descending((item) => item.playtime || undefined),
  added: descending((item) => item.added)
}

export function sortItems(items: RecentItem[], sort: LibrarySort): RecentItem[] {
  return [...items].sort(COMPARE[sort])
}

/** Past this many years, Years lists decades instead (the 1990s). */
const MOST_YEARS = 15

export interface Group {
  id: string
  name: string
  items: RecentItem[]
}

/** A list per genre, A–Z, of the games ES-DE gave one. */
export function genreGroups(items: RecentItem[]): Group[] {
  const groups = new Map<string, RecentItem[]>()
  for (const item of items) if (item.genre) groups.set(item.genre, [...(groups.get(item.genre) ?? []), item])
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, games]) => ({ id: `genre:${name}`, name, items: games }))
}

/** A list per release year, oldest first; per decade if there are too many years to list. */
export function yearGroups(items: RecentItem[]): Group[] {
  const dated = items.filter((item) => item.year)
  const years = new Set(dated.map((item) => item.year!))
  const decades = years.size > MOST_YEARS
  const groups = new Map<number, RecentItem[]>()
  for (const item of dated) {
    const key = decades ? Math.floor(item.year! / 10) * 10 : item.year!
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return [...groups]
    .sort(([a], [b]) => a - b)
    .map(([key, games]) => (decades ? { id: `decade:${key}`, name: `${key}s`, items: games } : { id: `year:${key}`, name: String(key), items: games }))
}
