import type { MediaItem } from '../../../shared/types'
import { MEDIA_PLAY_EVENT } from './ContinueWatching'
import { toast } from './Toast'

/** A show opens its seasons (MediaShow listens: detail is { source, id, title }). */
export const MEDIA_SHOW_EVENT = 'steamtv:media-show'

/** 52m, 1h 52m. */
function runtime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  return hours ? `${hours}h${minutes % 60 ? ` ${minutes % 60}m` : ''}` : `${minutes}m`
}

/**
 * A film or show as a poster, as the console tabs' game cards: the poster (or a still over a
 * blur of itself, or the title on the dark fade), a tick once watched, a show's unwatched
 * count, a gold line when part-watched, and its name and year in the footer. A plays a film or
 * episode from where it was left; a show opens its seasons.
 *
 * `barOnHold` (the Video tab's grid): only the poster, as Steam's grid shows only the art; its
 * bar (name, length or year, and the critics' score) slides up over it once the cursor has
 * rested on it a moment. The part-watched line stays in sight, over the bar.
 */
export function MediaPoster({
  item,
  index,
  isDefault,
  onFocus,
  barOnHold = false
}: {
  item: MediaItem
  index?: number
  isDefault?: boolean
  onFocus?: () => void
  barOnHold?: boolean
}) {
  const open = (): void => {
    if (item.kind === 'series') {
      if (
        !window.dispatchEvent(
          new CustomEvent(MEDIA_SHOW_EVENT, {
            detail: { source: item.source, id: item.id, title: item.title },
            cancelable: true
          })
        )
      )
        return
      // Nothing took it: not on the Media tab.
      toast(`Open ${item.title} from the Video tab`)
      return
    }
    window.dispatchEvent(
      new CustomEvent(MEDIA_PLAY_EVENT, {
        detail: { source: item.source, id: item.id }
      })
    )
  }
  return (
    <button
      className={`recent-card media-poster${barOnHold ? ' bar-on-hold' : ''}`}
      tabIndex={-1}
      data-focusable=""
      data-select-sound="move"
      data-item-id={item.id}
      data-media-source={item.source}
      data-index={index}
      {...(isDefault ? { 'data-focus-default': '' } : {})}
      aria-label={`${item.title}${item.subtitle ? `, ${item.subtitle}` : ''}${item.watched ? ', watched' : ''}`}
      onClick={open}
      onFocus={onFocus}
    >
      <div className="recent-art">
        {item.favorite && (
          <span className="favorite-star media-star" aria-label="Favourite">
            ★
          </span>
        )}
        {item.cover ? (
          // Lazy: a library's grid can run to thousands; the server's pictures come as they near the screen.
          <img src={item.cover} alt="" loading="lazy" />
        ) : item.wide ? (
          <>
            <img className="recent-art-backdrop" src={item.wide} alt="" />
            <img className="recent-art-centred" src={item.wide} alt="" />
          </>
        ) : (
          <span className="recent-no-art display">
            <span className="no-art-band">{item.title}</span>
          </span>
        )}
        {item.watched && (
          <span className="media-badge media-watched" aria-hidden="true">
            ✓
          </span>
        )}
        {!item.watched && item.unwatched !== undefined && item.unwatched > 0 && (
          <span className="media-badge media-unwatched" aria-hidden="true">
            {item.unwatched}
          </span>
        )}
        {item.progress > 0 && !item.watched && (
          <span className="watch-progress">
            <span className="watch-progress-fill" style={{ width: `${Math.round(item.progress * 100)}%` }} />
          </span>
        )}
        {barOnHold && <PosterBar item={item} />}
      </div>
      {!barOnHold && (
        <div className="recent-footer">
          <div className="recent-text">
            <div className="recent-title">{item.title}</div>
            <div className="recent-date">{item.subtitle}</div>
          </div>
        </div>
      )}
    </button>
  )
}

/**
 * The bar that slides up over a poster in the Video tab's grid: its name, then its length (a
 * show's year, as it has no one length) and the critics' score, else the community rating.
 */
function PosterBar({ item }: { item: MediaItem }) {
  const length = item.kind !== 'series' && item.runtimeMinutes ? runtime(item.runtimeMinutes) : item.subtitle
  return (
    <div className="recent-footer poster-bar">
      <div className="recent-text">
        <div className="recent-title">{item.title}</div>
        <div className="recent-date">
          {length}
          {item.criticRating !== undefined ? (
            <span className="poster-bar-score">Rotten Tomatoes {Math.round(item.criticRating)}%</span>
          ) : item.rating ? (
            <span className="poster-bar-score" aria-label={`Rated ${item.rating.toFixed(1)} out of 10`}>
              ★ {item.rating.toFixed(1)}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
