import { useRef, useState, type CSSProperties, type FocusEvent, type RefObject } from 'react'

const STAGE_H = 1080
/** Space kept below the focused element, matching the Figma frame's bottom margin. */
const BOTTOM_MARGIN = 45

/**
 * Scrolls a page taller than the screen so the focused element stays in view.
 * Spread the result onto the page element. `viewportHeight` is how much of it shows
 * (the whole screen by default; less for a pane lower down).
 */
export function usePageScroll(viewportHeight = STAGE_H): {
  ref: RefObject<HTMLDivElement | null>
  onFocus: (event: FocusEvent<HTMLDivElement>) => void
  style: CSSProperties
} {
  const ref = useRef<HTMLDivElement>(null)
  const [scrollY, setScrollY] = useState(0)

  // Layout offsets ignore transforms, so this is stable mid-animation.
  const onFocus = (event: FocusEvent<HTMLDivElement>): void => {
    // A drop-down over the page (the power menu) leaves the page where it is; the
    // nav bar lives at the top, so focusing it scrolls back up.
    if (event.target.closest('[data-focus-trap]')) return
    if (event.target.closest('.nav')) return setScrollY(0)
    let top = 0
    for (let el: HTMLElement | null = event.target; el && el !== ref.current; el = el.offsetParent as HTMLElement | null) {
      top += el.offsetTop
    }
    // Cards and tiles grow by --focus-scale past their layout box. (Nav tabs don't,
    // but they sit where the page never scrolls.)
    const scale = Number(getComputedStyle(event.target).getPropertyValue('--focus-scale')) || 1
    const height = event.target.offsetHeight * (1 + (scale - 1) / 2)
    setScrollY(Math.max(0, top + height + BOTTOM_MARGIN - viewportHeight))
  }

  return { ref, onFocus, style: { transform: `translateY(${-scrollY}px)` } }
}
