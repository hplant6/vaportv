// vaporTV for Netflix: the D-pad (arrow keys, or a controller's, read below) moves
// between titles on Netflix's website, as on a TV. Netflix's own keyboard support stops at Tab; Chrome's spatial
// navigation gets caught in its hover previews and moves behind its info panel.
//
// Left/right go along a row (paging it with Netflix's own arrow at the ends), up/down
// go to the nearest title in the row above or below, with the billboard's buttons and
// the top menu above the first row. While a title's info panel is open the arrows stay
// inside it. In the video player the extension takes the keys itself and works Netflix's own
// buttons (see "The video player" below).

const CARD = 'a[data-uia$="-card"], .title-card-container a.slider-refocus'
const ROW = 'section.carousel-row, .lolomoRow, .rowContainer, .row-with-x-columns'
const BILLBOARD = '[data-uia="play-video-button"], [data-uia="billboard-more-info"]'
const MENU = 'a[data-uia^="nav-"], [data-uia="navigation+actions+search+icon"], [data-uia="navigation+profile-menu+trigger"]'
const PANEL = '[role="dialog"][data-uia^="modal-motion-container-DETAIL"]'
/** "Who's watching?": profile tiles and Manage Profiles, which have no titles to move between. */
const GATE = '[data-uia="profile-gate-screen"]'
// Links off to help pages and within the panel ("more") aren't worth a stop.
const IN_PANEL = 'a[href^="/"], button, [role="button"], [tabindex="0"]:not(a)'
const PAGE_NEXT = '[data-uia="carousel-hawkins-right-button"], .handleNext'
const PAGE_PREV = '[data-uia="carousel-hawkins-left-button"], .handlePrev'
/** How long a row takes to slide along after its arrow is pressed. */
const PAGE_MS = 700

const DIRECTIONS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }
/** Loaded unpacked with manifest.dev.json (which adds debug.js): F8 reloads, F9 dumps the page. */
const DEV = !!chrome.runtime.getManifest().background

const all = (selector, root = document) => [...root.querySelectorAll(selector)]

function shown(el) {
  const r = el.getBoundingClientRect()
  if (r.width < 2 || r.height < 2) return false
  const style = getComputedStyle(el)
  return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) !== 0
}

/** Mostly on screen left to right: rows draw slivers of the next titles past either edge. */
const onScreen = (el) => {
  const r = el.getBoundingClientRect()
  return r.left >= -r.width / 4 && r.right <= innerWidth + r.width / 4
}

