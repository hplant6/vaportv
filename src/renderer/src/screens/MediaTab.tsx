import { useEffect, useState } from 'react'
import type { MediaItem, MediaLists } from '../../../shared/types'
import { MEDIA_WATCHED_EVENT, WatchCard } from '../components/ContinueWatching'
import { MediaPoster } from '../components/MediaPoster'
import { NavBar, type Screen } from '../components/NavBar'
import { SideBar, sideListId, type SideList } from '../components/SideBar'
import { focusContentDefault } from '../input/focus'
import { HOME_CHANGED_EVENT } from './Settings'
import { remember, remembered, SideGrid, useSideBarOpen } from './sideLayout'

// The Media tab: the console tabs' left bar and grid, filled from every media server signed in
// to (Emby, Jellyfin). Its top lists come first: Continue watching and Next up as wide stills,
// Recently added and Favorites as posters. A plays a film or episode from where it was left,
// in vaporTV's player; a show opens its seasons. The bar turns the pile of VHS tapes Apps shows.

const SCREEN = 'media'

/** Sort's orders here (Favorites, and the libraries to come); the other top lists keep their own. */
export const MEDIA_SORTS: { id: MediaSort; name: string }[] = [
  { id: 'name', name: 'Name' },
  { id: 'added', name: 'Date added' },
  { id: 'released', name: 'Release date' },
  { id: 'played', name: 'Last played' },
  { id: 'rating', name: 'Rating' }
]
export type MediaSort = 'name' | 'added' | 'released' | 'played' | 'rating'

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
}

export function MediaTab({ onNavigate }: { onNavigate: (screen: Screen) => void }) {
  const [lists, setLists] = useState<MediaLists | null>(null)
  const open = useSideBarOpen(SCREEN)
  const [selected, setSelected] = useState(() => remembered().lists[SCREEN] ?? 'continue')
  const [sort, setSort] = useState<MediaSort>(() => (remembered().sorts[SCREEN] as MediaSort | undefined) ?? 'name')

  // Asked on opening, on coming back to vaporTV, after watching something, and after a sign-in.
  useEffect(() => {
    const load = (): void => {
      window.steamtv.media
        .lists()
        .then(setLists)
        .catch(() => setLists({ continueWatching: [], nextUp: [], recentlyAdded: [], favorites: [] }))
    }
    load()
    window.addEventListener('focus', load)
    window.addEventListener(MEDIA_WATCHED_EVENT, load)
    window.addEventListener(HOME_CHANGED_EVENT, load)
    return () => {
      window.removeEventListener('focus', load)
      window.removeEventListener(MEDIA_WATCHED_EVENT, load)
      window.removeEventListener(HOME_CHANGED_EVENT, load)
    }
  }, [])

  const loaded = lists !== null
  useEffect(() => {
    if (loaded) focusContentDefault()
  }, [loaded])

  const all: MediaList[] = [
    { id: 'continue', name: 'Continue watching', items: lists?.continueWatching ?? [], wide: true, empty: 'Films and episodes you’re part way through show up here.' },
    { id: 'nextup', name: 'Next up', items: lists?.nextUp ?? [], wide: true, empty: 'The next episode of each show you’re watching shows up here.' },
    { id: 'recent', name: 'Recently added', items: lists?.recentlyAdded ?? [], wide: false, empty: 'Nothing new on your servers yet.' },
    { id: 'favorites', name: 'Favorites', items: [...(lists?.favorites ?? [])].sort(COMPARE[sort]), wide: false, empty: 'Films and shows you mark as favorites show up here.' }
  ]
  const current = all.find((list) => list.id === selected) ?? all[0]
  const select = (id: string): void => {
    if (id === selected) return
    setSelected(id)
    remember((saved) => {
      saved.lists[SCREEN] = id
    })
  }
  const title = `${open ? '' : 'Media · '}${current.name} (${current.items.length})`

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
              <div className="poster-grid" data-focus-memory={`media:${current.id}`}>
                {current.items.map((item, index) => (
                  <MediaPoster key={`${item.source}:${item.id}`} item={item} isDefault={index === 0} />
                ))}
              </div>
            )}
          </section>
        </SideGrid>
      </div>
    </div>
  )
}
