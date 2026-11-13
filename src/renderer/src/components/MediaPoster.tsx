import type { MediaItem } from '../../../shared/types'
import { MEDIA_PLAY_EVENT } from './ContinueWatching'
import { toast } from './Toast'

/** A show opens its seasons (MediaShow listens: detail is { source, id, title }). */
export const MEDIA_SHOW_EVENT = 'steamtv:media-show'

/**
 * A film or show as a poster, as the console tabs' game cards: the poster (or a still over a
 * blur of itself, or the title on the dark fade), a tick once watched, a show's unwatched
 * count, a gold line when part-watched, and its name and year in the footer. A plays a film or
 * episode from where it was left; a show opens its seasons.
 */
export function MediaPoster({ item, index, isDefault }: { item: MediaItem; index?: number; isDefault?: boolean }) {
  const open = (): void => {
    if (item.kind === 'series') {
      if (!window.dispatchEvent(new CustomEvent(MEDIA_SHOW_EVENT, { detail: { source: item.source, id: item.id, title: item.title }, cancelable: true })))
        return
      // Nothing took it (seasons aren't in yet).
      toast(`Opening shows comes in the next update`)
      return
    }
    window.dispatchEvent(new CustomEvent(MEDIA_PLAY_EVENT, { detail: { source: item.source, id: item.id } }))
  }
  return (
    <button
      className="recent-card media-poster"
      tabIndex={-1}
      data-focusable=""
      data-select-sound="move"
      data-item-id={item.id}
      data-index={index}
      {...(isDefault ? { 'data-focus-default': '' } : {})}
      aria-label={`${item.title}${item.subtitle ? `, ${item.subtitle}` : ''}${item.watched ? ', watched' : ''}`}
      onClick={open}
    >
      <div className="recent-art">
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
      </div>
      <div className="recent-footer">
        <div className="recent-text">
          <div className="recent-title">{item.title}</div>
          <div className="recent-date">{item.subtitle}</div>
        </div>
      </div>
    </button>
  )
}
