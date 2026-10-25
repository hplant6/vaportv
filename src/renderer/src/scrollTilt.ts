import { useEffect, useRef, type RefObject } from 'react'

// After the carousel in Codrops' "persistent page transitions" demo (bnpne): while a row
// or page scrolls, its cards lean with the speed, and ease back flat when it stops.
/** Lean per px the content moves in a frame, up to MAX_RAD (~11°, as the demo meant; its
    own 0.05 rad, ~3°, is too faint to see across a room). */
const RAD_PER_PX = 0.012
const MAX_RAD = 0.2
/** How far the lean closes on its target each frame (at 60 fps). */
const LERP = 0.14
const FRAME_MS = 1000 / 60

/** Where `el` is drawn along `axis` right now, mid-transition included. */
function drawnAt(el: HTMLElement, axis: 'x' | 'y'): number {
  const matrix = new DOMMatrixReadOnly(getComputedStyle(el).transform)
  return axis === 'x' ? matrix.m41 : matrix.m42
}

/**
 * Leans the cards of a scroller moved by `translate(-position)` (a row's track, a page):
 * while it moves, marks it data-tilt="<axis>" and writes the lean to `variable` on it
 * each frame, for its cards' CSS.
 */
export function useScrollTilt(ref: RefObject<HTMLElement | null>, axis: 'x' | 'y', position: number, variable: string): void {
  const frame = useRef(0)
  const goal = useRef(position)

  // Runs while the content is on its way to `position` or still leaning; a new position
  // mid-run just carries on toward it.
  useEffect(() => {
    goal.current = position
    const el = ref.current
    if (!el || frame.current) return
    let last = performance.now()
    let prev = drawnAt(el, axis)
    let tilt = 0
    const step = (now: number): void => {
      const frames = Math.max(now - last, 1) / FRAME_MS
      last = now
      const at = drawnAt(el, axis)
      // Content moves the other way to the position, so this is the scroll speed (px a frame).
      const speed = (prev - at) / frames
      prev = at
      const target = Math.max(-MAX_RAD, Math.min(MAX_RAD, speed * RAD_PER_PX))
      tilt += (target - tilt) * (1 - (1 - LERP) ** frames)
      // The transition may not have started on the first frame, so stop only once it's there.
      if (Math.abs(at + goal.current) < 0.5 && Math.abs(tilt) < 0.0005) {
        el.style.removeProperty(variable)
        delete el.dataset.tilt
        frame.current = 0
        return
      }
      el.dataset.tilt = axis
      el.style.setProperty(variable, `${tilt.toFixed(4)}rad`)
      frame.current = requestAnimationFrame(step)
    }
    frame.current = requestAnimationFrame(step)
  }, [ref, axis, position, variable])

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current)
      frame.current = 0
    },
    []
  )
}
