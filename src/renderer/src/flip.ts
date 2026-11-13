// Moving things smoothly to where a layout change puts them (FLIP: first, last, invert, play).
// Note where they are, change the layout, then play: each starts back where it was and glides
// to its new place and size. The left bar uses it when Select hides or shows it, so the grid's
// cards slide and grow into their new columns instead of jumping.

export type Snapshot = Map<HTMLElement, DOMRect>

/** Where each of `selector`'s elements is now. */
export function snapshot(selector: string): Snapshot {
  return new Map([...document.querySelectorAll<HTMLElement>(selector)].map((el) => [el, el.getBoundingClientRect()]))
}

/** Plays each element in `before` from where it was to where it is now. Off-screen both times, it just goes. */
export function flip(before: Snapshot, duration: number, easing: string): void {
  // The stage is scaled to the screen; a transform moves in the stage's own pixels.
  const stage = document.querySelector<HTMLElement>('.stage')
  const scale = stage ? stage.getBoundingClientRect().width / stage.offsetWidth || 1 : 1
  const shown = (r: DOMRect): boolean => r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth
  for (const [el, was] of before) {
    if (!el.isConnected) continue
    const now = el.getBoundingClientRect()
    if (!now.width || !now.height || (!shown(was) && !shown(now))) continue
    const dx = (was.left + was.width / 2 - (now.left + now.width / 2)) / scale
    const dy = (was.top + was.height / 2 - (now.top + now.height / 2)) / scale
    const sx = was.width / now.width
    const sy = was.height / now.height
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.005 && Math.abs(sy - 1) < 0.005) continue
    // Added to its own transform (a selected card's lift), not instead of it.
    el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` }, { transform: 'none' }], { duration, easing, composite: 'add' })
  }
}
