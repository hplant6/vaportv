// vaporTV for Twitch (in the same extension as Netflix, so it installs with no new policy): the
// D-pad (arrow keys, or a controller's, read below) moves between what's on Twitch's website, as on
// a TV app, and a channel's stream fills the screen.
//
// Browsing: a gold ring on the nearest thing in the direction pressed: the top bar, the channels down
// the left, stream and category cards, the Browse tabs, "Show more". OK / A opens it, Back / B goes
// back. The cookie banner's buttons can be reached; nothing is chosen for you.
//
// Watching (a channel or a past broadcast): theatre mode with the chat folded away, so the video
// fills the window (real full screen needs a real click, which the extension can't make). OK / A
// plays or pauses, Y mutes, left / right are 10 seconds back / on (past broadcasts only), down shows
// the channel page again (chat, Follow; A on the video goes back to watching), Back / B leaves.

/** Things to move between, by Twitch's own markers (data-a-target), which stay put as its styles change. */
const STOPS = [
  '[data-a-target="consent-banner"] button',
  '[data-a-target="home-link"]',
  '[data-a-target="browse-link"]',
  '[data-a-target="nav-search-box"] input',
  '[data-a-target="login-button"]',
  '[data-a-target="signup-button"]',
  '[data-a-target="user-menu-toggle"]',
  'a[data-a-target="preview-card-image-link"]',
  'a[data-a-target="tw-box-art-card-link"]',
  '[data-a-target^="browse-type-tab-"]:not([data-a-target="browse-type-tab-list"])',
  '[data-a-target="side-nav-show-more-button"]',
  '[data-a-target="follow-button"]',
  '[data-a-target="unfollow-button"]',
  '[data-a-target="video-player"]'
].join(', ')
/** The channels down the left: their links have no marker of their own, their titles do. */
const SIDE_TITLE = '[data-a-target="side-nav-title"]'
const PLAYER = '[data-a-target="video-player"]'
const PLAY = '[data-a-target="player-play-pause-button"]'
const MUTE = '[data-a-target="player-mute-unmute-button"]'
const CHAT_TOGGLE = '[data-a-target="right-column__toggle-collapse-btn"]'
/** Theatre mode's button has no marker: its label ("Theatre Mode (alt+t)", "Exit Theatre Mode (alt+t)"). */
const THEATRE = 'button[aria-label^="Theatre Mode"], button[aria-label^="Exit Theatre Mode"]'
const RING = 'vaportv-ring'

const DIRECTIONS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }

const all = (selector, root = document) => [...root.querySelectorAll(selector)]

function shown(el) {
  const r = el.getBoundingClientRect()
  if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight * 3) return false
  const style = getComputedStyle(el)
  return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) !== 0
}

/** "Show more" / "Show all" under a row: buttons with no marker, known by their words. */
const showMore = () => all('main button, [data-a-target="root-scroller"] button').filter((b) => /^show (more|all)\b/i.test(b.textContent.trim()))

/** The top bar (and the cookie banner over it) stays put while the page scrolls under it. */
const TOP = '[data-a-target="top-nav-container"], [data-a-target="consent-banner"]'
const topBottom = () => Math.max(0, ...all(TOP).filter(shown).map((el) => el.getBoundingClientRect().bottom))

function stops() {
  const side = all(SIDE_TITLE).map((t) => t.closest('a'))
  const under = topBottom()
  // What's scrolled up under the top bar can't be seen, so it isn't somewhere to go (the bar's own things are).
  const visible = (el) => !!el.closest(TOP) || el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2 > under
  return [...new Set([...all(STOPS), ...side, ...showMore()])].filter((el) => el && shown(el) && visible(el))
}

// --- Where the ring is -------------------------------------------------------------------

let ring = null

/**
 * The ring is drawn by a box of the extension's own over the page, following the element as it
 * scrolls: drawn on the element itself, Twitch's card pictures (layers above their links) covered it.
 */
