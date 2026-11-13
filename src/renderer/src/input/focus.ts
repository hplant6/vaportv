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
 * into it unless the user has already gone somewhere other than the menu, or picked
 * this screen from the menu and so stays there (data-stay, set by takeBarCursor).
 */
export function focusContentDefault(): void {
  const el = document.activeElement
  if (!(el instanceof HTMLElement) || !el.matches(FOCUSABLE) || (el.closest('.nav') && !el.hasAttribute('data-stay'))) focusDefault()
}

/** Set when a screen is picked from the bar (a tab, or L1/R1 there): the new screen's bar keeps the cursor. */
let stayInBar = false

export function keepCursorInBar(): void {
  stayInBar = true
}

/**
 * The new screen's bar: if the last screen was left from the bar, the cursor goes to the tab you're on and stays,
 * however the screen's content loads. It's moved on like any other focus.
 */
export function takeBarCursor(): void {
  if (!stayInBar) return
  stayInBar = false
  const tab = document.querySelector<HTMLElement>('.nav .nav-tab.active')
  if (!tab) return
  tab.dataset.stay = ''
  tab.addEventListener('blur', () => delete tab.dataset.stay, { once: true })
  focus(tab)
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

/**
 * Where a data-nav-* selector sends the cursor: its first match, or with a "nearest:" prefix, whichever match lines up
 * best with where it's coming from (the bar's tabs down into the second row: the tab under the one you're on).
 */
function namedTarget(named: string, from: DOMRect, direction: Direction): HTMLElement | null {
  if (!named.startsWith('nearest:')) return document.querySelector<HTMLElement>(named)
  const across = direction === 'up' || direction === 'down'
  const centre = across ? from.left + from.width / 2 : from.top + from.height / 2
  let best: HTMLElement | null = null
  let bestOffset = Infinity
  for (const el of document.querySelectorAll<HTMLElement>(named.slice('nearest:'.length))) {
    const r = el.getBoundingClientRect()
    const offset = Math.abs((across ? r.left + r.width / 2 : r.top + r.height / 2) - centre)
    if (offset < bestOffset) [best, bestOffset] = [el, offset]
  }
  return best
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

  // A row picked up to be moved (Settings → Tabs) takes the directions instead of the cursor.
  if (grabbed()) {
    window.dispatchEvent(new CustomEvent(GRAB_MOVE_EVENT, { detail: direction }))
    play('move')
    return
  }
  // So does a viewer that uses them itself (the Files app's: next picture, skip in a video).
  if (document.querySelector('[data-own-directions]')) {
    window.dispatchEvent(new CustomEvent(OWN_DIRECTION_EVENT, { detail: direction }))
    return
  }

  const from = current()
  // The cursor lost (what it was on went away): back into the open menu or keyboard if there is
  // one, not out to the screen behind it (which could close it).
  const open = trap()
  if (!from && open) {
    const first = open.querySelector<HTMLElement>(FOCUSABLE)
    if (first) focus(first)
    return
  }
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
  // A container can also name where a direction goes once nothing in it lies that way
  // (data-nav-left-out): left from a grid's first column into the bar beside it, at the
  // list it shows, wherever the card sits up or down.
  const outKey = `${key}Out` as const
  const edge = !named ? from.parentElement?.closest<HTMLElement>(`[data-nav-${direction}-out]`) : null
  if (edge && (direction === 'left' || direction === 'right')) {
    const inside = horizontal(rect, candidates.filter((el) => edge.contains(el)), direction === 'right' ? 1 : -1)
    const out = inside ? null : namedTarget(edge.dataset[outKey] ?? '', rect, direction)
    if (out) {
      focus(out)
      play('move')
      return
    }
  }
  let target =
    (named ? namedTarget(named, rect, direction) : null) ??
    (direction === 'left' || direction === 'right'
      ? horizontal(rect, candidates, direction === 'right' ? 1 : -1)
      : upDown(direction === 'down' ? 1 : -1))
  if (!target) return

  // Re-entering a row returns to where you were in it; a container's own target
  // (a pane's category) is exact, so it isn't swapped for that. Nor is a move between
  // rows inside a data-focus-direct container (the bar and its second row): it goes to what
  // lies that way.
  const group = memoryGroup(target)
  const direct = from.closest('[data-focus-direct]')
  if (group && group !== memoryGroup(from) && !(named && fromContainer) && !(direct && direct.contains(target))) {
    const last = remembered.get(group)
    if (last?.isConnected) target = last
  }
  // Which way the cursor came, for a card to tip that way (app.css) while it's selected.
  const arrived = target
  arrived.dataset.arrive = direction
  arrived.addEventListener('blur', () => delete arrived.dataset.arrive, { once: true })
  focus(target)
  play('move')
}

/** B on a controller; Escape, Backspace or Back (a remote's) on a keyboard. Screens listen for this. */
export const BACK_EVENT = 'steamtv:back'
/** B while a focus trap (e.g. the power menu) is open: it closes instead of going back. */
export const TRAP_CLOSE_EVENT = 'steamtv:close-trap'

/** An open menu that keeps the cursor inside it until closed. */
export function trap(): HTMLElement | null {
  // The topmost when one opens over another (the player over a show's page): the last drawn.
  const all = document.querySelectorAll<HTMLElement>('[data-focus-trap]')
  return all.length ? all[all.length - 1] : null
}

/** While an element marked data-grabbed is picked up, directions arrive as this (detail: the Direction). */
export const GRAB_MOVE_EVENT = 'steamtv:grab-move'
/** B while something is picked up: put it back where it was. */
export const GRAB_CANCEL_EVENT = 'steamtv:grab-cancel'

/** While an element marked data-own-directions is open, directions arrive as this instead (detail: the Direction). */
export const OWN_DIRECTION_EVENT = 'steamtv:own-direction'

function grabbed(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-grabbed]')
}

