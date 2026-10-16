import { useState } from 'react'
import type { RecentItem } from '../../../shared/types'
import { RecentCard } from './RecentCard'

// Mirrors --card-w / --card-gap / --focus-scale in tokens.css.
const CARD_W = 253.56
const CARD_GAP = 36
const FOCUS_SCALE = 1.2
/** Stage width minus the 30px inset on each side. */
const VIEWPORT_W = 1860

interface Props {
  title: string
  items: RecentItem[]
  logos: Record<string, string>
  /** Focus memory group, so returning to the row lands on the card you left. */
  memoryKey: string
  /** Whether the row's first card is where focus starts on the screen. */
  hasDefault: boolean
  /** Small text beside the title. */
  note?: string | null
  className?: string
}

/** A titled, horizontally scrolling row of game cards (Recents, Steam collections). */
export function CardRow({ title, items, logos, memoryKey, hasDefault, note, className = '' }: Props) {
  const [offset, setOffset] = useState(0)

  const reveal = (index: number): void => {
    const left = index * (CARD_W + CARD_GAP)
    const width = CARD_W
    // Keep the enlarged card, not just its layout box, inside the viewport.
    const grow = (width * (FOCUS_SCALE - 1)) / 2
    setOffset((prev) => Math.max(0, Math.min(left - grow, Math.max(prev, left + width + grow - VIEWPORT_W))))
  }

  return (
    <section className={`card-row ${className}`}>
      <h2 className="section-label display">
        {title}
        {note && <span className="row-note">{note}</span>}
      </h2>
      <div className="recents-track" data-focus-memory={memoryKey} style={{ transform: `translateX(${-offset}px)` }}>
        {items.map((item, index) => (
          <RecentCard
            key={item.id}
            item={item}
            logo={logos[item.platform]}
            isDefault={hasDefault && index === 0}
            onFocus={() => reveal(index)}
          />
        ))}
      </div>
    </section>
  )
}
