import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { SIDE_GRID_CARDS, SLIDE_MS } from '../components/SideBar'
import { flip, snapshot, type Snapshot } from '../flip'
import { focus, SIDE_BAR_EVENT } from '../input/focus'
import { play } from '../input/sounds'
import { usePageScroll } from './usePageScroll'

// What a left-bar tab (a console's, Media) shares: the bar remembered per tab, L2 hiding it
// with the grid's cards gliding to their new places, and the grid scrolling on its own.

// What the left bar remembers per tab (this TV only): whether it's hidden, the list last
// shown, and the sort. Losing it (a cleared profile) just means the bar's open on its first list.
const STORE = 'vaportv.sideBar'

export interface Remembered {
  hidden: string[]
  lists: Record<string, string>
  sorts: Record<string, string>
  /** Per tab: the switches under Sort (Media's Show unwatched only). */
  filters: Record<string, string[]>
}

export function remembered(): Remembered {
  const record = (value: unknown) => (value && typeof value === 'object' ? (value as Record<string, never>) : {})
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) ?? '{}')
    return { hidden: Array.isArray(saved.hidden) ? saved.hidden : [], lists: record(saved.lists), sorts: record(saved.sorts), filters: record(saved.filters) }
  } catch {
    return { hidden: [], lists: {}, sorts: {}, filters: {} }
  }
}

export function remember(edit: (saved: Remembered) => void): void {
  try {
    const saved = remembered()
    edit(saved)
    localStorage.setItem(STORE, JSON.stringify(saved))
  } catch {
    // Not kept; the bar works the same this time.
  }
}

/**
 * Whether `screen`'s bar is open, remembered. L2 (SIDE_BAR_EVENT) hides it or brings it back;
 * the cursor leaves it first if it's there, and the grid's cards glide to their new places
 * (more across without the bar, larger beside it).
 */
export function useSideBarOpen(screen: string, enabled = true): boolean {
  const [open, setOpen] = useState(() => !remembered().hidden.includes(screen))
  const moving = useRef<Snapshot | null>(null)
  useLayoutEffect(() => {
    if (!moving.current) return
    flip(moving.current, SLIDE_MS + 120, 'cubic-bezier(0.2, 0.8, 0.2, 1)')
    moving.current = null
  }, [open])
  useEffect(() => {
    if (!enabled) return
    const toggle = (): void => {
      moving.current = snapshot('.side-grid [data-focusable], .side-grid .section-label')
      const inBar = !!document.activeElement?.closest('.side-bar')
      setOpen((was) => {
        remember((saved) => {
          saved.hidden = saved.hidden.filter((t) => t !== screen)
          if (was) saved.hidden.push(screen)
        })
        return !was
      })
      play('move')
      if (inBar) {
        const card = document.querySelector<HTMLElement>(SIDE_GRID_CARDS)
        if (card) focus(card)
      }
    }
    window.addEventListener(SIDE_BAR_EVENT, toggle)
    return () => window.removeEventListener(SIDE_BAR_EVENT, toggle)
  }, [enabled, screen])
  return open
}

/** The bar's list as a grid, scrolling on its own under the fixed bar. B goes back to its list in the bar. */
export function SideGrid({ backTo, children }: { backTo?: string; children: ReactNode }) {
  const scroll = usePageScroll()
  return (
    <div className="page-scroll" {...scroll}>
      {/* Left from the first column (or B) goes to the list in the bar, level with the card or not. */}
      <div className="side-grid" {...(backTo ? { 'data-back-focus': backTo, 'data-nav-left-out': backTo } : {})} data-nav-scope="">
        {children}
      </div>
    </div>
  )
}
