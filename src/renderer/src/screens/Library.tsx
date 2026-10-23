import { useEffect, useState } from 'react'
import type { CollectionRow, LibraryTab } from '../../../shared/types'
import { CardRow } from '../components/CardRow'
import { CollectionGrid } from '../components/CollectionGrid'
import { NavBar, type Screen } from '../components/NavBar'
import { toast } from '../components/Toast'
import { FAVORITE_EVENT, focusContentDefault } from '../input/focus'
import { play } from '../input/sounds'
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

/**
 * A library tab (Steam, Switch): a section per collection, laid out as rows or a
 * grid per the Settings choice. Reloads as background art downloads arrive.
 */
export function Library({ screen, load, empty, onFavorite, logos, onNavigate }: Props) {
  const scroll = usePageScroll()
  const [tab, setTab] = useState<LibraryTab | null>(null)

  useEffect(() => {
    load().then(setTab)
    return window.steamtv.onArtUpdated(() => load().then(setTab))
  }, [load])

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