const box = document.createElement('div')
box.id = RING
function drawRing() {
  requestAnimationFrame(drawRing)
  const el = !watching && current()
  if (!el) return void (box.style.opacity = '0')
  if (!box.isConnected) document.documentElement.append(box)
  const r = el.getBoundingClientRect()
  Object.assign(box.style, { opacity: '1', left: `${r.left - 4}px`, top: `${r.top - 4}px`, width: `${r.width + 8}px`, height: `${r.height + 8}px` })
}
requestAnimationFrame(drawRing)

function go(el) {
  if (!el) return false
  ring = el
  el.focus({ preventScroll: true })
  el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
  return true
}

/** The ring's element, if it's still on the page (Twitch redraws as it goes). */
function current() {
  if (ring && ring.isConnected && shown(ring)) return ring
  ring = null
  return null
}

/** The first stop to show: the cookie banner's choice if it's up, else the first card, else the top bar. */
function start() {
  const list = stops()
  return (
    list.find((el) => el.closest('[data-a-target="consent-banner"]')) ??
    list.find((el) => el.matches('a[data-a-target="preview-card-image-link"], a[data-a-target="tw-box-art-card-link"]')) ??
    list[0]
  )
}

/**
 * The nearest stop in `direction`: ahead of this one, scored by how far ahead plus (twice) how far
 * off to the side. Left and right stay in the row; up and down prefer the same column but can
 * cross to the nearest one (rows of cards and the list down the left don't line up).
 */
function nearest(from, direction) {
  const a = from.getBoundingClientRect()
  const ax = a.left + a.width / 2
  const ay = a.top + a.height / 2
  let best = null
  let bestScore = Infinity
  for (const el of stops()) {
    if (el === from || el.contains(from) || from.contains(el)) continue
    const b = el.getBoundingClientRect()
    const bx = b.left + b.width / 2
    const by = b.top + b.height / 2
    let ahead, side, overlap
    if (direction === 'up' || direction === 'down') {
      ahead = direction === 'down' ? b.top - a.bottom : a.top - b.bottom
      if ((direction === 'down' ? by - ay : ay - by) <= 4) continue
      side = Math.abs(bx - ax)
      overlap = b.left < a.right && b.right > a.left
    } else {
      ahead = direction === 'right' ? b.left - a.right : a.left - b.right
      if ((direction === 'right' ? bx - ax : ax - bx) <= 4) continue
      side = Math.abs(by - ay)
      overlap = b.top < a.bottom && b.bottom > a.top
      // Along a row only: at its end the ring stays (as a TV app), not off to something level with nothing.
      if (!overlap) continue
    }
    const score = Math.max(ahead, 0) + side * 2 + (overlap ? 0 : 400)
    if (score < bestScore) {
      bestScore = score
      best = el
    }
  }
  return best
}

function move(direction) {
  const from = current()
  if (!from) return go(start())
  return go(nearest(from, direction)) || true
}

/** OK / A: the ring's link or button. On the video, back to watching it full window. */
function activate() {
  const el = current()
  if (!el) return go(start())
  if (el.matches(PLAYER)) return watch(true)
  if (el instanceof HTMLInputElement) return el.focus()
  el.click()
}

// --- Watching ----------------------------------------------------------------------------

/** A channel or a past broadcast: a page with Twitch's player on it. */
const playerPage = () => !!document.querySelector(PLAYER) && !/^\/(directory|search|settings|subscriptions|inventory|wallet|drops)/.test(location.pathname)
/** Theatre mode is on when its button offers to leave it. */
const theatreOn = () => !!document.querySelector('button[aria-label^="Exit Theatre Mode"]')
const chatOpen = () => document.querySelector(CHAT_TOGGLE)?.getAttribute('aria-label')?.match(/collapse/i)

