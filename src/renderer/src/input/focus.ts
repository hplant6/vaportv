import { play } from './sounds'

export type Direction = 'up' | 'down' | 'left' | 'right'

const FOCUSABLE = '[data-focusable]'
/** Rows whose tops are within this many px count as the same row. */
const ROW_TOLERANCE = 40

// Last focused element per `data-focus-memory` group, so re-entering a row
// lands where you left it instead of on whatever happens to be nearest.
const remembered = new Map<string, HTMLElement>()

function current(): HTMLElement | null {
  const el = document.activeElement
  return el instanceof HTMLElement && el.matches(FOCUSABLE) ? el : null
}

function memoryGroup(el: HTMLElement): string | undefined {
  return el.closest<HTMLElement>('[data-focus-memory]')?.dataset.focusMemory
}

export function focus(el: HTMLElement): void {
  const group = memoryGroup(el)
  if (group) remembered.set(group, el)
  el.focus({ preventScroll: true })
}

/**
 * For screens that load their content after opening: once it's there, move focus
 * into it unless the user has already gone somewhere other than the menu.
 */
export function focusContentDefault(): void {
  const el = document.activeElement
  if (!(el instanceof HTMLElement) || !el.matches(FOCUSABLE) || el.closest('.nav')) focusDefault()
}

export function focusDefault(): void {
  const el = document.querySelector<HTMLElement>('[data-focus-default]') ?? document.querySelector<HTMLElement>(FOCUSABLE)
  if (el) focus(el)
}

function horizontal(from: DOMRect, candidates: HTMLElement[], sign: 1 | -1): HTMLElement | undefined {
  const fromX = from.left + from.width / 2
  let best: HTMLElement | undefined
  let bestDistance = Infinity
  for (const el of candidates) {
    const rect = el.getBoundingClientRect()
    if (rect.bottom <= from.top || rect.top >= from.bottom) continue
    const distance = (rect.left + rect.width / 2 - fromX) * sign
    if (distance > 1 && distance < bestDistance) {
      best = el
      bestDistance = distance
    }
  }
  return best
}

function vertical(from: DOMRect, candidates: HTMLElement[], sign: 1 | -1): HTMLElement | undefined {
  const fromX = from.left + from.width / 2
  const scored = candidates
    .map((el) => {
      const rect = el.getBoundingClientRect()
      const gap = sign === 1 ? rect.top - from.bottom : from.top - rect.bottom
      const offset = Math.max(rect.left - fromX, 0, fromX - rect.right)
      return { el, gap, offset }
    })
    .filter((c) => c.gap > -1)
  if (!scored.length) return undefined
  const nearestRow = Math.min(...scored.map((c) => c.gap))
  return scored.filter((c) => c.gap <= nearestRow + ROW_TOLERANCE).sort((a, b) => a.offset - b.offset)[0].el
}

export type InputSource = 'keyboard' | 'gamepad'

// In Desktop Mode, Steam also turns the controller's d-pad into arrow keys, so one
// press arrives twice. A same-direction move from the other source this soon after
// is that echo.
const ECHO_WINDOW = 80
let lastMove: { direction: Direction; source: InputSource; at: number } | null = null

