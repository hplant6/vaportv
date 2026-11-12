import { useEffect, useState, type ReactNode } from 'react'
import { hasSideBar, TAB_LIST } from '../../../shared/tabs'
import type { CollectionRow, LibraryTab, PlaylistRow } from '../../../shared/types'
import { CardRow } from '../components/CardRow'
import { CollectionGrid, PosterGrid } from '../components/CollectionGrid'
import { NavBar, type Screen } from '../components/NavBar'
import { SIDE_GRID_CARDS, SideBar, sideListId, type SideList } from '../components/SideBar'
import { toast } from '../components/Toast'
import { FAVORITE_EVENT, focus, focusContentDefault, SIDE_BAR_EVENT } from '../input/focus'
import { play } from '../input/sounds'
import { HOME_CHANGED_EVENT } from './Settings'
import { usePageScroll } from './usePageScroll'

interface Props {
  /** Which tab this is, for the nav bar. */
  screen: Screen
  load: () => Promise<LibraryTab>
  /** Shown when there's nothing to list. */
  empty: string
  /** Toggles a game's favourite status (tabs that support favourites). */
  onFavorite?: (id: string) => Promise<boolean>
  logos: Record<string, string>
  onNavigate: (screen: Screen) => void
}

/** e.g. "Favorites (57)": the games shown in the row. */
function titleWithCount(row: CollectionRow): string {
  return `${row.name} (${row.items.length})`
}

function notInstalledNote(count: number): string | null {
  return count ? `${count} more not installed` : null
}

// What the left bar remembers per tab (this TV only): whether it's hidden, and the list
// last shown. Losing it (a cleared profile) just means the bar's open on All games.
const STORE = 'vaportv.sideBar'

function remembered(): { hidden: string[]; lists: Record<string, string> } {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) ?? '{}')
    return { hidden: Array.isArray(saved.hidden) ? saved.hidden : [], lists: saved.lists && typeof saved.lists === 'object' ? saved.lists : {} }
  } catch {
    return { hidden: [], lists: {} }
  }
}

function remember(edit: (saved: ReturnType<typeof remembered>) => void): void {
  try {
    const saved = remembered()
    edit(saved)
    localStorage.setItem(STORE, JSON.stringify(saved))
  } catch {
    // Not kept; the bar works the same this time.
  }
}

/**
 * A library tab (Steam, Switch): a section per collection, laid out as rows or a
 * grid per the Settings choice. A console's tab has a left bar instead (SideBar): its lists,
 * and the one the cursor is on as a single grid. Reloads as background art downloads arrive.
 */
