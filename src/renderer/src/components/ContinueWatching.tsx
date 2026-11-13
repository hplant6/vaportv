import { useEffect, useRef, useState } from 'react'
import type { MediaItem } from '../../../shared/types'
import { useDrag } from '../input/drag'
import { useScrollTilt } from '../scrollTilt'
import { HOME_CHANGED_EVENT } from '../screens/Settings'

// Home's Continue watching: the films and episodes part-watched on every media server signed
// in to (Emby, Jellyfin), merged newest first, as wide cards with how far in they are. A plays
// one in vaporTV's own player (MediaPlayer), from where it was left. Not there at all until a
// server's signed in to in Settings, nor while none can be reached or nothing's part-watched.

/** MediaPlayer listens: detail is { source, id } (the account and the item). */
export const MEDIA_PLAY_EVENT = 'steamtv:media-play'
/** The player closed: the row asks again (what was just watched moves to the front). */
export const MEDIA_WATCHED_EVENT = 'steamtv:media-watched'

const CARD_W = 426
const CARD_GAP = 36
const FOCUS_SCALE = 1.2
const VIEWPORT_W = 1848

export function ContinueWatching() {
  const [items, setItems] = useState<MediaItem[]>([])
  const [offset, setOffset] = useState(0)
  const track = useRef<HTMLDivElement>(null)
  const drag = useDrag('x', offset, setOffset, () => Math.max(0, (track.current?.scrollWidth ?? 0) - VIEWPORT_W))
  useScrollTilt(track, 'x', offset, '--row-tilt')

  // Asked on opening Home, coming back to vaporTV, after watching, and after signing in or out.
  useEffect(() => {
    const load = (): void => {
      window.steamtv.media
        .resume()
        .then(setItems)
        .catch(() => setItems([]))
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

  if (!items.length) return null

  const reveal = (index: number): void => {
    const left = index * (CARD_W + CARD_GAP)
    const grow = (CARD_W * (FOCUS_SCALE - 1)) / 2
    setOffset((prev) => Math.max(0, Math.min(left - grow, Math.max(prev, left + CARD_W + grow - VIEWPORT_W))))
  }

  return (
    <section className="card-row watch-row">
      <h2 className="section-label display">Continue watching</h2>
      <div
        ref={track}
        className={`recents-track${drag.dragging ? ' dragging' : ''}`}
        data-focus-memory="continue-watching"
        style={{ transform: `translateX(${-offset}px)` }}
        {...drag.handlers}
      >
        {items.map((item, index) => (
          <WatchCard key={`${item.source}:${item.id}`} item={item} onFocus={() => reveal(index)} />
        ))}
      </div>
    </section>
  )
}

/**
 * A film or episode as a wide card: its still, the name and how much is left over a fade at
 * the bottom, and a gold line for how far in. A plays it (MediaPlayer). Home's Continue watching
 * and the Media tab's wide lists.
 */
export function WatchCard({ item, isDefault, onFocus }: { item: MediaItem; isDefault?: boolean; onFocus?: () => void }) {
  return (
    <button
      className="wide-card watch-card"
      tabIndex={-1}
      data-focusable=""
      data-select-sound="move"
      data-item-id={item.id}
      {...(isDefault ? { 'data-focus-default': '' } : {})}
      aria-label={`${item.title}${item.subtitle ? `, ${item.subtitle}` : ''}`}
      onFocus={onFocus}
      onClick={() => window.dispatchEvent(new CustomEvent(MEDIA_PLAY_EVENT, { detail: { source: item.source, id: item.id } }))}
    >
      <span className="wide-card-art">
        {item.wide ? (
          <img src={item.wide} alt="" />
        ) : item.cover ? (
          <>
            <img className="wide-card-backdrop" src={item.cover} alt="" />
            <img className="wide-card-poster" src={item.cover} alt="" />
          </>
        ) : null}
        <span className="watch-card-info">
          <span className="watch-card-title">{item.title}</span>
          <span className="watch-card-detail">
            {[item.subtitle, item.remainingMinutes !== undefined && `${remaining(item.remainingMinutes)} left`].filter(Boolean).join(' · ')}
          </span>
        </span>
        {item.progress > 0 && (
          <span className="watch-progress">
            <span className="watch-progress-fill" style={{ width: `${Math.round(item.progress * 100)}%` }} />
          </span>
        )}
      </span>
    </button>
  )
}

/** "1h 12m", "38m". */
function remaining(minutes: number): string {
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`
}
