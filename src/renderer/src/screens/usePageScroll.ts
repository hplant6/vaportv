import { useRef, useState, type CSSProperties, type FocusEvent, type RefObject } from 'react'
import { useGridFall } from '../gridFall'
import { useDrag } from '../input/drag'
import { stageHeight } from '../stage'

/** Space kept below the focused element, matching the Figma frame's bottom margin. */
const BOTTOM_MARGIN = 45
/** Grids keep the selected card's row near the middle of the screen, as `center` does. */
const GRIDS = '.wide-grid, .favorites-grid'

/**
 * Scrolls a page taller than the screen so the focused element stays in view, and with a
 * finger or mouse (dragged up and down). Spread the result onto the page element.
 * `viewportHeight` is how much of it shows (the whole screen by default; less for a pane
 * lower down). With `center`, the focused element is kept near the middle of that instead
 * of just above its bottom (Settings' long lists), stopping where the content ends; a
 * grid's cards always are.
 */
export function usePageScroll(viewportHeight = stageHeight(), { center = false }: { center?: boolean } = {}): {
  ref: RefObject<HTMLDivElement | null>
  onFocus: (event: FocusEvent<HTMLDivElement>) => void
  style: CSSProperties
  'data-dragging'?: ''
} & ReturnType<typeof useDrag>['handlers'] {
  const ref = useRef<HTMLDivElement>(null)
  const [scrollY, setScrollY] = useState(0)
  const drag = useDrag('y', scrollY, setScrollY, () => Math.max(0, (ref.current?.scrollHeight ?? 0) - viewportHeight))
  useGridFall(ref, scrollY)

  // Layout offsets ignore transforms, so this is stable mid-animation.
  const onFocus = (event: FocusEvent<HTMLDivElement>): void => {
    // A drop-down over the page (the power menu) leaves the page where it is; the
    // nav bar lives at the top, so focusing it scrolls back up.
    if (event.target.closest('[data-focus-trap]')) return
    if (event.target.closest('.nav')) return setScrollY(0)
    const offsetTop = (from: HTMLElement, stop: HTMLElement | null): number => {
      let top = 0
      for (let el: HTMLElement | null = from; el && el !== stop; el = el.offsetParent as HTMLElement | null) top += el.offsetTop
      return top
    }
    // From the top of the screen: within the content, plus where the content starts (a
    // pane's may start below the bar).
    const start = ref.current ? offsetTop(ref.current, null) : 0
    const top = offsetTop(event.target, ref.current) + start
    // Cards and tiles grow by --focus-scale past their layout box. (Nav tabs don't,
    // but they sit where the page never scrolls.)
    const scale = Number(getComputedStyle(event.target).getPropertyValue('--focus-scale')) || 1
    const height = event.target.offsetHeight * (1 + (scale - 1) / 2)
    if ((center || event.target.closest(GRIDS)) && ref.current) {
      // scrollHeight: a page fills the screen (inset 0), so its own height isn't its content's.
      const end = start + ref.current.scrollHeight + BOTTOM_MARGIN
      const middle = top + height / 2 - viewportHeight / 2
      return setScrollY(Math.max(0, Math.min(middle, end - viewportHeight)))
    }
    setScrollY(Math.max(0, top + height + BOTTOM_MARGIN - viewportHeight))
  }

  return {
    ref,
    onFocus,
    style: { transform: `translateY(${-scrollY}px)` },
    ...(drag.dragging ? { 'data-dragging': '' as const } : {}),
    ...drag.handlers
  }
}
