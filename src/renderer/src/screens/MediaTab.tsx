import { useCallback, useEffect, useRef, useState, type FocusEvent } from 'react'
import type { MediaItem, MediaLibrary, MediaLists, MediaPage, MediaSort, PlaylistRow } from '../../../shared/types'
import { listOrder, resolveSections, type TabSection } from '../../../shared/tabSections'
import { MEDIA_CHANGED_EVENT, MEDIA_WATCHED_EVENT, WatchCard } from '../components/ContinueWatching'
import { LibraryToolbar, type ToolbarMenu } from '../components/LibraryToolbar'
import { MEDIA_SHOW_EVENT, MediaPoster } from '../components/MediaPoster'
import { MediaRow } from '../components/MediaRow'
import { MediaShowPage } from '../components/MediaShowPage'
import { MediaSpotlightSection } from '../components/MediaSpotlight'
import { NavBar, type Screen } from '../components/NavBar'
import { SideBar, sideListId, type SideList } from '../components/SideBar'
import { TabCustomize } from '../components/TabCustomize'
import { focus, focusContentDefault } from '../input/focus'
import { HOME_CHANGED_EVENT } from './Settings'
import { remember, remembered, SideGrid, useSideBarOpen } from './sideLayout'

// The Video tab, laid out as the game tabs are: its lists stacked down the page as sections, each
// in the style chosen in its Customize window (Spotlight, Carousel or a grid), filled from every
// media server signed in to (Emby, Jellyfin). The lists in two groups: what the servers give
// (Continue watching and Next up as wide stills, Recently added, Favorites, then each server's
// libraries, under Libraries), then the playlists made in vaporTV. A library comes a page at a
// time as the cursor nears the end of its row or grid, sorted and filtered by the server. The
// toolbar's Sort and Show (all, or unwatched only) apply to Favorites and the libraries. A plays
// a film or episode from where it was left, in vaporTV's player; a show opens its seasons. The
// bar turns the pile of VHS tapes Apps shows.

const SCREEN = 'media'
/** A library's titles come this many at a time; the next page is asked for two rows (of four) from the end. */
const PAGE = 60
const NEAR_END = 8
const UNWATCHED = 'unwatched'

/** Sort's orders here (Favorites and the libraries); Continue watching, Next up and Recently added keep their own. */
export const MEDIA_SORTS: { id: MediaSort; name: string }[] = [
  { id: 'name', name: 'Name' },
  { id: 'added', name: 'Date added' },
  { id: 'released', name: 'Release date' },
  { id: 'played', name: 'Last played' },
  { id: 'rating', name: 'Rating' }
]

const byName = (a: MediaItem, b: MediaItem): number => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true })
/** Biggest or newest first; those without one after, by name. */
const descending =
  (value: (item: MediaItem) => string | number | undefined) =>
  (a: MediaItem, b: MediaItem): number => {
    const [x, y] = [value(a), value(b)]
    if (x === undefined || y === undefined) return x === y ? byName(a, b) : x === undefined ? 1 : -1
    return x < y ? 1 : x > y ? -1 : byName(a, b)
  }
const COMPARE: Record<MediaSort, (a: MediaItem, b: MediaItem) => number> = {
  name: byName,
  added: descending((i) => i.added),
  released: descending((i) => i.released),
  played: descending((i) => i.lastPlayed),
  rating: descending((i) => i.rating)
}

interface MediaList extends SideList<MediaItem> {
  /** Stills (part-watched, next episodes) or posters. */
  wide: boolean
  /** A library: its pages come as the cursor nears the end. */
  library?: MediaLibrary
}

const libraryListId = (lib: MediaLibrary): string => `lib:${lib.source}:${lib.id}`

/** A section's element id, for the bar to jump to. */
const sectionId = (listId: string): string => `section-${listId.replace(/[^A-Za-z0-9_-]/g, '_')}`

/** The toolbar's Show: everything, or only what's not been watched. */
const SHOW_OPTIONS = [
  { id: 'all', name: 'All' },
  { id: UNWATCHED, name: 'Unwatched only' }
]

