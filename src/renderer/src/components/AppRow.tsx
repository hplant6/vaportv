import { useState } from 'react'
import type { AppItem } from '../../../shared/types'
import { AppTile } from './AppTile'

// Mirrors --tile-w / --focus-scale in tokens.css; the gap matches the grid's spacing.
const TILE_W = 426
const TILE_GAP = 54
const FOCUS_SCALE = 1.2
/** The Favorite Apps section's width. */
const VIEWPORT_W = 1865

/** Favorite Apps as one sideways-scrolling row. */
export function AppRow({ apps, hasDefault }: { apps: AppItem[]; hasDefault: boolean }) {
  const [offset, setOffset] = useState(0)

  // Keep the enlarged tile, not just its layout box, in view (the first one grows rightward only).
  const reveal = (index: number): void => {
    const left = index * (TILE_W + TILE_GAP)
    const grow = index === 0 ? 0 : (TILE_W * (FOCUS_SCALE - 1)) / 2
    const right = left + TILE_W + (index === 0 ? TILE_W * (FOCUS_SCALE - 1) : grow)
    setOffset((prev) => Math.max(0, Math.min(left - grow, Math.max(prev, right - VIEWPORT_W))))
  }

  return (
    <div className="favorites-track" style={{ transform: `translateX(${-offset}px)` }}>
      {apps.map((app, index) => (
        <AppTile key={app.id} app={app} isDefault={hasDefault && index === 0} onFocus={() => reveal(index)} />
      ))}
    </div>
  )
}
