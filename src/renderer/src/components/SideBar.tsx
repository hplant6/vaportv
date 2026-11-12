import { useRef } from 'react'
import { formatTotalPlaytime, libraryStats } from '../../../shared/libraryStats'
import type { RecentItem } from '../../../shared/types'
import { focus } from '../input/focus'

// A console tab's left bar: the console's name, its totals, and its lists (All games,
// Recents, Favorites, then the playlists set to show on this tab). The grid beside it shows
// the list the cursor is on, as Settings' pane follows its categories; A steps into the grid,
// and B there comes back. Select (tapped) hides the bar, and the grid takes the whole width.

/** One of the bar's lists, and what its grid says when it has no games. */
export interface SideList {
  id: string
  name: string
  items: RecentItem[]
  empty: string
}

/** Where the cursor goes from the bar into the grid (the card last on, else the first). */
export const SIDE_GRID_CARDS = '.side-grid [data-focusable]'

export function SideBar({
  title,
  lists,
  all,
  selected,
  open,
  onSelect
}: {
  title: string
  lists: SideList[]
  /** Every game on the tab, for the totals. */
  all: RecentItem[]
  selected: string
  open: boolean
  onSelect: (id: string) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const stats = libraryStats(all)
  const current = lists.find((list) => list.id === selected)

  // Keeps the focused list in view when there are more than fit (many playlists).
  const reveal = (el: HTMLElement): void => {
    const list = box.current
    if (!list) return
    if (el.offsetTop < list.scrollTop) list.scrollTop = el.offsetTop
    else if (el.offsetTop + el.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = el.offsetTop + el.offsetHeight - list.clientHeight
  }

  return (
    <aside className="side-bar" aria-hidden={!open}>
      <h1 className="side-bar-title display">{title}</h1>
      <dl className="side-bar-stats">
        <dt>Total games:</dt>
        <dd>{stats.games.toLocaleString()}</dd>
        <dt>Total unplayed:</dt>
        <dd>{stats.unplayed.toLocaleString()}</dd>
        <dt>Total playtime:</dt>
        <dd>{formatTotalPlaytime(stats.playtime)}</dd>
      </dl>
      <div className="side-bar-lists" ref={box} data-focus-memory="side-bar" data-nav-scope="">
        {lists.map((list) => (
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
        ))}
      </div>
    </aside>
  )
}

/** A list's button in the bar, for B from the grid to come back to. */
export function sideListId(id: string): string {
  return `side-list-${id.replace(/[^A-Za-z0-9_-]/g, '_')}`
}