export function back(): void {
  window.steamtv.logInput('back')
  play('move')
  window.dispatchEvent(new Event(grabbed() ? GRAB_CANCEL_EVENT : trap() ? TRAP_CLOSE_EVENT : BACK_EVENT))
}

/** L1/R1 on a controller, PageUp/PageDown on a keyboard: the previous or next tab (detail: -1 or 1). */
export const TAB_EVENT = 'steamtv:tab'
/** L1/R1 while a focus trap is open, for one that uses them (the Files app: a page at a time, the next file). */
export const TRAP_TAB_EVENT = 'steamtv:trap-tab'

export function switchTab(step: -1 | 1): void {
  // Menus that hold the cursor (the power menu), and a row being moved, stay put until done.
  if (grabbed()) return
  if (trap()) {
    window.dispatchEvent(new CustomEvent(TRAP_TAB_EVENT, { detail: step }))
    return
  }
  window.steamtv.logInput(`tab ${step > 0 ? 'next' : 'previous'}`)
  play('move')
  window.dispatchEvent(new CustomEvent(TAB_EVENT, { detail: step }))
}

/** Select (by default), or a remote's Menu key: Settings, or back Home from there. App listens for this. */
export const SETTINGS_EVENT = 'steamtv:settings'

export function openSettings(): void {
  if (trap() || grabbed()) return
  window.steamtv.logInput('settings')
  play('move')
  window.dispatchEvent(new Event(SETTINGS_EVENT))
}

/** Opens the Artwork window for a card (Game options → Change artwork). ArtworkDialog listens. */
export const ARTWORK_EVENT = 'steamtv:artwork'

/** X on a controller, the X key on a keyboard: the focused game's playlists. GameDialog listens. */
export const PLAYLIST_EVENT = 'steamtv:playlist'

export function playlist(): void {
  const el = current()
  // A film, show or episode: its playlists, on a tab or over a show's page (itself a trap).
  const open = trap()
  if (el?.dataset.mediaSource && (!open || open.classList.contains('media-show')) && !grabbed()) {
    window.dispatchEvent(new CustomEvent(MEDIA_PLAYLIST_EVENT, { detail: el }))
    return
  }
  // Menus that hold the cursor stay put.
  if (open || grabbed()) return
  window.steamtv.logInput(`playlist ${el?.getAttribute('aria-label') ?? el?.dataset.itemId ?? 'nothing'}`)
  if (el?.dataset.itemId || el?.dataset.appId) window.dispatchEvent(new CustomEvent(PLAYLIST_EVENT, { detail: el }))
}

