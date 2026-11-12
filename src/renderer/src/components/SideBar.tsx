import { useRef } from 'react'
import { formatTotalPlaytime, libraryStats } from '../../../shared/libraryStats'
import { LIBRARY_SORTS, type LibrarySort } from '../../../shared/librarySort'
import type { RecentItem } from '../../../shared/types'
import { ConsoleSpin } from '../background/ConsoleSpin'
import { focus } from '../input/focus'

/** Each console's logo (white, from the ES-DE Alpha theme's media), by tab id. */
const LOGOS = Object.fromEntries(
  Object.entries(import.meta.glob<string>('../assets/logos/*.svg', { query: '?url', import: 'default', eager: true })).map(([path, url]) => [
    path.slice(path.lastIndexOf('/') + 1, -'.svg'.length),
    url
  ])
)

// A console tab's left bar: the console's logo (or name), the console turning slowly, its totals, Sort, and its lists (All
// games, Recents, Favorites, the playlists set to show on this tab, Steam's collections on Steam's, then its Genres and Years). The grid beside it shows
// the list the cursor is on, as Settings' pane follows its categories; A steps into the grid,
// and B there comes back. Select (tapped) hides the bar, and the grid takes the whole width.

/** One of the bar's lists, and what its grid says when it has no games. */
export interface SideList {
  id: string
  name: string
  items: RecentItem[]
  empty: string
  /** The first of a section (Genres, Years): its heading goes above it. */
  section?: string
}

/** Where the cursor goes from the bar into the grid (the card last on, else the first). */
export const SIDE_GRID_CARDS = '.side-grid [data-focusable]'

export function SideBar({
  tab,
  logo,
  title,
  lists,
  all,
  selected,
  open,
  sort,
  onSort,
  onSelect
}: {
  /** The tab's id, for its console's logo. */
  tab: string
  /** Another logo to show instead, while it's there (an arcade system's, on its list). */
  logo?: string
  /** The console's name: under its logo for screen readers, or shown if it has none. */
  title: string
  lists: SideList[]
  /** Every game on the tab, for the totals. */
  all: RecentItem[]
  selected: string
  open: boolean
  sort: LibrarySort
  /** A on Sort: the next order. */
  onSort: () => void
  onSelect: (id: string) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const stats = libraryStats(all)
  const logoUrl = (logo && LOGOS[logo]) || LOGOS[tab]
  const current = lists.find((list) => list.id === selected)

  // Keeps the focused list in view when there are more than fit (many playlists).
  const reveal = (el: HTMLElement): void => {
    const list = box.current
    if (!list) return
    if (el.offsetTop < list.scrollTop) list.scrollTop = el.offsetTop
    else if (el.offsetTop + el.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = el.offsetTop + el.offsetHeight - list.clientHeight
  }

  return (
    // One column for up and down: Sort and the lists (the grid beside it is another).
    <aside className="side-bar" aria-hidden={!open} data-nav-scope="">
      <h1 className="side-bar-title display">{logoUrl ? <img className="side-bar-logo" src={logoUrl} alt={title} /> : title}</h1>
      {/* Hidden, the bar doesn't draw it. */}
      {open && <ConsoleSpin tab={tab} />}
      <dl className="side-bar-stats">
        <dt>Total games:</dt>
        <dd>{stats.games.toLocaleString()}</dd>
        <dt>Total unplayed:</dt>
        <dd>{stats.unplayed.toLocaleString()}</dd>
        <dt>Total playtime:</dt>
        <dd>{formatTotalPlaytime(stats.playtime)}</dd>
      </dl>
      <button
        className="side-bar-item side-bar-sort display"
        tabIndex={-1}
        {...(open ? { 'data-focusable': '' } : {})}
        data-select-sound="move"
        data-nav-right={SIDE_GRID_CARDS}
        onClick={onSort}
      >
        Sort: {LIBRARY_SORTS.find((s) => s.id === sort)?.name}
      </button>
      <div className="side-bar-lists" ref={box} data-focus-memory="side-bar">
        {lists.map((list) => [
          list.section && (
            <h3 key={`${list.id}-section`} className="side-bar-heading display">
              {list.section}
            </h3>
          ),
          <button
            key={list.id}
            id={sideListId(list.id)}
            className={`side-bar-item display${list.id === selected ? ' active' : ''}`}
            tabIndex={-1}
            // Hidden, the bar can't take the cursor.
            {...(open ? { 'data-focusable': '' } : {})}
            {...(open && !current?.items.length && list.id === selected ? { 'data-focus-default': '' } : {})}
            data-select-sound="move"
            data-nav-right={SIDE_GRID_CARDS}
            onFocus={(event) => {
              reveal(event.currentTarget)
              onSelect(list.id)
            }}
            onClick={() => {
              const first = document.querySelector<HTMLElement>(SIDE_GRID_CARDS)
              if (first) focus(first)
            }}
          >
            {list.name}
          </button>
        ])}
      </div>
    </aside>
  )
}

/** A list's button in the bar, for B from the grid to come back to. */
export function sideListId(id: string): string {
  return `side-list-${id.replace(/[^A-Za-z0-9_-]/g, '_')}`
}
