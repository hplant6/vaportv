import { useEffect, useRef, type RefObject } from 'react'

// After the intro grid in Codrops' "On-Scroll 3D Stack Motion Effect" demo: as a grid's
// cards scroll up toward the top bar they tip back, drift up and away by their own amount,
// and darken, as if falling into the distance; scrolling back brings them up again.
/** The grids' cards. The selected one is left out: it's kept in view anyway. */
const CARDS = '.wide-card'
/** A card's top this far down the screen is flat: just above the selected row, which
    grids keep in the middle (its top at about 430px). */
const FLAT_TOP = 420
/** How far it travels from there to having fallen all the way: a little past the top. */
const FALL_PX = 520
const FRAME_MS = 1000 / 60

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

/** A fixed 0–1 for card `index` and `salt`, so each card falls its own way every time. */
function scatter(index: number, salt: number): number {
  const x = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

/** Sets each card's fall for where the page is drawn now. */
function place(page: HTMLElement): void {
  const pageY = drawnY(page)
  page.querySelectorAll<HTMLElement>(CARDS).forEach((card, index) => {
    const top = layoutTop(card, page) + pageY
    const progress = Math.max(0, Math.min(1, (FLAT_TOP - top) / FALL_PX))
    // The demo's power1.in: slow to start, so cards just reaching the bar barely move.
    const fall = progress * progress
    if (fall < 0.001 || card === document.activeElement) {
      if (card.dataset.fall === undefined) return
      delete card.dataset.fall
      card.style.removeProperty('--fall')
      return
    }
    if (card.dataset.fall === undefined) {
      card.dataset.fall = ''
      card.style.setProperty('--fall-y', `${(-100 * scatter(index, 1)).toFixed(1)}%`)
      card.style.setProperty('--fall-z', `${(-100 * scatter(index, 2)).toFixed(1)}px`)
    }
    card.style.setProperty('--fall', fall.toFixed(4))
  })
}

/**
 * Tips a page's grid cards back as they scroll up under the bar (see the CSS for
 * [data-fall]). `page` is moved by `translateY(-scrollY)` with a transition; this follows
 * it each frame until it's there.
 */
export function useGridFall(ref: RefObject<HTMLElement | null>, scrollY: number): void {
  const frame = useRef(0)
  const goal = useRef(scrollY)

  useEffect(() => {
    goal.current = scrollY
    const page = ref.current
    if (!page || frame.current) return
    let last = performance.now()
    let settled = 0
    const step = (now: number): void => {
      const frames = Math.max(now - last, 1) / FRAME_MS
      last = now
      place(page)
      // The transition may not have started on the first frame, so stop only once it's
      // been there a few frames running.
      settled = Math.abs(drawnY(page) + goal.current) < 0.5 ? settled + frames : 0
      if (settled >= 3) {
        frame.current = 0
        return
      }
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