/** R2 (by default), H on a keyboard: the buttons and what they do, along the bottom. ControlsGuide listens. */
export const CONTROLS_GUIDE_EVENT = 'steamtv:controls-guide'

/** L2 (by default), L on a keyboard: shows or hides the tab’s left bar. */
export const SIDE_BAR_EVENT = 'steamtv:side-bar'

export function sideBar(): void {
  if (trap() || grabbed()) return
  window.steamtv.logInput('side bar')
  window.dispatchEvent(new Event(SIDE_BAR_EVENT))
}

export function controlsGuide(): void {
  window.steamtv.logInput('controls guide')
  window.dispatchEvent(new Event(CONTROLS_GUIDE_EVENT))
}

/** Both sticks clicked in at once: vaporTV's sound off, or back on. BackgroundMusic listens. */
export const SOUND_OFF_EVENT = 'steamtv:sound-off'

export function toggleSound(): void {
  window.steamtv.logInput('sound off/on')
  window.dispatchEvent(new Event(SOUND_OFF_EVENT))
}

/** Start on a controller, G on a keyboard: the focused game's or app's details and settings. */
export const GAME_MENU_EVENT = 'steamtv:game-menu'
/** The same again while they're open: closes them. */
export const GAME_MENU_CLOSE_EVENT = 'steamtv:game-menu-close'

/** Start on a film, show or episode (a card with data-media-source): its details. MediaDetails listens; detail is the card. */
export const MEDIA_DETAILS_EVENT = 'steamtv:media-details'
/** Y on one: favourite on its server, or not. MediaDetails listens; detail is the card. */
export const MEDIA_FAVORITE_EVENT = 'steamtv:media-favorite'
/** X on one: its playlists. MediaDetails listens; detail is the card. */
export const MEDIA_PLAYLIST_EVENT = 'steamtv:media-playlist'

export function gameMenu(): void {
  const open = trap()
  if (open?.classList.contains('game-panel')) window.dispatchEvent(new Event(GAME_MENU_CLOSE_EVENT))
  const el = current()
  // A film, show or episode: its details, on a tab or over a show's page (itself a trap).
  if (el?.dataset.mediaSource && (!open || open.classList.contains('media-show'))) {
    window.dispatchEvent(new CustomEvent(MEDIA_DETAILS_EVENT, { detail: el }))
    return
  }
  if (open) return
  if (el?.dataset.itemId || el?.dataset.appId) window.dispatchEvent(new CustomEvent(GAME_MENU_EVENT, { detail: el }))
}

/**
 * R3 (by default): voice search, as a remote's Menu tapped. Not over menus that hold the
 * cursor, except search itself, where it listens again.
 */
export function voiceSearch(): void {
  const open = trap()
  if (grabbed() || (open && !open.classList.contains('search-app'))) return
  window.steamtv.logInput('voice search (controller)')
  window.steamtv.startVoice()
}

/** Y on a controller, F on a keyboard: favourite the focused game. Screens listen for this. */
export const FAVORITE_EVENT = 'steamtv:favorite'

export function favorite(): void {
  const el = current()
  window.steamtv.logInput(`favorite ${el?.getAttribute('aria-label') ?? el?.dataset.itemId ?? 'nothing'}`)
  if (el?.dataset.mediaSource) window.dispatchEvent(new CustomEvent(MEDIA_FAVORITE_EVENT, { detail: el }))
  else if (el) window.dispatchEvent(new CustomEvent(FAVORITE_EVENT, { detail: el }))
}

export function activate(): void {
  const el = current()
  // Inside [data-no-log] (the on-screen keyboard) only that something was pressed: each
  // key's label is a character of what's typed, a password among them.
  const label = el?.closest('[data-no-log]') ? 'key' : el?.getAttribute('aria-label') ?? el?.textContent?.slice(0, 40) ?? 'nothing'
  window.steamtv.logInput(`select ${label}`)
  if (!el) return
  // Launching gets the big sound; toggles and tab switches get the small one.
  play(el.dataset.selectSound === 'move' ? 'move' : 'launch')
  el.click()
}
