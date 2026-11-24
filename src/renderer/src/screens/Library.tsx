import { useEffect, useState } from 'react'
import { LIBRARY_SORTS, sortItems, type LibrarySort } from '../../../shared/librarySort'
import { listOrder, resolveSections, type TabSection } from '../../../shared/tabSections'
import { hasSideBar, TAB_LIST } from '../../../shared/tabs'
import type { CollectionRow, LibraryTab, PlaylistRow, RecentItem } from '../../../shared/types'
import { CardRow } from '../components/CardRow'
import { CollectionGrid, PosterGrid } from '../components/CollectionGrid'
import { NavBar, type Screen } from '../components/NavBar'
import { SideBar, sideListId, type SideList } from '../components/SideBar'
import { SpotlightBackdrop, SpotlightSection } from '../components/Spotlight'
import { LibraryToolbar, type ToolbarMenu } from '../components/LibraryToolbar'
import { TabCustomize } from '../components/TabCustomize'
import { toast } from '../components/Toast'
import { FAVORITE_EVENT, focusContentDefault } from '../input/focus'
import { play } from '../input/sounds'
import { HOME_CHANGED_EVENT } from './Settings'
import { remember, remembered, SideGrid, useSideBarOpen } from './sideLayout'
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

/** The toolbar's Genre when it shows every game. */
const ALL_GENRES = 'all'

/** A section's element id, for the bar to jump to. */
function sectionId(listId: string): string {
  return `section-${listId.replace(/[^A-Za-z0-9_-]/g, '_')}`
}