const center = (el) => {
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

function panel() {
  return all(PANEL).find(shown) ?? null
}

function go(el) {
  if (!el) return false
  el.focus({ preventScroll: true })
  el.scrollIntoView({ block: el.matches(MENU) ? 'nearest' : 'center', inline: 'nearest', behavior: 'smooth' })
  return true
}

/**
 * The nearest of `candidates` from `from` in `direction`: ahead of it, preferring ones
 * in line with it (a small sideways step costs less than a long one ahead).
 */
function nearest(from, candidates, direction) {
  const a = center(from)
  let best = null
  let bestScore = Infinity
  for (const el of candidates) {
    if (el === from) continue
    const b = center(el)
    const ahead = { up: a.y - b.y, down: b.y - a.y, left: a.x - b.x, right: b.x - a.x }[direction]
    if (ahead < 4) continue
    const aside = direction === 'up' || direction === 'down' ? Math.abs(b.x - a.x) : Math.abs(b.y - a.y)
    const score = ahead + aside * 2
    if (score < bestScore) {
      bestScore = score
      best = el
    }
  }
  return best
}

/**
 * Rows that have titles in them, top to bottom: each title's nearest row (the grid
 * pages wrap a row in more than one element that looks like one).
 */
const rows = () => [...new Set(all(CARD).filter(shown).map((card) => card.closest(ROW)))].filter(Boolean)

/** The stops above the rows: the billboard's buttons, then the top menu. */
function above(from, direction) {
  const billboard = all(BILLBOARD).filter(shown)
  const menu = all(MENU).filter(shown)
  const firstRow = () => all(CARD, rows()[0] ?? document).find((el) => shown(el) && onScreen(el))
  if (from.matches(MENU)) return direction === 'down' ? billboard[0] ?? firstRow() : null
  if (from.matches(BILLBOARD)) return direction === 'up' ? menu.find((el) => el.getAttribute('aria-current') === 'page') ?? menu[0] : firstRow()
  return null
}

/** Left or right along a row; at an end, page the row with Netflix's arrow and try again. */
function along(card, direction) {
  const row = card.closest(ROW)
  const cards = all(CARD, row ?? document).filter(shown)
  const next = cards[cards.indexOf(card) + (direction === 'right' ? 1 : -1)]
  if (next && onScreen(next)) return go(next)
  // The arrow is see-through until the row is hovered with a mouse, but it works all the same.
  const arrow = row && all(direction === 'right' ? PAGE_NEXT : PAGE_PREV, row).find((el) => el.getBoundingClientRect().width > 0)
  if (arrow) {
    arrow.click()
    setTimeout(() => {
      const now = all(CARD, row).filter((el) => shown(el) && onScreen(el))
      go(direction === 'right' ? now[0] : now[now.length - 1])
    }, PAGE_MS)
    return true
  }
  // A grid row's last title: carry on into the next row, as reading a page.
  return next ? go(next) : false
}

/** Up or down to the row above or below: the title nearest across from this one. */
function across(card, direction) {
  const list = rows()
  const i = list.indexOf(card.closest(ROW))
  const row = list[i + (direction === 'down' ? 1 : -1)]
  if (!row) return direction === 'up' ? go(all(BILLBOARD).find(shown) ?? all(MENU).find(shown)) : false
  const x = center(card).x
  const cards = all(CARD, row).filter((el) => shown(el) && onScreen(el))
  const best = cards.sort((p, q) => Math.abs(center(p).x - x) - Math.abs(center(q).x - x))[0]
  return go(best ?? row.querySelector(CARD))
}

function start() {
  const open = panel()
  if (open) return go(all(IN_PANEL, open).find(shown))
  // Nothing chosen yet: the first title on screen, else the billboard.
  const first = all(CARD).find((el) => shown(el) && onScreen(el) && el.getBoundingClientRect().top >= 0)
  return go(first ?? all(BILLBOARD).find(shown) ?? all(MENU).find(shown))
}

function move(direction) {
  const from = document.activeElement
  const gate = all(GATE).find(shown)
  if (gate) {
    const stops = all('button, a[href]', gate).filter(shown)
    return go(gate.contains(from) && stops.includes(from) ? nearest(from, stops, direction) : stops[0])
  }
  const open = panel()
  if (open) {
    // Inside the info panel; anything else focused means it has only just opened.
    if (!open.contains(from)) return start()
    return go(nearest(from, all(IN_PANEL, open).filter(shown), direction))
  }
  if (!from || from === document.body || !from.matches(`${CARD}, ${BILLBOARD}, ${MENU}`)) return start()
  if (from.matches(CARD)) return direction === 'left' || direction === 'right' ? along(from, direction) : across(from, direction)
  if (direction === 'left' || direction === 'right') {
    const group = all(from.matches(MENU) ? MENU : BILLBOARD).filter(shown)
    return go(nearest(from, group, direction))
  }
  return go(above(from, direction))
}

/** Netflix's old grid pages link titles straight to the player: open their info panel instead, as the new pages do. */
function openInfo(card) {
  const id = /\/watch\/(\d+)/.exec(card.getAttribute('href') ?? '')?.[1]
  if (!id) return false
  const url = new URL(location.href)
  url.searchParams.set('jbv', id)
  history.pushState(history.state, '', url)
  dispatchEvent(new PopStateEvent('popstate', { state: history.state }))
  return true
}

window.addEventListener(
  'keydown',
  (event) => {
    // B on a controller is Escape; a remote's Back is Backspace or the browser's Back key.
    const back = event.key === 'Escape' || event.key === 'Backspace' || event.key === 'BrowserBack'
    if (location.pathname.startsWith('/watch')) {
      const action = back ? 'back' : PLAYER_KEYS[event.key]
      // Ours: Netflix must not see it, down or up (its key-up counts as a click on the video,
      // which played it again 300 ms after a pause).
      if (action && (action !== 'back' || playerAction('back'))) {
        if (action !== 'back') playerAction(action)
        swallowKey(event)
        return
      }
      // The player has no key for leaving it; Back goes back to where it was opened from.
      if (back) {
        event.preventDefault()
        event.stopImmediatePropagation()
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
        if (history.length > 1) history.back()
        else location.assign('/browse')
      }
      return
    }
    const target = event.target
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
    if (DEV && event.key === 'F9') return dump()
    // Back closes the info panel (Netflix's own Escape does; Backspace and Back don't).
    if (back && event.key !== 'Escape') {
      const close = panel()?.querySelector('[data-uia="previewModal-closebtn"]')
      if (close) {
        close.click()
        event.preventDefault()
        event.stopImmediatePropagation()
      }
      return
    }
    if (DEV && event.key === 'F8') {
      chrome.runtime.sendMessage({ name: 'reload' })
      return setTimeout(() => location.reload(), 800)
    }
    const direction = DIRECTIONS[event.key]
    let handled = false
    if (direction) handled = move(direction) || true
    else if (event.key === 'Enter' && target instanceof Element && target.matches('.title-card-container a.slider-refocus')) handled = openInfo(target)
    if (handled) {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
  },
  true
)

// --- A controller ----------------------------------------------------------------------
//
// With no Steam Input layout for Netflix (Steam's default for a shortcut is to pass the controller
// through as a gamepad), Chrome sees a gamepad and no keys at all. So the extension reads it itself
// and plays it as the keys a remote sends: the D-pad or left stick is the arrows, A is Enter and B is
// Back. A layout that does send keys hides the gamepad from Chrome, so nothing happens twice.

const PAD = { a: 0, b: 1, y: 3, l2: 6, r2: 7, up: 12, down: 13, left: 14, right: 15 }
/** How far the stick has to go to count as a press. */
const STICK = 0.6
/** Held: the first repeat after this long, then one every REPEAT_MS. */
const REPEAT_DELAY_MS = 400
const REPEAT_MS = 130

/** A key as a remote would send it, to this page's own handlers and Netflix's (the player's Space and arrows). */
function press(key) {
  const target = document.activeElement ?? document.body
  const event = new KeyboardEvent('keydown', { key, code: key === ' ' ? 'Space' : key, bubbles: true, cancelable: true, composed: true })
  const unhandled = target.dispatchEvent(event)
  target.dispatchEvent(new KeyboardEvent('keyup', { key, code: key === ' ' ? 'Space' : key, bubbles: true, cancelable: true, composed: true }))
  return !unhandled
}

/** A: what Enter does. A made-up Enter doesn't follow a link or press a button, so if nothing took it, click. */
function activate() {
  if (location.pathname.startsWith('/watch')) return playerAction('select')
  if (press('Enter')) return
  const el = document.activeElement
  if (el instanceof HTMLElement && el !== document.body) el.click()
}

/** B: Back, as a remote's. On the browse pages with nothing open, the page before. */
function back() {
  if (location.pathname.startsWith('/watch') && playerAction('back')) return
  if (press('BrowserBack')) return
  if (history.length > 1 && !location.pathname.startsWith('/browse')) history.back()
}

const held = new Map()

function pollPad(now) {
  requestAnimationFrame(pollPad)
  if (document.hidden || !document.hasFocus()) return held.clear()
  const pad = [...navigator.getGamepads()].find((p) => p && p.connected)
  if (!pad) return held.clear()
  const button = (i) => !!pad.buttons[i]?.pressed
  const [x = 0, y = 0] = pad.axes
  const state = {
    up: button(PAD.up) || y < -STICK,
    down: button(PAD.down) || y > STICK,
    left: button(PAD.left) || x < -STICK,
    right: button(PAD.right) || x > STICK,
    a: button(PAD.a),
    b: button(PAD.b),
    // In the player only: Y is Audio & Subtitles, the triggers 10 seconds back and on (as vaporTV's own player).
    y: button(PAD.y),
    l2: button(PAD.l2),
    r2: button(PAD.r2)
  }
  for (const [name, down] of Object.entries(state)) {
    if (!down) {
      held.delete(name)
      continue
    }
    const since = held.get(name)
    const watching = location.pathname.startsWith('/watch')
    if ((name === 'y' || name === 'l2' || name === 'r2') && !watching) continue
    const repeats = !['a', 'b', 'y'].includes(name)
    if (since === undefined) held.set(name, { at: now, next: now + REPEAT_DELAY_MS })
    else if (!repeats || now < since.next) continue
    else since.next = now + REPEAT_MS
    if (name === 'a') activate()
    else if (name === 'b') back()
    else if (name === 'y') playerAction('tracks')
    else if (name === 'l2') playerAction('skipBack')
    else if (name === 'r2') playerAction('skipOn')
    // The player ignores made-up keys: its moves go straight to the extension's own.
    else if (watching) playerAction(name)
    else press({ up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }[name])
  }
}

requestAnimationFrame(pollPad)

// --- The video player --------------------------------------------------------------------
//
// Netflix's player takes Space and Enter on the key going down and again on its way up (as a click
// on the video, 300 ms later), so one press of a remote's OK paused and played again; it ignores
// made-up keys (a controller's, played as keys above) altogether; and its buttons can't be reached
// with the arrows. So while a video plays the extension takes the keys itself (Netflix never sees
// them) and works Netflix's own buttons, which do answer clicks while they're showing:
//
//   OK / A            play or pause
//   left / right      10 seconds back / on (the triggers too)
//   down / up         the buttons, a gold ring on the one with the cursor: the arrows move it, OK
//                     presses it (Audio & Subtitles, Next Episode, Skip Intro...); in a panel they
//                     open the arrows move along its choices
//   Y                 Audio & Subtitles
//   Back / B          closes a panel, then the buttons, then the player

const PLAYER = '[data-uia="watch-video"]'
/** Not worth a stop: the TV does the volume, the player's always full screen, a mistaken "report a problem", and the timeline (left and right scrub it). */
const NOT_A_STOP = /^(control-(volume|flag|fullscreen)|timeline-knob)/
/** Panels a button opens (Audio & Subtitles, Episodes, Speed). */
const PLAYER_PANEL = '[data-uia^="selector-"], [data-uia*="episode-selector"], [data-uia*="playback-speed"]'
/** A panel's choices. */
const CHOICE = '[data-uia*="-item"], [role="option"], [role="radio"], li[role], button'
/** Netflix hides its buttons after ~3 s without the mouse moving; a made-up move every so often keeps them up. */
const KEEP_UP_MS = 500
/** A button gone from under the cursor (Netflix hid its buttons for a moment) is looked for this long before the cursor goes. */
const LOST_MS = 3000
/** The cursor goes (and the buttons with it) this long after the last press, unless a panel is open. */
const CURSOR_IDLE_MS = 6000

const PLAYER_KEYS = { Enter: 'select', ' ': 'select', ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }
/** Keys whose press went down here: their key-up is swallowed too. */
const swallowed = new Set()
function swallowKey(event) {
  event.preventDefault()
  event.stopImmediatePropagation()
  if (event.type === 'keydown') swallowed.add(event.key)
}
for (const type of ['keyup', 'keypress']) {
  window.addEventListener(
    type,
    (event) => {
      if (!swallowed.has(event.key)) return
      if (type === 'keyup') swallowed.delete(event.key)
      event.preventDefault()
      event.stopImmediatePropagation()
    },
    true
  )
}

let cursor = null
/** The button that opened the panel the cursor's in: where it goes back to. */
let opener = null
let lastPress = 0
let keepUp = null
let wiggle = 0

const playerButton = (uia) => document.querySelector(`${PLAYER} [data-uia^="${uia}"]`)

/** Shows Netflix's buttons, as moving the mouse over the video does (it watches pointer moves; a mouse move alone does nothing). */
function wake() {
  const surface = document.querySelector('[data-uia="video-canvas"]') ?? document.querySelector(`${PLAYER} video`)
  if (!surface) return
  wiggle = 1 - wiggle
  const at = { bubbles: true, clientX: innerWidth / 2 + wiggle * 8, clientY: innerHeight / 2 }
  surface.dispatchEvent(new PointerEvent('pointermove', { ...at, pointerType: 'mouse' }))
  surface.dispatchEvent(new MouseEvent('mousemove', at))
}

/**
 * Shows the buttons and, once `find` turns up a button that's drawn (they come a moment after the
 * move that shows them), calls `then` with it. Gives up after a while.
 */
function whenAwake(find, then, tries = 15) {
  wake()
  const el = find()
  if (el && shown(el)) return then(el)
  if (tries > 0) setTimeout(() => whenAwake(find, then, tries - 1), 50)
}

/** The buttons the cursor stops at. */
const playerStops = () => all(`${PLAYER} button`).filter((el) => shown(el) && !NOT_A_STOP.test(el.dataset.uia ?? '') && !el.closest(PLAYER_PANEL))

function openPanel() {
  return all(PLAYER_PANEL).find(shown) ?? null
}

/** A panel's choices: the innermost of what can be picked. */
const choices = (panel) => all(CHOICE, panel).filter((el) => shown(el) && !el.querySelector(CHOICE))

/**
 * The same button drawn again: Netflix replaces its buttons as they change (a panel closing, Play
 * becoming Pause), so the cursor follows by name. Null if it's gone for good.
 */
function redrawn(el) {
  const uia = el?.dataset.uia
  if (!uia) return null
  const same = document.querySelector(`[data-uia="${CSS.escape(uia)}"]`)
  if (same) return same
  return uia.startsWith('control-play-pause') ? playerButton('control-play-pause') : null
}

function setCursor(el) {
  if (cursor === el) return
  cursor?.removeAttribute('data-vaportv-cursor')
  cursor = el
  if (!el) {
    clearInterval(keepUp)
    keepUp = null
    return
  }
  // An attribute, not a class: Netflix sets its buttons' classes again as they change, which would take a class away.
  el.setAttribute('data-vaportv-cursor', '')
  el.focus({ preventScroll: true })
  el.scrollIntoView({ block: 'nearest' })
  keepUp ??= setInterval(() => {
    // Another page, or idle with no panel open: the cursor goes and the buttons hide.
    if (!location.pathname.startsWith('/watch')) return setCursor(null)
    if (!openPanel() && performance.now() - lastPress > CURSOR_IDLE_MS) return setCursor(null)
    wake()
    if (cursor?.isConnected && !cursor.hasAttribute('data-vaportv-cursor')) cursor.setAttribute('data-vaportv-cursor', '')
    // Drawn again: follow it; gone a while (the video ended): done.
    if (cursor && !cursor.isConnected) {
      const again = redrawn(cursor)
      if (again) setCursor(again)
      else if (performance.now() - lastPress > LOST_MS) setCursor(null)
    }
  }, KEEP_UP_MS)
}

/** Closes a panel the way moving the mouse off it does. */
function closePanel(panel) {
  const surface = document.querySelector('[data-uia="video-canvas"]') ?? document.body
  for (const el of [panel, opener].filter(Boolean)) {
    for (const type of ['pointerout', 'pointerleave', 'mouseout', 'mouseleave']) {
      const Kind = type.startsWith('pointer') ? PointerEvent : MouseEvent
      el.dispatchEvent(new Kind(type, { bubbles: type.endsWith('out'), relatedTarget: surface }))
    }
  }
}

/** Into a panel that's just opened: the cursor on the choice that's ticked (Netflix marks it "selected"), else the first. */
function intoPanel(tries = 6) {
  const panel = openPanel()
  if (!panel) return tries > 0 ? setTimeout(() => intoPanel(tries - 1), 80) : undefined
  const list = choices(panel)
  setCursor(list.find((el) => /selected/.test(el.dataset.uia ?? '')) ?? list[0] ?? cursor)
}

/** Presses the button or choice with the cursor; a button that opens a panel takes the cursor into it. */
function pressCursor() {
  const el = cursor
  const inPanel = openPanel()?.contains(el)
  el.click()
  if (inPanel) {
    // Picked: the list is drawn again (the tick moves), so the cursor follows the same choice by its name.
    const name = el.textContent.trim()
    setTimeout(() => {
      const panel = openPanel()
      if (!panel) return setCursor(opener?.isConnected ? opener : null)
      const again = choices(panel).find((c) => c.textContent.trim() === name)
      if (again && again !== cursor) setCursor(again)
    }, 120)
    return
  }
  opener = el
  setTimeout(() => {
    if (openPanel()) intoPanel()
    // A button that takes the video somewhere else (Next Episode, Skip Intro) can leave the cursor on nothing.
    else if (!cursor?.isConnected) setCursor(null)
  }, 150)
}

/** One press in the player. False: not ours (Back with nothing open leaves the player as before). */
function playerAction(action) {
  lastPress = performance.now()
  const panel = openPanel()
  // The button under the cursor drawn again (or not drawn just now): wait for it, then do this.
  if (cursor && !cursor.isConnected) {
    const again = redrawn(cursor)
    if (again) setCursor(again)
    else {
      const lost = cursor
      whenAwake(() => redrawn(lost), (el) => {
        setCursor(el)
        playerAction(action)
      })
      return true
    }
  }
  switch (action) {
    case 'back':
      if (panel) {
        // Back to the button that opened it: found again by name, as Netflix draws its buttons again as the panel goes.
        const uia = opener?.dataset.uia
        closePanel(panel)
        setCursor(null)
        if (uia) whenAwake(() => playerButton(uia), (button) => setCursor(button))
        return true
      }
      if (cursor) {
        setCursor(null)
        return true
      }
      return false
    case 'tracks':
      whenAwake(() => playerButton('control-audio-subtitle'), (button) => {
        if (openPanel()) return intoPanel()
        opener = button
        setCursor(button)
        button.click()
        intoPanel()
      })
      return true
    case 'skipBack':
    case 'skipOn':
      whenAwake(() => playerButton(action === 'skipBack' ? 'control-back10' : 'control-forward10'), (button) => button.click())
      return true
  }
  // With the cursor on the buttons (or in a panel): it moves, and OK presses.
  if (cursor) {
    wake()
    if (action === 'select') return pressCursor(), true
    const inPanel = panel?.contains(cursor)
    const next = nearest(cursor, inPanel ? choices(panel) : playerStops(), action)
    if (next) setCursor(next)
    // Up past the top of a panel's list, or down past the buttons: nothing there, the cursor stays.
    return true
  }
  // Watching: OK plays or pauses, left and right skip, up or down brings up the buttons.
  if (action === 'select') {
    whenAwake(() => playerButton('control-play-pause'), (button) => button.click())
    return true
  }
  if (action === 'left' || action === 'right') return playerAction(action === 'left' ? 'skipBack' : 'skipOn')
  // A button over the video (Skip Intro, Next Episode) first: it's what's wanted then.
  const overlay = () => playerStops().find((el) => /skip|seamless|next-episode|watch-credits/i.test(el.dataset.uia ?? ''))
  whenAwake(() => overlay() ?? playerButton('control-play-pause'), (button) => setCursor(button))
  return true
}

/** The title last chosen on the page, to come back to when its info panel closes. */
let lastCard = null
document.addEventListener('focusin', (event) => {
  if (event.target instanceof Element && event.target.matches(CARD)) lastCard = event.target
})

// When the info panel opens, the cursor goes into it (Netflix leaves it on the title
// behind); when it closes, back to that title.
let wasOpen = false
new MutationObserver(() => {
  const open = panel()
  if (open && !open.contains(document.activeElement)) {
    const play = all('a[href^="/watch/"], button', open).find(shown)
    if (play) play.focus({ preventScroll: true })
  }
  if (wasOpen && !open && lastCard?.isConnected) lastCard.focus({ preventScroll: true })
  wasOpen = !!open
}).observe(document.documentElement, { childList: true, subtree: true })

// --- Development: page dumps to the box (debug.js) -----------------------------------

const describe = (el) => (el ? `${el.tagName.toLowerCase()}${el.id ? '#' + el.id.slice(0, 20) : ''}.${[...el.classList].join('.')}${el.dataset?.uia ? `[${el.dataset.uia}]` : ''}` : 'none')

function dump() {
  const path = []
  for (let el = document.activeElement; el && el !== document.body; el = el.parentElement) path.push(describe(el))
  const info = { url: location.href, active: path, viewport: [innerWidth, innerHeight], panel: !!panel(), rows: rows().length }
  chrome.runtime.sendMessage({ name: 'info.json', body: JSON.stringify(info, null, 1) })
  chrome.runtime.sendMessage({ name: 'page.html', body: document.documentElement.outerHTML })
  return true
}
