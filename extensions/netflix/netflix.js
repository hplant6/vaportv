// vaporTV for Netflix: the D-pad (arrow keys) moves between titles on Netflix's
// website, as on a TV. Netflix's own keyboard support stops at Tab; Chrome's spatial
// navigation gets caught in its hover previews and moves behind its info panel.
//
// Left/right go along a row (paging it with Netflix's own arrow at the ends), up/down
// go to the nearest title in the row above or below, with the billboard's buttons and
// the top menu above the first row. While a title's info panel is open the arrows stay
// inside it. The video player keeps its own keys.

const CARD = 'a[data-uia$="-card"], .title-card-container a.slider-refocus'
const ROW = 'section.carousel-row, .lolomoRow, .rowContainer, .row-with-x-columns'
const BILLBOARD = '[data-uia="play-video-button"], [data-uia="billboard-more-info"]'
const MENU = 'a[data-uia^="nav-"], [data-uia="navigation+actions+search+icon"], [data-uia="navigation+profile-menu+trigger"]'
const PANEL = '[role="dialog"][data-uia^="modal-motion-container-DETAIL"]'
// Links off to help pages and within the panel ("more") aren't worth a stop.
const IN_PANEL = 'a[href^="/"], button, [role="button"], [tabindex="0"]:not(a)'
const PAGE_NEXT = '[data-uia="carousel-hawkins-right-button"], .handleNext'
const PAGE_PREV = '[data-uia="carousel-hawkins-left-button"], .handlePrev'
/** How long a row takes to slide along after its arrow is pressed. */
const PAGE_MS = 700

const DIRECTIONS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }

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
    if (event.key === 'F9') return dump()
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
    if (event.key === 'F8') {
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
