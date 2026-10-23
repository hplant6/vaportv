import { useRef, useState, type PointerEvent, type MouseEvent } from 'react'
import { STAGE_W } from '../stage'

// Dragging a row sideways or a page up and down with a finger (the Steam Deck's screen) or
// a mouse. Rows and pages scroll by an offset (the controller moves it as the cursor goes);
// a drag moves the same offset. A gesture goes one way: the first few pixels decide, so a
// row and the page around it never both move. A tap still opens what's under it; a drag
// never does.

/** How far a finger moves before it's a drag rather than a tap (screen px). */
const SLOP = 8

interface Gesture {
  id: number
  x: number
  y: number
  offset: number
  /** Decided once past SLOP: this element's way, or the other (left to whatever's around it). */
  ours: boolean | null
}

/** The stage's scale on screen, so screen pixels can be turned into layout ones. */
function stageScale(el: Element): number {
  const stage = el.closest('.stage')
  return stage ? stage.getBoundingClientRect().width / STAGE_W : 1
}

/**
 * Props for a scrolling element: dragging along `axis` moves `offset` (layout px, 0 to
 * `max()`), through `setOffset`. `dragging` is true mid-drag (turn transitions off for it).
 */
export function useDrag(
  axis: 'x' | 'y',
  offset: number,
  setOffset: (offset: number) => void,
  max: () => number
): {
  dragging: boolean
  handlers: {
    onPointerDown: (e: PointerEvent<HTMLElement>) => void
    onPointerMove: (e: PointerEvent<HTMLElement>) => void
    onPointerUp: (e: PointerEvent<HTMLElement>) => void
    onPointerCancel: (e: PointerEvent<HTMLElement>) => void
    onClickCapture: (e: MouseEvent<HTMLElement>) => void
  }
} {
  const gesture = useRef<Gesture | null>(null)
  const dragged = useRef(false)
  const [dragging, setDragging] = useState(false)

  const end = (e: PointerEvent<HTMLElement>): void => {
    if (gesture.current?.id !== e.pointerId) return
    gesture.current = null
    setDragging(false)
  }

  return {
    dragging,
    handlers: {
      onPointerDown: (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return
        gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, offset, ours: null }
        dragged.current = false
      },
      onPointerMove: (e) => {
        const g = gesture.current
        if (!g || g.id !== e.pointerId || g.ours === false) return
        const dx = e.clientX - g.x
        const dy = e.clientY - g.y
        if (g.ours === null) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) < SLOP) return
          g.ours = axis === 'x' ? Math.abs(dx) > Math.abs(dy) : Math.abs(dy) >= Math.abs(dx)
          if (!g.ours) return
          try {
            e.currentTarget.setPointerCapture(e.pointerId)
          } catch {
            // A pointer the browser no longer tracks; the drag still works while it's over the element.
          }
          dragged.current = true
          setDragging(true)
        }
        const moved = (axis === 'x' ? dx : dy) / stageScale(e.currentTarget)
        setOffset(Math.max(0, Math.min(max(), g.offset - moved)))
      },
      onPointerUp: end,
      onPointerCancel: end,
      // The click that ends a drag isn't a tap.
      onClickCapture: (e) => {
        if (!dragged.current) return
        dragged.current = false
        e.preventDefault()
        e.stopPropagation()
      }
    }
  }
}