function notInstalledNote(count: number): string | null {
  return count ? `${count} more not installed` : null
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
  const open = useSideBarOpen(screen, bar)
  const [selected, setSelected] = useState(() => remembered().lists[screen] ?? 'all')
  const [sort, setSort] = useState<LibrarySort>(() => (remembered().sorts[screen] as LibrarySort | undefined) ?? 'title')
  /** The card the cursor's on in a Spotlight section, and which section. */
  const [spot, setSpot] = useState<{ section: string; item: RecentItem } | null>(null)
  /** The cursor's been in a section that isn't a Spotlight: the first section's picture no longer stands in. */
  const [leftSpotlight, setLeftSpotlight] = useState(false)
  const [genre, setGenre] = useState(() => remembered().genres[screen] ?? ALL_GENRES)
  /** The tab's sections as saved (undefined: never changed, so from its old layout). */
  const [savedSections, setSavedSections] = useState<TabSection[] | undefined>(undefined)
  const [customizing, setCustomizing] = useState(false)
  /** The bar's cursor on a list: the page scrolls to its section. */
  const [jump, setJump] = useState<{ id: string; n: number } | undefined>(undefined)

  useEffect(() => {
    if (bar) window.steamtv.tabSections.get(screen).then(setSavedSections)
  }, [bar, screen])

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

  // On first load only; art reloads keep focus where it is.
  const loaded = tab !== null
  useEffect(() => {
    if (loaded) focusContentDefault()
  }, [loaded])

  const rows = tab?.rows

  if (bar && rows?.length) {
    const rowItems = (id: string) => rows.find((row) => row.id === id)?.items ?? []
    // The toolbar's Genre: only that genre's games, in every list.
    const inGenre = (items: RecentItem[]): RecentItem[] => (genre === ALL_GENRES ? items : items.filter((item) => item.genre === genre))
    // Every list in the sort chosen, but Recents: that's in the order played, by definition.
    const sorted = (items: RecentItem[]) => sortItems(inGenre(items), sort)
    const lists: SideList[] = [
      { id: 'all', name: 'All games', items: sorted(rowItems('all')), empty: 'No games here.' },
      { id: 'recent', name: 'Recents', items: inGenre(rowItems('recent')), empty: 'Games you play show up here.' },
      { id: 'favorites', name: 'Favorites', items: sorted(rowItems('favorites')), empty: 'Press Y on a game to make it a favorite.' },
      ...playlists.map((p) => ({
        id: `playlist:${p.id}`,
        name: p.name,
        items: sorted(p.items),
        empty: 'Press X on a game to put it in this playlist.'
      })),
      // Any other rows the tab has: Steam's collections chosen in Settings and its non-Steam games (under
      // Playlists, after the ones made here); Arcade's systems.
      ...rows
        .filter((row) => !['all', 'recent', 'favorites'].includes(row.id))
        .map((row) => ({ id: `row:${row.id}`, name: row.name, items: sorted(row.items), empty: 'No games here.' }))
    ]
    const sections = resolveSections(
      lists.map((list) => list.id),
      savedSections,
      tab?.layout ?? 'rows'
    )
    const shownSections = sections.filter((section) => !section.hidden)
    // The bar lists the sections shown, each group together: the library (what the tab brings in
    // under a heading of its own: From Steam, Systems), then the playlists made here, under Playlists.
    const barLists: SideList[] = listOrder(shownSections).map((section) => lists.find((list) => list.id === section.id)!)
    const brought = screen === 'steam' ? 'From Steam' : screen === 'arcade' ? 'Systems' : null
    const firstBrought = barLists.findIndex((list) => list.id.startsWith('row:'))
    if (brought && firstBrought >= 0) barLists[firstBrought] = { ...barLists[firstBrought], section: brought }
    const firstPlaylist = barLists.findIndex((list) => list.id.startsWith('playlist:'))
    if (firstPlaylist >= 0) barLists[firstPlaylist] = { ...barLists[firstPlaylist], section: 'Playlists' }
    const current = barLists.find((list) => list.id === selected) ?? barLists[0]
    const label = TAB_LIST.find((t) => t.id === screen)?.label ?? screen
    const select = (id: string): void => {
      if (id === selected) return
      setSelected(id)
      remember((saved) => {
        saved.lists[screen] = id
      })
    }
    // The picture behind it all: the game the cursor's on in a Spotlight section, or (before the
    // cursor's been in one) the first section's first game, when that's a Spotlight.
    const firstSection = shownSections[0]
    const backdrop = spot
      ? spot.item
      : firstSection?.style === 'spotlight' && !leftSpotlight
        ? (lists.find((list) => list.id === firstSection.id)?.items[0] ?? null)
        : null
    const genres = [...new Set(rowItems('all').map((item) => item.genre).filter((g): g is string => !!g))].sort((a, b) => a.localeCompare(b))
    const menus: ToolbarMenu[] = [
      {
        id: 'sort',
        label: 'Sort by',
        value: sort,
        options: LIBRARY_SORTS,
        onPick: (next) => {
          setSort(next as LibrarySort)
          remember((saved) => {
            saved.sorts[screen] = next
          })
        }
      },
      ...(genres.length
        ? [
            {
              id: 'genre',
              label: 'Genre',
              value: genres.includes(genre) ? genre : ALL_GENRES,
              options: [{ id: ALL_GENRES, name: 'All' }, ...genres.map((g) => ({ id: g, name: g }))],
              onPick: (next: string) => {
                setGenre(next)
                remember((saved) => {
                  saved.genres[screen] = next
                })
              }
            }
          ]
        : [])
    ]
    return (
      <div className={`page side-layout stacked${open ? '' : ' closed'}`}>
        <SpotlightBackdrop item={backdrop} />
        <NavBar active={screen} onNavigate={onNavigate} />
        <SideBar
          tab={screen}
          // Arcade's logo follows its systems: CPS2's on CPS2's list.
          logo={screen === 'arcade' && current?.id.startsWith('row:') ? `arcade-${current.id.slice('row:'.length)}` : undefined}
          title={label}
          lists={barLists}
          selected={current?.id ?? ''}
          open={open}
          onSelect={(id) => {
            select(id)
            setJump((was) => ({ id: sectionId(id), n: (was?.n ?? 0) + 1 }))
          }}
          targetOf={(id) => `#${sectionId(id)} [data-focusable]`}
          onCustomize={() => setCustomizing(true)}
        />
        <div className="page-viewport">
          {/* B goes back to the section's list in the bar, or (bar hidden) Home as on any tab. */}
          <SideGrid backTo={open && current ? `#${sideListId(current.id)}` : undefined} jump={jump}>
            <LibraryToolbar menus={menus} />
            {shownSections.map((section, index) => {
              const list = lists.find((l) => l.id === section.id)!
              const title = `${list.name} (${list.items.length})`
              const memoryKey = `side-grid:${screen}:${list.id}`
              const isDefault = index === 0
              // The cursor in this section: the bar follows it, and the picture is this section's (or none).
              const follow = (): void => {
                select(list.id)
                if (section.style !== 'spotlight') {
                  setSpot(null)
                  setLeftSpotlight(true)
                }
              }
              if (!list.items.length)
                return (
                  <section key={list.id} id={sectionId(list.id)} className="stack-section empty">
                    <h2 className="section-label display">{title}</h2>
                    <p className="empty-note">{genre !== ALL_GENRES ? 'None in this genre.' : list.empty}</p>
                  </section>
                )
              return (
                <div key={list.id} className={`stack-section ${section.style}`} onFocusCapture={follow}>
                  {section.style === 'spotlight' ? (
                    <SpotlightSection
                      id={sectionId(list.id)}
                      title={title}
                      items={list.items}
                      logos={logos}
                      memoryKey={memoryKey}
                      hasDefault={isDefault}
                      first={index === 0}
                      onFocusItem={(item) => setSpot({ section: list.id, item })}
                      focused={spot?.section === list.id ? spot.item : null}
                    />
                  ) : (
                    <div id={sectionId(list.id)}>
                      {section.style === 'carousel' ? (
                        <CardRow title={title} items={list.items} logos={logos} memoryKey={memoryKey} hasDefault={isDefault} />
                      ) : section.style === 'wide' ? (
                        <CollectionGrid title={title} items={list.items} logos={logos} memoryKey={memoryKey} hasDefault={isDefault} />
                      ) : (
                        <PosterGrid title={title} items={list.items} logos={logos} memoryKey={memoryKey} hasDefault={isDefault} />
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </SideGrid>
        </div>
        {customizing && (
          <TabCustomize
            tab={screen}
            label={label}
            lists={lists}
            sections={sections}
            onSections={(next) => {
              setSavedSections(next)
              void window.steamtv.tabSections.set(screen, next)
            }}
            onPlaylistsChanged={() => window.steamtv.gamePlaylists.forTab(screen).then(setPlaylists)}
            onClose={() => setCustomizing(false)}
          />
        )}
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
