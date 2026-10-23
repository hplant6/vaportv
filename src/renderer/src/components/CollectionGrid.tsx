import type { RecentItem } from '../../../shared/types'
import { startLaunch } from '../launch'

/** One collection as a grid of wide (header art) cards, four across. */
export function CollectionGrid({
  title,
  items,
  note,
  memoryKey,
  hasDefault
}: {
  title: string
  items: RecentItem[]
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
        {items.map((item, index) => (
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
          </button>
        ))}
      </div>
    </section>
  )
}