/** The video filling the window (theatre mode, chat folded away), or the page around it again. */
let watching = false
let settle = null
function watch(on) {
  watching = on
  clearTimeout(settle)
  // A click on a player that's still setting itself up can go unheard: looked at again, a few times.
  const apply = (tries) => {
    if (watching !== on) return
    if (theatreOn() !== on) document.querySelector(THEATRE)?.click()
    if (on && chatOpen()) document.querySelector(CHAT_TOGGLE)?.click()
    if (tries > 0) settle = setTimeout(() => (theatreOn() !== on || (on && chatOpen()) ? apply(tries - 1) : undefined), 1200)
  }
  apply(3)
  if (!on) setTimeout(() => go(document.querySelector('[data-a-target="follow-button"], [data-a-target="unfollow-button"]') ?? document.querySelector(PLAYER)), 300)
  return true
}

function playerKey(action) {
  const video = document.querySelector(`${PLAYER} video`)
  if (action === 'select') document.querySelector(PLAY)?.click()
  else if (action === 'mute') document.querySelector(MUTE)?.click()
  else if (action === 'down') watch(false)
  else if ((action === 'left' || action === 'right') && video && Number.isFinite(video.duration)) {
    // A past broadcast can be skipped through; a live one can't.
    video.currentTime = Math.max(0, Math.min(video.duration - 1, video.currentTime + (action === 'left' ? -10 : 10)))
  }
  return true
}

// Twitch changes pages without loading them: a channel page arriving starts watching it.
let lastPath = ''
setInterval(() => {
  if (location.pathname === lastPath) return
  lastPath = location.pathname
  watching = false
  ring = null
  if (!playerPage()) return
  // Its player needs a moment to draw its buttons.
  let tries = 0
  const ready = setInterval(() => {
    if (document.querySelector(THEATRE) || ++tries > 20) {
      clearInterval(ready)
      if (playerPage()) watch(true)
    }
  }, 250)
}, 500)

// --- Keys (a remote's, or a controller's played as keys) ---------------------------------

function back() {
  if (history.length > 1) history.back()
  else location.assign('/')
}

window.addEventListener(
  'keydown',
  (event) => {
    const target = event.target
    // Typing in search: the arrows and Backspace are the text's.
    if ((target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) && !DIRECTIONS[event.key] && event.key !== 'Escape') return
    if ((target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) return
    const isBack = event.key === 'Escape' || event.key === 'BrowserBack' || (event.key === 'Backspace' && !(target instanceof HTMLInputElement))
    let handled = false
    if (watching && playerPage()) {
      if (isBack) handled = (back(), true)
      else if (event.key === 'Enter' || event.key === ' ') handled = playerKey('select')
      else if (DIRECTIONS[event.key]) handled = playerKey(DIRECTIONS[event.key])
    } else if (isBack) handled = (back(), true)
    else if (DIRECTIONS[event.key]) handled = move(DIRECTIONS[event.key])
    else if (event.key === 'Enter' && current()) handled = (activate(), true)
    if (handled) {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
  },
  true
)

// --- A controller ------------------------------------------------------------------------
//
// As in Netflix: with no Steam Input layout for the shortcut, Chrome sees a gamepad and no keys, so
// the controller is read here. A layout that sends keys hides the gamepad, so nothing happens twice.

const PAD = { a: 0, b: 1, y: 3, up: 12, down: 13, left: 14, right: 15 }
const STICK = 0.6
const REPEAT_DELAY_MS = 400
const REPEAT_MS = 130
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
    y: button(PAD.y)
  }
  for (const [name, down] of Object.entries(state)) {
    if (!down) {
      held.delete(name)
      continue
    }
    const since = held.get(name)
    const repeats = !['a', 'b', 'y'].includes(name)
    if (since === undefined) held.set(name, { next: now + REPEAT_DELAY_MS })
    else if (!repeats || now < since.next) continue
    else since.next = now + REPEAT_MS
    const onVideo = watching && playerPage()
    if (name === 'a') onVideo ? playerKey('select') : activate()
    else if (name === 'b') back()
    else if (name === 'y') onVideo && playerKey('mute')
    else if (onVideo) playerKey(name)
    else move(name)
  }
}

requestAnimationFrame(pollPad)