export function move(direction: Direction, source: InputSource): void {
  const now = performance.now()
  if (lastMove && lastMove.direction === direction && lastMove.source !== source && now - lastMove.at < ECHO_WINDOW) return
  lastMove = { direction, source, at: now }
  window.steamtv.logInput(`move ${direction} from ${source}`)

  const from = current()
  if (!from) return focusDefault()

  const candidates = [...(trap() ?? document).querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el !== from)
  const rect = from.getBoundingClientRect()
  // An element can name where a direction goes (data-nav-right=".selector"), e.g. a
  // Settings category into its pane, whose first row may not line up with it. A
  // container can too, for everything in it: left from anywhere in a Settings pane is
  // its own category, wherever the pane has scrolled to.
  const key = `nav${direction[0].toUpperCase()}${direction.slice(1)}` as const
  const fromContainer = from.dataset[key] === undefined
  const named = from.dataset[key] ?? from.parentElement?.closest<HTMLElement>(`[data-nav-${direction}]`)?.dataset[key]
  // Up and down stay within a column marked data-nav-scope (Settings' categories, its
  // pane); past its top they may only leave for things outside every scope (the nav bar).
  const scope = from.closest('[data-nav-scope]')
  const upDown = (sign: 1 | -1): HTMLElement | undefined =>
    scope
      ? (vertical(rect, candidates.filter((el) => scope.contains(el)), sign) ??
        vertical(rect, candidates.filter((el) => !el.closest('[data-nav-scope]')), sign))
      : vertical(rect, candidates, sign)
  let target =
    (named ? document.querySelector<HTMLElement>(named) : null) ??
    (direction === 'left' || direction === 'right'
      ? horizontal(rect, candidates, direction === 'right' ? 1 : -1)
      : upDown(direction === 'down' ? 1 : -1))
  if (!target) return

  // Re-entering a row returns to where you were in it; a container's own target
  // (a pane's category) is exact, so it isn't swapped for that.
  const group = memoryGroup(target)
  if (group && group !== memoryGroup(from) && !(named && fromContainer)) {
    const last = remembered.get(group)
    if (last?.isConnected) target = last
  }
  focus(target)
  play('move')
}

/** B on a controller, Escape or Backspace on a keyboard. Screens listen for this. */
export const BACK_EVENT = 'steamtv:back'
/** B while a focus trap (e.g. the power menu) is open: it closes instead of going back. */
export const TRAP_CLOSE_EVENT = 'steamtv:close-trap'

/** An open menu that keeps the cursor inside it until closed. */
function trap(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-focus-trap]')
}

export function back(): void {
  window.steamtv.logInput('back')
  play('move')
  window.dispatchEvent(new Event(trap() ? TRAP_CLOSE_EVENT : BACK_EVENT))
}

/** L1/R1 on a controller, PageUp/PageDown on a keyboard: the previous or next tab (detail: -1 or 1). */
export const TAB_EVENT = 'steamtv:tab'

export function switchTab(step: -1 | 1): void {
  // Menus that hold the cursor (the power menu) stay put until closed.
  if (trap()) return
  window.steamtv.logInput(`tab ${step > 0 ? 'next' : 'previous'}`)
  play('move')
  window.dispatchEvent(new CustomEvent(TAB_EVENT, { detail: step }))
}

/** X on a controller, the X key on a keyboard: options for the focused card (its artwork). */
export const OPTIONS_EVENT = 'steamtv:options'

export function options(): void {
  // Menus that hold the cursor stay put.
  if (trap()) return
  const el = current()
  if (el?.dataset.itemId) window.dispatchEvent(new CustomEvent(OPTIONS_EVENT, { detail: el }))
}

/** Start (by default) on an arcade game: choose its RetroArch core. */
export const CORE_EVENT = 'steamtv:core'

export function coreMenu(): void {
  if (trap()) return
  const el = current()
  if (el?.dataset.itemId) window.dispatchEvent(new CustomEvent(CORE_EVENT, { detail: el }))
}

/** Y on a controller, F on a keyboard: favourite the focused game. Screens listen for this. */
export const FAVORITE_EVENT = 'steamtv:favorite'

export function favorite(): void {
  const el = current()
  window.steamtv.logInput(`favorite ${el?.getAttribute('aria-label') ?? el?.dataset.itemId ?? 'nothing'}`)
  if (el) window.dispatchEvent(new CustomEvent(FAVORITE_EVENT, { detail: el }))
}

export function activate(): void {
  const el = current()
  window.steamtv.logInput(`select ${el?.getAttribute('aria-label') ?? el?.textContent?.slice(0, 40) ?? 'nothing'}`)
  if (!el) return
  // Launching gets the big sound; toggles and tab switches get the small one.
  play(el.dataset.selectSound === 'move' ? 'move' : 'launch')
  el.click()
}