export function MediaTab({ onNavigate }: { onNavigate: (screen: Screen) => void }) {
  const [lists, setLists] = useState<MediaLists | null>(null)
  const [libraries, setLibraries] = useState<MediaLibrary[]>([])
  // Playlists set to show here (Settings → Home → a playlist → Show on), their films and episodes.
  const [playlists, setPlaylists] = useState<PlaylistRow[]>([])
  const open = useSideBarOpen(SCREEN)
  const [selected, setSelected] = useState(() => remembered().lists[SCREEN] ?? 'continue')
  const [sort, setSort] = useState<MediaSort>(() => (remembered().sorts[SCREEN] as MediaSort | undefined) ?? 'name')
  const [unwatched, setUnwatched] = useState(() => (remembered().filters[SCREEN] ?? []).includes(UNWATCHED))
  /** The tab's sections as saved in Customize (undefined: never changed). */
  const [savedSections, setSavedSections] = useState<TabSection[] | undefined>(undefined)
  const [customizing, setCustomizing] = useState(false)
  /** The bar's cursor on a list: the page scrolls to its section. */
  const [jump, setJump] = useState<{ id: string; n: number } | undefined>(undefined)
  /** What the cursor's on (or was last on) in a Spotlight section, and which section. */
  const [spot, setSpot] = useState<{ section: string; item: MediaItem } | null>(null)
  useEffect(() => {
    window.steamtv.tabSections.get(SCREEN).then(setSavedSections)
  }, [])

  // Asked on opening, on coming back to vaporTV, after watching something, and after a sign-in.
  useEffect(() => {
    const load = (): void => {
      window.steamtv.media
        .lists()
        .then(setLists)
        .catch(() => setLists({ continueWatching: [], nextUp: [], recentlyAdded: [], favorites: [] }))
    }
    const loadPlaylists = (): void => {
      window.steamtv.gamePlaylists
        .forTab('media')
        .then(setPlaylists)
        .catch(() => setPlaylists([]))
    }
    const loadLibraries = (): void => {
      window.steamtv.media
        .libraries()
        .then(setLibraries)
        .catch(() => setLibraries([]))
    }
    load()
    loadLibraries()
    loadPlaylists()
    // A sign-in, or a playlist changed (X on a film, Settings): the lot again.
    const signedIn = (): void => {
      load()
      loadLibraries()
      loadPlaylists()
    }
    window.addEventListener('focus', load)
    window.addEventListener(MEDIA_WATCHED_EVENT, load)
    window.addEventListener(HOME_CHANGED_EVENT, signedIn)
    return () => {
      window.removeEventListener('focus', load)
      window.removeEventListener(MEDIA_WATCHED_EVENT, load)
      window.removeEventListener(HOME_CHANGED_EVENT, signedIn)
    }
  }, [])

  // Each library's pages so far, for the sort and filter they were asked with; the first of each
  // is asked for at once, for the counts in the bar.
  const [pages, setPages] = useState<Record<string, MediaPage>>({})
  const asking = useRef(new Set<string>())
  const view = `${sort}:${unwatched ? 'unwatched' : 'all'}`
  const pageKey = (lib: MediaLibrary): string => `${libraryListId(lib)}:${view}`
  const loadPage = useCallback(
    (lib: MediaLibrary, start: number): void => {
      const key = `${libraryListId(lib)}:${view}`
      const ask = `${key}@${start}`
      if (asking.current.has(ask)) return
      asking.current.add(ask)
      window.steamtv.media
        .libraryPage({ source: lib.source, id: lib.id, type: lib.type }, sort, unwatched, start, PAGE)
        .then((page) =>
          setPages((prev) => ({
            ...prev,
            [key]: { items: start === 0 ? page.items : [...(prev[key]?.items ?? []), ...page.items], total: page.total }
          }))
        )
        .catch(() => asking.current.delete(ask))
    },
    [sort, unwatched, view]
  )
  useEffect(() => {
    for (const lib of libraries) if (!pages[pageKey(lib)]) loadPage(lib, 0)
  }, [libraries, loadPage])

  // A film, show or episode marked watched or favourite (its details, or Y): patched in where
  // it shows, so a library keeps its place; the top lists are asked for again.
  useEffect(() => {
    const onChanged = (event: Event): void => {
      const { source, id, patch } = (event as CustomEvent<{ source: string; id: string; patch: Partial<MediaItem> }>).detail
      const apply = (items: MediaItem[]): MediaItem[] => items.map((i) => (i.source === source && i.id === id ? { ...i, ...patch } : i))
      setPages((prev) => Object.fromEntries(Object.entries(prev).map(([k, page]) => [k, { ...page, items: apply(page.items) }])))
      setLists((prev) => prev && { continueWatching: apply(prev.continueWatching), nextUp: apply(prev.nextUp), recentlyAdded: apply(prev.recentlyAdded), favorites: apply(prev.favorites) })
      window.steamtv.media.lists().then(setLists).catch(() => undefined)
    }
    window.addEventListener(MEDIA_CHANGED_EVENT, onChanged)
    return () => window.removeEventListener(MEDIA_CHANGED_EVENT, onChanged)
  }, [])

  const loaded = lists !== null
  useEffect(() => {
    if (loaded) focusContentDefault()
  }, [loaded])

  // A on a show: its page opens over the tab; B brings the cursor back to the show's card.
  const [showing, setShowing] = useState<{ source: string; id: string; title: string } | null>(null)
  useEffect(() => {
    const open = (event: Event): void => {
      event.preventDefault()
      setShowing((event as CustomEvent<{ source: string; id: string; title: string }>).detail)
    }
    window.addEventListener(MEDIA_SHOW_EVENT, open)
    return () => window.removeEventListener(MEDIA_SHOW_EVENT, open)
  }, [])
  const closeShow = useCallback(() => {
    const was = showing
    setShowing(null)
    setTimeout(() => {
      const card = was && document.querySelector<HTMLElement>(`.side-grid [data-item-id="${was.id}"]`)
      if (card) focus(card)
    })
  }, [showing])

  const finished = (items: MediaItem[]): MediaItem[] => (unwatched ? items.filter((i) => !i.watched) : items)
  const all: MediaList[] = [
    { id: 'continue', name: 'Continue watching', items: lists?.continueWatching ?? [], wide: true, empty: 'Films and episodes you’re part way through show up here.' },
    { id: 'nextup', name: 'Next up', items: lists?.nextUp ?? [], wide: true, empty: 'The next episode of each show you’re watching shows up here.' },
    { id: 'recent', name: 'Recently added', items: lists?.recentlyAdded ?? [], wide: false, empty: 'Nothing new on your servers yet.' },
    {
      id: 'favorites',
      name: 'Favorites',
      items: finished([...(lists?.favorites ?? [])]).sort(COMPARE[sort]),
      wide: false,
      empty: unwatched ? 'You’ve watched all your favorites.' : 'Films and shows you mark as favorites show up here.'
    },
    // Each server's library (the bar heads them Libraries), then the playlists made here (Playlists).
    ...libraries.map((lib) => {
      const page = pages[pageKey(lib)]
      return {
        id: libraryListId(lib),
        name: lib.name,
        items: page?.items ?? [],
        count: page?.total,
        wide: false,
        library: lib,
        empty: !page ? 'Loading…' : unwatched ? 'You’ve watched everything here.' : 'Nothing in this library yet.'
      }
    }),
    ...playlists.map((p) => ({
      id: `playlist:${p.id}`,
      name: p.name,
      // Its films, shows and episodes in the order you put them (a game in it shows on Home, not here).
      items: p.items.flatMap((item) => (item.media ? [item.media] : [])),
      wide: false,
      empty: 'Press X on a film, show or episode to put it in this playlist.'
    }))
  ]
  const sections = resolveSections(
    all.map((list) => list.id),
    savedSections,
    'rows'
  )
  const shownSections = sections.filter((section) => !section.hidden)
  // The bar lists the sections shown, each group together: what the servers give (the libraries
  // under Libraries), then the playlists made here, under Playlists.
  const barLists: MediaList[] = listOrder(shownSections).map((section) => all.find((list) => list.id === section.id)!)
  const firstLibrary = barLists.findIndex((list) => list.library)
  if (firstLibrary >= 0) barLists[firstLibrary] = { ...barLists[firstLibrary], section: 'Libraries' }
  const firstPlaylist = barLists.findIndex((list) => list.id.startsWith('playlist:'))
  if (firstPlaylist >= 0) barLists[firstPlaylist] = { ...barLists[firstPlaylist], section: 'Playlists' }
  const current = barLists.find((list) => list.id === selected) ?? barLists[0]
  const select = (id: string): void => {
    if (id === selected) return
    setSelected(id)
    remember((saved) => {
      saved.lists[SCREEN] = id
    })
  }
  const countOf = (list: MediaList): number => list.count ?? list.items.length
  // Near the end of what's loaded of a library: the next page.
  const more = (list: MediaList) => (): void => {
    if (list.library && list.items.length < countOf(list)) loadPage(list.library, list.items.length)
  }
  const onGridFocus =
    (list: MediaList) =>
    (event: FocusEvent<HTMLDivElement>): void => {
      const index = Number((event.target as HTMLElement).dataset.index)
      if (!Number.isNaN(index) && index >= list.items.length - NEAR_END) more(list)()
    }

  const menus: ToolbarMenu[] = [
    {
      id: 'sort',
      label: 'Sort by',
      value: sort,
      options: MEDIA_SORTS,
      onPick: (next) => {
        setSort(next as MediaSort)
        remember((saved) => {
          saved.sorts[SCREEN] = next
        })
      }
    },
    {
      id: 'show',
      label: 'Show',
      value: unwatched ? UNWATCHED : 'all',
      options: SHOW_OPTIONS,
      onPick: (next) => {
        const only = next === UNWATCHED
        setUnwatched(only)
        remember((saved) => {
          saved.filters[SCREEN] = only ? [UNWATCHED] : []
        })
      }
    }
  ]

  return (
    <div className={`page side-layout stacked${open ? '' : ' closed'}`}>
      <NavBar active="media" onNavigate={onNavigate} />
      <SideBar
        tab={SCREEN}
        title="Video"
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
        <SideGrid backTo={open && current ? `#${sideListId(current.id)}` : undefined} jump={jump}>
          <LibraryToolbar menus={menus} />
          {!loaded ? (
            <p className="empty-note">Asking your media servers…</p>
          ) : (
            shownSections.map((section, index) => {
              const list = all.find((l) => l.id === section.id)!
              const title = `${list.name} (${countOf(list).toLocaleString()})`
              const memoryKey = `media:${list.id}:${view}`
              const isDefault = index === 0
              // The cursor in this section: the bar follows it.
              const follow = (): void => select(list.id)
              if (!list.items.length)
                return (
                  <section key={list.id} id={sectionId(list.id)} className="stack-section empty">
                    <h2 className="section-label display">{title}</h2>
                    <p className="empty-note">{list.empty}</p>
                  </section>
                )
              return (
                <div key={list.id} className={`stack-section ${section.style}`} onFocusCapture={follow}>
                  {section.style === 'spotlight' ? (
                    <MediaSpotlightSection
                      id={sectionId(list.id)}
                      title={title}
                      items={list.items}
                      wide={list.wide}
                      memoryKey={memoryKey}
                      hasDefault={isDefault}
                      onFocusItem={(item) => setSpot({ section: list.id, item })}
                      focused={spot?.section === list.id ? spot.item : null}
                      onNearEnd={more(list)}
                    />
                  ) : section.style === 'carousel' ? (
                    <div id={sectionId(list.id)}>
                      <MediaRow title={title} items={list.items} wide={list.wide} memoryKey={memoryKey} hasDefault={isDefault} onNearEnd={more(list)} />
                    </div>
                  ) : (
                    // A grid: stills for the wide lists, posters for the rest.
                    <section id={sectionId(list.id)} className="collection-grid">
                      <h2 className="section-label display">{title}</h2>
                      {list.wide ? (
                        <div className="wide-grid" data-focus-memory={memoryKey}>
                          {list.items.map((item, i) => (
                            <WatchCard key={`${item.source}:${item.id}`} item={item} isDefault={isDefault && i === 0} barOnHold />
                          ))}
                        </div>
                      ) : (
                        <div className="poster-grid" data-focus-memory={memoryKey} onFocus={onGridFocus(list)}>
                          {list.items.map((item, i) => (
                            <MediaPoster key={`${item.source}:${item.id}`} item={item} index={i} isDefault={isDefault && i === 0} barOnHold />
                          ))}
                        </div>
                      )}
                    </section>
                  )}
                </div>
              )
            })
          )}
        </SideGrid>
      </div>
      {customizing && (
        <TabCustomize
          tab={SCREEN}
          label="Video"
          lists={all}
          sections={sections}
          onSections={(next) => {
            setSavedSections(next)
            void window.steamtv.tabSections.set(SCREEN, next)
          }}
          onPlaylistsChanged={() =>
            window.steamtv.gamePlaylists
              .forTab(SCREEN)
              .then(setPlaylists)
              .catch(() => undefined)
          }
          onClose={() => setCustomizing(false)}
        />
      )}
      {showing && <MediaShowPage source={showing.source} id={showing.id} title={showing.title} onBack={closeShow} />}
    </div>
  )
}