export function Library({ screen, load, empty, onFavorite, logos, onNavigate }: Props) {
  const scroll = usePageScroll()
  const [tab, setTab] = useState<LibraryTab | null>(null)
  const bar = hasSideBar(screen)
  const [playlists, setPlaylists] = useState<PlaylistRow[]>([])
  const [open, setOpen] = useState(() => !remembered().hidden.includes(screen))
  const [selected, setSelected] = useState(() => remembered().lists[screen] ?? 'all')

  // Loaded on opening, again when art arrives, and on coming back from a game (so what
  // was just played shows under Recently played straight away, as on Home). The bar's
  // playlists also when one changes (X on a game, Settings).
  useEffect(() => {
    const reload = (): void => {
      load().then(setTab)
      if (bar) window.steamtv.gamePlaylists.forTab(screen).then(setPlaylists)
    }
    reload()
    window.addEventListener('focus', reload)
    window.addEventListener(HOME_CHANGED_EVENT, reload)
    const offArt = window.steamtv.onArtUpdated(reload)
    return () => {
      window.removeEventListener('focus', reload)
      window.removeEventListener(HOME_CHANGED_EVENT, reload)
      offArt()
    }
  }, [load, bar, screen])

  useEffect(() => {
    if (!onFavorite) return
    const handler = (event: Event): void => {
      const el = (event as CustomEvent<HTMLElement>).detail
      const id = el.dataset.itemId
      const title = el.getAttribute('aria-label') ?? el.querySelector('.recent-title')?.textContent ?? 'Game'
      if (!id) return
      onFavorite(id).then((on) => {
        play(on ? 'favorite' : 'move')
        toast(on ? `Added ${title} to Favorites` : `Removed ${title} from Favorites`)
        load().then(setTab)
      })
    }
    window.addEventListener(FAVORITE_EVENT, handler)
    return () => window.removeEventListener(FAVORITE_EVENT, handler)
  }, [onFavorite, load])

  // Select (tapped): hides the bar, or brings it back. The cursor leaves it first if it's there.
  useEffect(() => {
    if (!bar) return
    const toggle = (): void => {
      const inBar = !!document.activeElement?.closest('.side-bar')
      setOpen((was) => {
        remember((saved) => {
          saved.hidden = saved.hidden.filter((t) => t !== screen)
          if (was) saved.hidden.push(screen)
        })
        return !was
      })
      play('move')
      if (inBar) {
        const card = document.querySelector<HTMLElement>(SIDE_GRID_CARDS)
        if (card) focus(card)
      }
    }
    window.addEventListener(SIDE_BAR_EVENT, toggle)
    return () => window.removeEventListener(SIDE_BAR_EVENT, toggle)
  }, [bar, screen])

  // On first load only; art reloads keep focus where it is.
  const loaded = tab !== null
  useEffect(() => {
    if (loaded) focusContentDefault()
  }, [loaded])

  const rows = tab?.rows

  if (bar && rows?.length) {
    const rowItems = (id: string) => rows.find((row) => row.id === id)?.items ?? []
    const lists: SideList[] = [
      { id: 'all', name: 'All games', items: rowItems('all'), empty: 'No games here.' },
      { id: 'recent', name: 'Recents', items: rowItems('recent'), empty: 'Games you play show up here.' },
      { id: 'favorites', name: 'Favorites', items: rowItems('favorites'), empty: 'Press Y on a game to make it a favorite.' },
      ...playlists.map((p) => ({ id: `playlist:${p.id}`, name: p.name, items: p.items, empty: 'Press X on a game to put it in this playlist.' }))
    ]
    const current = lists.find((list) => list.id === selected) ?? lists[0]
    const label = TAB_LIST.find((t) => t.id === screen)?.label ?? screen
    const select = (id: string): void => {
      if (id === selected) return
      setSelected(id)
      remember((saved) => {
        saved.lists[screen] = id
      })
    }
    const title = `${open ? '' : `${label} · `}${current.name} (${current.items.length})`
    const memoryKey = `side-grid:${screen}:${current.id}`
    return (
      <div className={`page side-layout${open ? '' : ' closed'}`}>
        <NavBar active={screen} onNavigate={onNavigate} />
        <SideBar title={label} lists={lists} all={rowItems('all')} selected={current.id} open={open} onSelect={select} />
        <div className="page-viewport">
          {/* Keyed by list, so a new list starts at its top. */}
          {/* B goes back to the list in the bar, or (bar hidden) Home as on any tab. */}
          <SideGrid key={current.id} backTo={open ? `#${sideListId(current.id)}` : undefined}>
            {current.items.length === 0 ? (
              <>
                <h2 className="section-label display">{title}</h2>
                <p className="empty-note">{current.empty}</p>
              </>
            ) : tab?.layout === 'grid' ? (
              <CollectionGrid title={title} items={current.items} logos={logos} memoryKey={memoryKey} hasDefault />
            ) : (
              <PosterGrid title={title} items={current.items} logos={logos} memoryKey={memoryKey} hasDefault />
            )}
          </SideGrid>
        </div>
      </div>
    )
  }

  const firstFilled = rows?.find((row) => row.items.length)?.id

  return (
    <div className="page">
      <NavBar active={screen} onNavigate={onNavigate} />
      <div className="page-viewport">
        <div className="page-scroll" {...scroll}>
          <div className={`collection-rows ${tab?.layout ?? 'rows'}`}>
            {rows?.length === 0 && <p className="empty-note">{empty}</p>}
            {rows?.map((row) => (
              <div key={row.id}>
                {row.items.length && (row.id === 'recent' ? tab?.recentsLayout : tab?.layout) === 'grid' ? (
                  <CollectionGrid
                    title={titleWithCount(row)}
                    items={row.items}
                    logos={logos}
                    memoryKey={`collection:${row.id}`}
                    hasDefault={row.id === firstFilled}
                    note={notInstalledNote(row.notInstalled) ?? row.hint}
                  />
                ) : row.items.length ? (
                  <CardRow
                    title={titleWithCount(row)}
                    items={row.items}
                    logos={logos}
                    memoryKey={`collection:${row.id}`}
                    hasDefault={row.id === firstFilled}
                    note={notInstalledNote(row.notInstalled) ?? row.hint}
                  />
                ) : (
                  <>
                    <h2 className="section-label display">{titleWithCount(row)}</h2>
                    <p className="empty-note">No games here.</p>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** The bar's list as a grid, scrolling on its own under the fixed bar. B goes back to its list in the bar. */
function SideGrid({ backTo, children }: { backTo?: string; children: ReactNode }) {
  const scroll = usePageScroll()
  return (
    <div className="page-scroll" {...scroll}>
      <div className="side-grid" {...(backTo ? { 'data-back-focus': backTo } : {})} data-nav-scope="">
        {children}
      </div>
    </div>
  )
}
