import { useEffect, useRef, type RefObject } from 'react'

// After Codrops' "Infinite Auto-Scrolling Gallery" (OGL, demo 1): while a grid scrolls, the
// middle of the screen sinks away by the scroll's speed (going down; going up it swells
// toward you) and the cards bow along that curve, easing flat when it stops. The demo bends each plane in its vertex shader by
// sin(y / height · π) · strength; here each card is moved back by that curve at its middle
// and tipped to its slope, which reads the same at a card's size.
/** The grids' cards. */
const CARDS = '.wide-card'
/** How far back the middle of the screen goes, per px the page moves in a frame. */
const PX_PER_SPEED = 7
/** The most it goes back (or comes forward). */
const MAX_DEPTH = 320
/** How far the bend closes on its target each frame (at 60 fps), the demo's lerp. */
const LERP = 0.12
const FRAME_MS = 1000 / 60
/** The screen the curve spans (the stage is 1080 high). */
const SCREEN = 1080
/** Cards this far off screen aren't bent: no one sees them. */
const MARGIN = 250

/** Where `el` is drawn vertically right now, mid-transition included. */
function drawnY(el: HTMLElement): number {
  return new DOMMatrixReadOnly(getComputedStyle(el).transform).m42
}

/** Top of `el` within `stop`, by layout (transforms ignored). */
function layoutTop(el: HTMLElement, stop: HTMLElement): number {
  let top = 0
  for (let at: HTMLElement | null = el; at && at !== stop; at = at.offsetParent as HTMLElement | null) top += at.offsetTop
  return top
}

function unbend(card: HTMLElement): void {
  if (card.dataset.bend === undefined) return
  delete card.dataset.bend
  card.style.removeProperty('--bend-z')
  card.style.removeProperty('--bend-x')
}

/** Bends each card on screen for `depth` (px the middle goes back) where the page is now. */
function place(page: HTMLElement, depth: number): void {
  const pageY = drawnY(page)
  // Layout first, then writes, so the reads don't each force a fresh layout.
  const cards = [...page.querySelectorAll<HTMLElement>(CARDS)].map((card) => ({
    card,
    middle: layoutTop(card, page) + pageY + card.offsetHeight / 2
  }))
  for (const { card, middle } of cards) {
    if (Math.abs(depth) < 0.5 || middle < -MARGIN || middle > SCREEN + MARGIN) {
      unbend(card)
      continue
    }
    const phase = (middle / SCREEN) * Math.PI
    const z = -Math.sin(phase) * depth
    // The curve's slope there: the card tips to lie along it.
    const slope = (-Math.cos(phase) * depth * Math.PI) / SCREEN
    card.dataset.bend = ''
    card.style.setProperty('--bend-z', `${z.toFixed(1)}px`)
    card.style.setProperty('--bend-x', `${Math.atan(slope).toFixed(4)}rad`)
  }
}

/**
 * Bows a page's grid cards with its scrolling speed (see the CSS for [data-bend]). `page`
 * is moved by `translateY(-scrollY)` with a transition; this follows it each frame until
 * it's there and the bend has eased flat.
 */
export function useGridBend(ref: RefObject<HTMLElement | null>, scrollY: number): void {
  const frame = useRef(0)
  const goal = useRef(scrollY)

  useEffect(() => {
    goal.current = scrollY
    const page = ref.current
    if (!page || frame.current) return
    let last = performance.now()
    let prev = drawnY(page)
    let depth = 0
    const step = (now: number): void => {
      const frames = Math.max(now - last, 1) / FRAME_MS
      last = now
      const at = drawnY(page)
      // Px a frame the content moves up (scrolling down), negative going the other way.
      const speed = (prev - at) / frames
      prev = at
      const target = Math.max(-MAX_DEPTH, Math.min(MAX_DEPTH, speed * PX_PER_SPEED))
      depth += (target - depth) * (1 - (1 - LERP) ** frames)
      // The transition may not have started on the first frame, so stop only once it's there.
      if (Math.abs(at + goal.current) < 0.5 && Math.abs(depth) < 0.5) {
        place(page, 0)
        frame.current = 0
        return
      }
      place(page, depth)
      frame.current = requestAnimationFrame(step)
    }
    frame.current = requestAnimationFrame(step)
  }, [ref, scrollY])

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current)
      frame.current = 0
    },
    []
  )
}
