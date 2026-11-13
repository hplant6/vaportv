import { useCallback, useEffect, useRef, useState, type FocusEvent } from 'react'
import type { MediaItem, MediaLibrary, MediaLists, MediaPage, MediaSort, PlaylistRow } from '../../../shared/types'
import { MEDIA_CHANGED_EVENT, MEDIA_WATCHED_EVENT, WatchCard } from '../components/ContinueWatching'
import { MEDIA_SHOW_EVENT, MediaPoster } from '../components/MediaPoster'
import { MediaShowPage } from '../components/MediaShowPage'
import { NavBar, type Screen } from '../components/NavBar'
import { SideBar, sideListId, type SideList } from '../components/SideBar'
import { focus, focusContentDefault } from '../input/focus'
import { HOME_CHANGED_EVENT } from './Settings'
import { remember, remembered, SideGrid, useSideBarOpen } from './sideLayout'

// The Media tab: the console tabs' left bar and grid, filled from every media server signed in
// to (Emby, Jellyfin). Its top lists come first: Continue watching and Next up as wide stills,
// Recently added and Favorites as posters; then each server's libraries, a page at a time as
// the cursor nears the end, sorted and filtered by the server. A plays a film or episode from
// where it was left, in vaporTV's player; a show opens its seasons. The bar turns the pile of
// VHS tapes Apps shows.

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

export function MediaTab({ onNavigate }: { onNavigate: (screen: Screen) => void }) {
  const [lists, setLists] = useState<MediaLists | null>(null)
  const [libraries, setLibraries] = useState<MediaLibrary[]>([])
  // Playlists set to show here (Settings → Home → a playlist → Show on), their films and episodes.
  const [playlists, setPlaylists] = useState<PlaylistRow[]>([])
  const open = useSideBarOpen(SCREEN)
  const [selected, setSelected] = useState(() => remembered().lists[SCREEN] ?? 'continue')
  const [sort, setSort] = useState<MediaSort>(() => (remembered().sorts[SCREEN] as MediaSort | undefined) ?? 'name')
  const [unwatched, setUnwatched] = useState(() => (remembered().filters[SCREEN] ?? []).includes(UNWATCHED))

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
    ...playlists.map((p, i) => ({
      id: `playlist:${p.id}`,
      name: p.name,
      // Its films, shows and episodes in the order you put them (a game in it shows on Home, not here).
      items: p.items.flatMap((item) => (item.media ? [item.media] : [])),
      wide: false,
      empty: 'Press X on a film, show or episode to put it in this playlist.',
      ...(i === 0 ? { section: 'Playlists' } : {})
    })),
    ...libraries.map((lib, i) => {
      const page = pages[pageKey(lib)]
      return {
        id: libraryListId(lib),
        name: lib.name,
        items: page?.items ?? [],
        count: page?.total,
        wide: false,
        library: lib,
        empty: !page ? 'Loading…' : unwatched ? 'You’ve watched everything here.' : 'Nothing in this library yet.',
        ...(i === 0 ? { section: 'Libraries' } : {})
      }
    })
  ]
  const current = all.find((list) => list.id === selected) ?? all[0]
  const select = (id: string): void => {
    if (id === selected) return
    setSelected(id)
    remember((saved) => {
      saved.lists[SCREEN] = id
    })
  }
  const count = current.count ?? current.items.length
  const title = `${open ? '' : 'Media · '}${current.name} (${count.toLocaleString()})`

  // Near the end of what's loaded of a library: the next page.
  const onGridFocus = (event: FocusEvent<HTMLDivElement>): void => {
    const lib = current.library
    const index = Number((event.target as HTMLElement).dataset.index)
    if (!lib || Number.isNaN(index)) return
    if (index >= current.items.length - NEAR_END && current.items.length < count) loadPage(lib, current.items.length)
  }

  return (
    <div className={`page side-layout${open ? '' : ' closed'}`}>
      <NavBar active="media" onNavigate={onNavigate} />
      <SideBar
        tab={SCREEN}
        title="Media"
        lists={all}
        selected={current.id}
        open={open}
        sort={sort}
        sorts={MEDIA_SORTS}
        switches={[{ id: UNWATCHED, name: 'Show unwatched only', on: unwatched }]}
        onSwitch={() => {
          setUnwatched((was) => {
            remember((saved) => {
              saved.filters[SCREEN] = was ? [] : [UNWATCHED]
            })
            return !was
          })
        }}
        onSort={(next) => {
          setSort(next as MediaSort)
          remember((saved) => {
            saved.sorts[SCREEN] = next
          })
        }}
        onSelect={select}
      />
      <div className="page-viewport">
        {/* Keyed by list, so a new list starts at its top. */}
        <SideGrid key={current.id} backTo={open ? `#${sideListId(current.id)}` : undefined}>
          <section className="collection-grid">
            <h2 className="section-label display">{title}</h2>
            {!loaded ? (
              <p className="empty-note">Asking your media servers…</p>
            ) : current.items.length === 0 ? (
              <p className="empty-note">{current.empty}</p>
            ) : current.wide ? (
              <div className="wide-grid" data-focus-memory={`media:${current.id}`}>
                {current.items.map((item, index) => (
                  <WatchCard key={`${item.source}:${item.id}`} item={item} isDefault={index === 0} />
                ))}
              </div>
            ) : (
              <div className="poster-grid" data-focus-memory={`media:${current.id}:${view}`} onFocus={onGridFocus}>
                {current.items.map((item, index) => (
                  <MediaPoster key={`${item.source}:${item.id}`} item={item} index={index} isDefault={index === 0} />
                ))}
              </div>
            )}
          </section>
        </SideGrid>
      </div>
      {showing && <MediaShowPage source={showing.source} id={showing.id} title={showing.title} onBack={closeShow} />}
    </div>
  )
}
