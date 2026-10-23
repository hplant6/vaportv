import { useRef, useState } from 'react'
import type { AppItem } from '../../../shared/types'
import { AppTile } from './AppTile'
import { useDrag } from '../input/drag'

// Mirrors --tile-w / --focus-scale in tokens.css; the gap matches the grid's spacing.
const TILE_W = 426
const TILE_GAP = 54
const FOCUS_SCALE = 1.2
/** The Favorite Apps section's width. */
const VIEWPORT_W = 1865

/** Favorite Apps as one sideways-scrolling row. */
export function AppRow({ apps, hasDefault }: { apps: AppItem[]; hasDefault: boolean }) {
  const [offset, setOffset] = useState(0)
  const track = useRef<HTMLDivElement>(null)
  const drag = useDrag('x', offset, setOffset, () => Math.max(0, (track.current?.scrollWidth ?? 0) - VIEWPORT_W))

  // Keep the enlarged tile, not just its layout box, in view (the first one grows rightward only).
  const reveal = (index: number): void => {
    const left = index * (TILE_W + TILE_GAP)
    const grow = index === 0 ? 0 : (TILE_W * (FOCUS_SCALE - 1)) / 2
    const right = left + TILE_W + (index === 0 ? TILE_W * (FOCUS_SCALE - 1) : grow)
    setOffset((prev) => Math.max(0, Math.min(left - grow, Math.max(prev, right - VIEWPORT_W))))
  }

  return (
    <div
      ref={track}
      className={`favorites-track${drag.dragging ? ' dragging' : ''}`}
      style={{ transform: `translateX(${-offset}px)` }}
      {...drag.handlers}
    >
      {apps.map((app, index) => (
        <AppTile key={app.id} app={app} isDefault={hasDefault && index === 0} onFocus={() => reveal(index)} />
      ))}
    </div>
  )
}
