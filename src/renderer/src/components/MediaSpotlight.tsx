import type { MediaItem } from '../../../shared/types'
import { MediaRow } from './MediaRow'
import { SpotlightPicture } from './Spotlight'

// The Video tab's Spotlight sections, as the game tabs' are: a banner in the page showing the film,
// show or episode the cursor's on (or was last on; until then the section's first): its backdrop
// behind the banner, the section's name at the top, the title, a line of facts and its summary,
// and the section's list as one carousel along the bottom.

/** The year, what it is, how long, genres and rating, as far as the server says. */
export function mediaFacts(item: MediaItem): string[] {
  const facts: string[] = []
  if (item.kind === 'episode' && item.subtitle) facts.push(item.subtitle)
  else if (item.released) facts.push(item.released.slice(0, 4))
  if (item.kind === 'series') facts.push(item.unwatched ? `${item.unwatched} unwatched` : 'Series')
  if (item.remainingMinutes && item.progress > 0) facts.push(`${item.remainingMinutes}m left`)
  else if (item.runtimeMinutes) facts.push(item.runtimeMinutes >= 60 ? `${Math.floor(item.runtimeMinutes / 60)}h ${item.runtimeMinutes % 60}m` : `${item.runtimeMinutes}m`)
  if (item.genres?.length) facts.push(item.genres.slice(0, 2).join(', '))
  if (item.rating) facts.push(`★ ${item.rating.toFixed(1)}`)
  return facts
}

interface Props {
  id: string
  title: string
  items: MediaItem[]
  wide: boolean
  memoryKey: string
  hasDefault: boolean
  onFocusItem: (item: MediaItem) => void
  focused: MediaItem | null
  onNearEnd?: () => void
}

export function MediaSpotlightSection({ id, title, items, wide, memoryKey, hasDefault, onFocusItem, focused, onNearEnd }: Props) {
  const shown = focused && items.some((i) => i.source === focused.source && i.id === focused.id) ? focused : (items[0] ?? null)
  // A backdrop where there is one; else the poster, softened.
  const url = shown?.wide ?? shown?.cover
  return (
    <section id={id} className="spotlight">
      <SpotlightPicture url={url} soft={!shown?.wide} />
      <h2 className="section-label display spotlight-label">{title}</h2>
      {shown ? (
        <div className="spotlight-info" key={`${shown.source}:${shown.id}`}>
          <h2 className="spotlight-title display">{shown.title}</h2>
          <p className="spotlight-facts">{mediaFacts(shown).join('  ·  ')}</p>
          {shown.overview && <p className="spotlight-description">{shown.overview}</p>}
        </div>
      ) : (
        <div className="spotlight-info" />
      )}
      <MediaRow className="spotlight-row" title={title} items={items} wide={wide} memoryKey={memoryKey} hasDefault={hasDefault} onItemFocus={onFocusItem} onNearEnd={onNearEnd} />
    </section>
  )
}
