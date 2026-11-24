import { useRef, useState } from 'react'
import type { MediaItem } from '../../../shared/types'
import { useDrag } from '../input/drag'
import { useScrollTilt } from '../scrollTilt'
import { WatchCard } from './ContinueWatching'
import { MediaPoster } from './MediaPoster'

// The Video tab's carousels: a titled row of films, shows and episodes, as wide stills (Continue
// watching, Next up) or posters. Beside the left bar, as wide as its own box. A library's row asks
// for more as the cursor nears its end, so the whole library can be reached along it.

// Mirror --card-w (posters) and the wide cards' width, --card-gap and --focus-scale in the CSS.
const POSTER_W = 253.56
const WIDE_W = 426
const CARD_GAP = 36
const FOCUS_SCALE = 1.2
/** More is asked for this many cards from the end. */
const NEAR_END = 6

interface Props {
  title: string
  items: MediaItem[]
  /** Stills rather than posters. */
  wide: boolean
  memoryKey: string
  hasDefault: boolean
  className?: string
  /** A card's been focused (a Spotlight shows it). */
  onItemFocus?: (item: MediaItem) => void
  /** The cursor's near the end of what's loaded: a library's next page. */
  onNearEnd?: () => void
}

export function MediaRow({ title, items, wide, memoryKey, hasDefault, className = '', onItemFocus, onNearEnd }: Props) {
  const [offset, setOffset] = useState(0)
  const track = useRef<HTMLDivElement>(null)
  const cardW = wide ? WIDE_W : POSTER_W
  const viewportW = (): number => track.current?.parentElement?.clientWidth ?? 1380
  const drag = useDrag('x', offset, setOffset, () => Math.max(0, (track.current?.scrollWidth ?? 0) - viewportW()))
  useScrollTilt(track, 'x', offset, '--row-tilt')

  const reveal = (index: number): void => {
    const left = index * (cardW + CARD_GAP)
    const grow = (cardW * (FOCUS_SCALE - 1)) / 2
    setOffset((prev) => Math.max(0, Math.min(left - grow, Math.max(prev, left + cardW + grow - viewportW()))))
    if (onNearEnd && index >= items.length - NEAR_END) onNearEnd()
  }

  return (
    <section className={`card-row media-row${wide ? ' watch-row' : ''} ${className}`}>
      <h2 className="section-label display">{title}</h2>
      <div
        ref={track}
        className={`recents-track${drag.dragging ? ' dragging' : ''}`}
        data-focus-memory={memoryKey}
        style={{ transform: `translateX(${-offset}px)` }}
        {...drag.handlers}
      >
        {items.map((item, index) => {
          const onFocus = (): void => {
            reveal(index)
            onItemFocus?.(item)
          }
          return wide ? (
            <WatchCard key={`${item.source}:${item.id}`} item={item} isDefault={hasDefault && index === 0} onFocus={onFocus} />
          ) : (
            <MediaPoster key={`${item.source}:${item.id}`} item={item} index={index} isDefault={hasDefault && index === 0} onFocus={onFocus} />
          )
        })}
      </div>
    </section>
  )
}
