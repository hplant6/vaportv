import { WatchCard } from './ContinueWatching'
import type { RecentItem } from '../../../shared/types'
import { startLaunch } from '../launch'
import { CardFooter, RecentCard } from './RecentCard'

/** One collection as a grid of wide (header art) cards, four across. The selected card
    slides the carousel cards' footer (logo, title, last played, time played) up over the
    bottom of its art. */
export function CollectionGrid({
  title,
  items,
  logos,
  note,
  memoryKey,
  hasDefault
}: {
  title: string
  items: RecentItem[]
  logos: Record<string, string>
  note?: string | null
  memoryKey: string
  hasDefault: boolean
}) {
  return (
    <section className="collection-grid">
      <h2 className="section-label display">
        {title}
        {note && <span className="row-note">{note}</span>}
      </h2>
      <div className="wide-grid" data-focus-memory={memoryKey}>
        {items.map((item, index) =>
          // A film, show or episode in a playlist: its own wide card, which plays it.
          item.media ? (
            <WatchCard key={item.id} item={item.media} isDefault={hasDefault && index === 0} />
          ) : (
          <button
            key={item.id}
            className="wide-card"
            tabIndex={-1}
            data-focusable=""
            data-item-id={item.id}
            {...(hasDefault && index === 0 ? { 'data-focus-default': '' } : {})}
            aria-label={item.title}
            onClick={() => startLaunch('recent', item.id, item.title, `Can't launch ${item.title}`)}
          >
            <span className="wide-card-art">
              {item.favorite && <span className="favorite-star" aria-label="Favourite">★</span>}
              {item.wide ? (
                <img src={item.wide} alt="" />
              ) : item.cover ? (
                // No wide art: the poster, centred over a blurred copy of itself.
                <>
                  <img className="wide-card-backdrop" src={item.cover} alt="" />
                  <img className="wide-card-poster" src={item.cover} alt="" />
                </>
              ) : (
                <span className="wide-card-title display">
                  <span className="no-art-band">{item.title}</span>
                </span>
              )}
              <CardFooter item={item} logo={logos[item.id] ?? logos[item.platform]} className="wide-card-bar" />
            </span>
          </button>
          )
        )}
      </div>
    </section>
  )
}

/** One collection as a grid of the carousels' portrait cards, as many across as fit (a tab with a left bar, laid out as rows). */
export function PosterGrid({
  title,
  items,
  logos,
  memoryKey,
  hasDefault
}: {
  title: string
  items: RecentItem[]
  logos: Record<string, string>
  memoryKey: string
  hasDefault: boolean
}) {
  return (
    <section className="collection-grid">
      <h2 className="section-label display">{title}</h2>
      <div className="poster-grid" data-focus-memory={memoryKey}>
        {items.map((item, index) => (
          <RecentCard key={item.id} item={item} logo={logos[item.id] ?? logos[item.platform]} isDefault={hasDefault && index === 0} />
        ))}
      </div>
    </section>
  )
}
