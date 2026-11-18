import { barShown, buttonsOf, menuColumns, menuRows, SKIP_S, type PlayerButtonId, type PlayerShortcut, type PlayerState } from './playerUi'
import { glyphDrawing } from './buttonGlyphs'

// Draws the mpv player's controls (playerUi.ts) as ASS for mpv's osd-overlay, on a 1920×1080
// canvas mpv scales to the screen: the page player's look (MediaPlayer.tsx and app.css) redrawn
// in vaporTV's fonts and colours. The bar fades up from the bottom over a dark gradient: the
// title, the seek bar, and the round buttons (the one with the cursor ringed in gold, its name
// under it). Audio & subtitles is a glass panel in the lower right. Each line returned is one ASS
// event; shapes are ASS drawings (\p1), the icons' strokes are outlines of zero-width paths.

export const OSD_W = 1920
export const OSD_H = 1080

export interface OsdFonts {
  /** Headings and the title (Marvin Visions where the build has it, else Tilt Warp). */
  display: string
  /** Everything else (Bricolage Grotesque). */
  body: string
  /**
   * Its ExtraBold, by the face's full name: libass picks a face by family and ignores \\b's
   * weight between these two files (they share a family name), so bold is asked for by name.
   */
  bodyBold: string
}

const ACCENT = 0xee960d
const ACCENT_LINE = 0xfca10f
const WHITE = 0xffffff
const BLACK = 0x000000
const PANEL = 0x1f1812

const PAD_X = 72
const BUTTONS_Y = OSD_H - 72 - 56
const SEEK_Y = BUTTONS_Y - 56 - 18 - 23
const TITLE_Y = SEEK_Y - 23 - 18 - 20
const GRADIENT_TOP = TITLE_Y - 150

/** ASS colour: &HBBGGRR&. */
function colour(rgb: number): string {
  const hex = (n: number): string => n.toString(16).padStart(2, '0').toUpperCase()
  return `&H${hex(rgb & 0xff)}${hex((rgb >> 8) & 0xff)}${hex((rgb >> 16) & 0xff)}&`
}

/** ASS alpha from an opacity (1 solid, 0 clear): &H00& is solid. */
function alpha(opacity: number): string {
  return `&H${Math.round((1 - Math.max(0, Math.min(1, opacity))) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase()}&`
}

const n = (v: number): string => String(Math.round(v * 10) / 10)

/** Text as ASS shows it literally: braces would start overrides, a backslash an escape. */
export function assText(text: string): string {
  return text.replace(/\\/g, '⧵').replace(/\{/g, '(').replace(/\}/g, ')').replace(/[\r\n]+/g, ' ')
}

/** Cut to about `width` px at `size` px, with an ellipsis (an estimate: ASS can't measure). */
export function fit(text: string, width: number, size: number, perChar = 0.56): string {
  const max = Math.max(1, Math.floor(width / (size * perChar)))
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}

const BASE = '\\bord0\\shad0\\blur0\\fsp0\\frz0'

/**
 * Each font's full line height (OS/2 winAscent + winDescent) in ems. libass makes that, not the em,
 * the size asked for, so the same number comes out smaller than the page's CSS px: Bricolage by
 * 1.56 (text meant to be 22 px was 14). Sizes here are the page's px, converted with this.
 */
const LINE_HEIGHT: Record<string, number> = {
  'Marvin Visions Big Bold': 1.2,
  'Tilt Warp': 1.608,
  'Bricolage Grotesque 96pt ExtraBold': 1.56,
  'Bricolage Grotesque 96pt ExtraBold ExtraBold': 1.56
}

/** The ASS \\fs for a font at the page's `px`. */
export function assSize(font: string, px: number): number {
  return Math.round(px * (LINE_HEIGHT[font] ?? 1))
}

/** A filled shape: `path` in ASS drawing commands, at absolute canvas positions. */
function shape(path: string, rgb: number, opacity: number, extra = ''): string {
  return `{\\an7\\pos(0,0)${BASE}\\1c${colour(rgb)}\\1a${alpha(opacity)}${extra}\\p1}${path}{\\p0}`
}

function roundRect(x: number, y: number, w: number, h: number, r: number): string {
  r = Math.min(r, w / 2, h / 2)
  const k = r * 0.4477 // 1 - 0.5523: how far in a bezier's control points sit for a quarter circle
  return [
    `m ${n(x + r)} ${n(y)}`,
    `l ${n(x + w - r)} ${n(y)}`,
    `b ${n(x + w - k)} ${n(y)} ${n(x + w)} ${n(y + k)} ${n(x + w)} ${n(y + r)}`,
    `l ${n(x + w)} ${n(y + h - r)}`,
    `b ${n(x + w)} ${n(y + h - k)} ${n(x + w - k)} ${n(y + h)} ${n(x + w - r)} ${n(y + h)}`,
    `l ${n(x + r)} ${n(y + h)}`,
    `b ${n(x + k)} ${n(y + h)} ${n(x)} ${n(y + h - k)} ${n(x)} ${n(y + h - r)}`,
    `l ${n(x)} ${n(y + r)}`,
    `b ${n(x)} ${n(y + k)} ${n(x + k)} ${n(y)} ${n(x + r)} ${n(y)}`
  ].join(' ')
}

const circle = (cx: number, cy: number, r: number): string => roundRect(cx - r, cy - r, r * 2, r * 2, r)

/** A ring `width` px wide, its middle on radius `r`: the outline of a path round and back, so nothing inside is filled. */
function ring(cx: number, cy: number, r: number, width: number, rgb: number): string {
  const points = Array.from({ length: 49 }, (_, i) => `${n(cx + r * Math.cos((i * Math.PI) / 24))} ${n(cy + r * Math.sin((i * Math.PI) / 24))}`)
  const path = `m ${points[0]} l ${[...points.slice(1), ...points.slice(0, -1).reverse()].join(' ')}`
  return `{\\an7\\pos(0,0)${BASE}\\bord${n(width / 2)}\\1a&HFF&\\3c${colour(rgb)}\\3a&H00&\\p1}${path}{\\p0}`
}

function text(x: number, y: number, align: number, font: string, size: number, rgb: number, body: string, extra = ''): string {
  return `{\\an${align}\\pos(${n(x)},${n(y)})${BASE}\\fn${font}\\fs${assSize(font, size)}\\1c${colour(rgb)}\\1a&H00&${extra}}${assText(body)}`
}

// ── Icons: the page player's (PlayerControls ICONS), on the same 24-unit box. ──

type Point = [number, number]
interface Icon {
  /** Solid polygons. */
  fills: Point[][]
  /** Lines drawn 1.8 units wide with round ends. */
  strokes: Point[][]
  /** The seconds inside the skip arrows. */
  label?: string
}

/** Points along a circle (centre 12,12) from one angle to another, in degrees (y down). */
function arc(r: number, from: number, to: number, steps = 28): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = ((from + ((to - from) * i) / steps) * Math.PI) / 180
    return [12 + r * Math.cos(a), 12 + r * Math.sin(a)] as Point
  })
}

function roundRectPoints(x: number, y: number, w: number, h: number, r: number): Point[] {
  const corner = (cx: number, cy: number, from: number): Point[] =>
    Array.from({ length: 7 }, (_, i) => {
      const a = ((from + i * 15) * Math.PI) / 180
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Point
    })
  return [...corner(x + w - r, y + r, -90), ...corner(x + w - r, y + h - r, 0), ...corner(x + r, y + h - r, 90), ...corner(x + r, y + r, 180), [x + w - r, y]]
}

function circlePoints(cx: number, cy: number, r: number): Point[] {
  return Array.from({ length: 12 }, (_, i) => [cx + r * Math.cos((i * Math.PI) / 6), cy + r * Math.sin((i * Math.PI) / 6)] as Point)
}

export const ICONS: Record<'stop' | 'play' | 'pause' | 'back' | 'on' | 'subtitles' | 'check' | 'controller', Icon> = {
  stop: { fills: [roundRectPoints(6, 6, 12, 12, 1.5)], strokes: [] },
  play: { fills: [[[8, 5.5], [8, 18.5], [18.5, 12]]], strokes: [] },
  pause: {
    fills: [
      [[7.5, 5.5], [10.5, 5.5], [10.5, 18.5], [7.5, 18.5]],
      [[13.5, 5.5], [16.5, 5.5], [16.5, 18.5], [13.5, 18.5]]
    ],
    strokes: []
  },
  // M4 12 a8 8 0 1 0 2.4-5.7 (round the bottom, anticlockwise) and the arrowhead M4 4v4h4.
  back: { fills: [], strokes: [arc(8, 180, -134.5), [[4, 4], [4, 8], [8, 8]]], label: String(SKIP_S) },
  on: { fills: [], strokes: [arc(8, 0, 314.5), [[20, 4], [20, 8], [16, 8]]], label: String(SKIP_S) },
  subtitles: {
    fills: [],
    strokes: [
      roundRectPoints(3, 5.5, 18, 13, 2),
      [[7, 14.5], [11, 14.5]],
      [[13, 14.5], [17, 14.5]],
      [[7, 11], [9, 11]],
      [[11, 11], [17, 11]]
    ]
  },
  check: { fills: [], strokes: [[[5, 12.5], [10, 17], [19, 7]]] },
  // The page's controller icon, simplified: the body, the D-pad's cross, two face buttons.
  controller: {
    fills: [circlePoints(15.6, 11.8, 0.7), circlePoints(17, 13.2, 0.7)],
    strokes: [
      roundRectPoints(3, 8.5, 18, 9.5, 4),
      [[8, 11.2], [8, 13.8]],
      [[6.7, 12.5], [9.3, 12.5]]
    ]
  }
}

/** An icon centred on (cx, cy), `size` px across. */
function icon(which: Icon, cx: number, cy: number, size: number, rgb: number, fonts: OsdFonts, opacity = 1): string[] {
  const scale = size / 24
  const at = ([x, y]: Point): string => `${n(cx + (x - 12) * scale)} ${n(cy + (y - 12) * scale)}`
  const lines: string[] = []
  for (const polygon of which.fills) {
    lines.push(shape(`m ${at(polygon[0])} l ${polygon.slice(1).map(at).join(' ')}`, rgb, opacity))
  }
  for (const line of which.strokes) {
    // There and back again: a path with no area, whose outline (\bord) is the stroke.
    const path = `m ${at(line[0])} l ${[...line.slice(1), ...line.slice(0, -1).reverse()].map(at).join(' ')}`
    lines.push(`{\\an7\\pos(0,0)${BASE}\\bord${n((1.8 * scale) / 2)}\\1a&HFF&\\3c${colour(rgb)}\\3a${alpha(opacity)}\\p1}${path}{\\p0}`)
  }
  if (which.label) lines.push(text(cx, cy + 1.5 * scale, 5, fonts.bodyBold, Math.round(7 * scale), rgb, which.label))
  return lines
}

const BUTTON_ICON: Record<PlayerButtonId, (paused: boolean) => Icon> = {
  stop: () => ICONS.stop,
  back: () => ICONS.back,
  playPause: (paused) => (paused ? ICONS.play : ICONS.pause),
  on: () => ICONS.on,
  tracks: () => ICONS.subtitles,
  keys: () => ICONS.controller
}

const BUTTON_LABEL: Record<PlayerButtonId, (paused: boolean) => string> = {
  stop: () => 'Stop',
  back: () => `Back ${SKIP_S} seconds`,
  playPause: (paused) => (paused ? 'Play' : 'Pause'),
  on: () => `On ${SKIP_S} seconds`,
  tracks: () => 'Audio & subtitles',
  keys: () => 'Controller shortcuts'
}

/** "1:02:05", "4:09". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

/** Where each button's centre is, and its radius: Stop at the left, Audio & subtitles at the right, the rest in the middle. */
function buttonLayout(buttons: PlayerButtonId[]): Map<PlayerButtonId, { x: number; r: number }> {
  const at = new Map<PlayerButtonId, { x: number; r: number }>()
  at.set('stop', { x: PAD_X + 42, r: 42 })
  at.set('back', { x: OSD_W / 2 - 56 - 32 - 42, r: 42 })
  at.set('playPause', { x: OSD_W / 2, r: 56 })
  at.set('on', { x: OSD_W / 2 + 56 + 32 + 42, r: 42 })
  // The controller button at the right end, Audio & subtitles beside it.
  at.set('keys', { x: OSD_W - PAD_X - 42, r: 42 })
  if (buttons.includes('tracks')) at.set('tracks', { x: OSD_W - PAD_X - 42 - 84 - 24, r: 42 })
  return at
}

function bar(state: PlayerState, now: number, fonts: OsdFonts): string[] {
  const lines: string[] = []
  // The gradient: layers that all reach the bottom, each starting a little lower, so the dark
  // builds up smoothly (clear at the top, about 85% black at the bottom) with no seams between them.
  const layers = 40
  const each = 1 - Math.pow(0.15, 1 / layers)
  for (let i = 0; i < layers; i++) {
    const y = GRADIENT_TOP + ((OSD_H - GRADIENT_TOP) * i) / layers
    lines.push(shape(`m 0 ${n(y)} l ${OSD_W} ${n(y)} ${OSD_W} ${OSD_H} 0 ${OSD_H}`, BLACK, each))
  }

  // Title, and the episode on the right.
  const subtitleWidth = state.subtitle ? Math.min(640, state.subtitle.length * 20 * 0.55 + 24) : 0
  lines.push(text(PAD_X, TITLE_Y, 4, fonts.display, 32, WHITE, fit(state.title, OSD_W - PAD_X * 2 - subtitleWidth, 32, 0.66), '\\fsp1.3'))
  if (state.subtitle) lines.push(text(OSD_W - PAD_X, TITLE_Y, 6, fonts.body, 20, WHITE, fit(state.subtitle, 620, 20)))

  // The seek bar: times either side, the track between.
  const onSeek = state.row === 'seek' && !state.menu
  const scrubbing = state.scrub !== null
  const length = state.duration
  const at = state.position
  const shownAt = state.scrub?.to ?? at
  const left = clock(shownAt)
  const right = clock(length)
  const slot = Math.max(left.length, right.length) * 11.5
  lines.push(text(PAD_X, SEEK_Y, 4, scrubbing ? fonts.bodyBold : fonts.body, 20, scrubbing ? ACCENT : WHITE, left))
  lines.push(text(OSD_W - PAD_X, SEEK_Y, 6, fonts.body, 20, WHITE, right))
  const x0 = PAD_X + slot + 24
  const x1 = OSD_W - PAD_X - slot - 24
  const width = x1 - x0
  const h = scrubbing ? 12 : onSeek ? 10 : 6
  const frac = (t: number): number => (length > 0 ? Math.max(0, Math.min(1, t / length)) : 0)
  lines.push(shape(roundRect(x0, SEEK_Y - h / 2, width, h, h / 2), WHITE, 0.2))
  if (frac(at) > 0) lines.push(shape(roundRect(x0, SEEK_Y - h / 2, Math.max(h, width * frac(at)), h, h / 2), ACCENT, 1))
  if (state.scrub && length > 0) {
    const a = x0 + width * frac(Math.min(state.scrub.to, at))
    const b = x0 + width * frac(Math.max(state.scrub.to, at))
    if (b - a > 1) lines.push(shape(roundRect(a, SEEK_Y - h / 2, b - a, h, h / 2), ACCENT, 0.45))
  }
  const head = x0 + width * frac(at)
  if (onSeek) {
    lines.push(shape(circle(head, SEEK_Y, 17), ACCENT, 1))
    lines.push(shape(circle(head, SEEK_Y, 13), WHITE, 1))
  } else {
    lines.push(shape(circle(head, SEEK_Y, 10), BLACK, 0.35, '\\blur3'))
    lines.push(shape(circle(head, SEEK_Y, 9), WHITE, 1))
  }
  if (state.scrub && length > 0) {
    const mark = x0 + width * frac(state.scrub.to)
    lines.push(shape(circle(mark, SEEK_Y, 17), 0x060408, 0.55))
    lines.push(shape(circle(mark, SEEK_Y, 13), ACCENT, 1))
  }

  // The buttons.
  const buttons = buttonsOf(state)
  const layout = buttonLayout(buttons)
  for (const id of buttons) {
    const place = layout.get(id)!
    const focused = state.row === 'buttons' && state.button === id && !state.menu
    const r = place.r * (focused ? 1.1 : 1)
    if (focused) {
      // The page's focus: a 3 px gold ring round a faint gold tint (the video shows through).
      lines.push(shape(circle(place.x, BUTTONS_Y, r - 3), ACCENT, 0.15))
      lines.push(ring(place.x, BUTTONS_Y, r - 1.5, 3, ACCENT_LINE))
    } else lines.push(shape(circle(place.x, BUTTONS_Y, r), WHITE, 0.1))
    const size = (place.r === 56 ? 56 : 44) * (focused ? 1.1 : 1)
    const pressed = (id === 'tracks' && state.menu !== null) || (id === 'keys' && state.keysShown)
    lines.push(...icon(BUTTON_ICON[id](state.paused), place.x, BUTTONS_Y, size, pressed ? ACCENT : WHITE, fonts))
    if (focused) {
      // Its name under it; the end buttons' names line up with the screen edge.
      const label = BUTTON_LABEL[id](state.paused)
      const y = BUTTONS_Y + r + 10
      const first = id === buttons[0]
      const last = id === buttons[buttons.length - 1] && id !== 'on'
      if (first) lines.push(text(place.x - place.r, y, 7, fonts.body, 24, WHITE, label))
      else if (last) lines.push(text(place.x + place.r, y, 9, fonts.body, 24, WHITE, label))
      else lines.push(text(place.x, y, 8, fonts.body, 24, WHITE, label))
    }
  }
  return lines
}

const MENU_COLUMN_W = 480
const MENU_ROW_H = 64
const MENU_GAP = 8
const MENU_PAD = 28
const MENU_HEADING_H = 56
const MENU_VISIBLE = 7

function menu(state: PlayerState, fonts: OsdFonts): string[] {
  if (!state.menu) return []
  const columns = menuColumns(state)
  const lines: string[] = []
  const rowsShown = Math.min(MENU_VISIBLE, Math.max(...columns.map((c) => menuRows(state, c).length)))
  const w = columns.length * MENU_COLUMN_W + (columns.length - 1) * 24 + MENU_PAD * 2
  const h = MENU_PAD * 2 + MENU_HEADING_H + rowsShown * (MENU_ROW_H + MENU_GAP) - MENU_GAP
  const x = OSD_W - 48 - w
  const y = OSD_H - 48 - h
  lines.push(shape(roundRect(x + 4, y + 30, w - 8, h, 28), BLACK, 0.5, '\\blur30'))
  lines.push(shape(roundRect(x, y, w, h, 28), PANEL, 0.92))
  columns.forEach((column, c) => {
    const cx = x + MENU_PAD + c * (MENU_COLUMN_W + 24)
    lines.push(text(cx + 24, y + MENU_PAD + 20, 4, fonts.display, 32, WHITE, column === 'audio' ? 'Audio' : 'Subtitles', '\\fsp1'))
    const rows = menuRows(state, column)
    const focusedRow = state.menu!.column === column ? state.menu!.row : -1
    // Scrolled so the row with the cursor (or the one ticked) is in view.
    const keep = focusedRow >= 0 ? focusedRow : Math.max(0, rows.findIndex((r) => r.checked))
    const first = Math.max(0, Math.min(rows.length - MENU_VISIBLE, keep - MENU_VISIBLE + 2))
    rows.slice(first, first + MENU_VISIBLE).forEach((row, i) => {
      const ry = y + MENU_PAD + MENU_HEADING_H + i * (MENU_ROW_H + MENU_GAP)
      const focused = first + i === focusedRow
      if (focused) lines.push(shape(roundRect(cx, ry, MENU_COLUMN_W, MENU_ROW_H, 16), ACCENT, 0.4))
      lines.push(text(cx + 24, ry + MENU_ROW_H / 2, 4, fonts.bodyBold, 24, WHITE, fit(row.name, MENU_COLUMN_W - 24 - 64, 24)))
      if (row.checked) lines.push(...icon(ICONS.check, cx + MENU_COLUMN_W - 36, ry + MENU_ROW_H / 2, 30, focused ? WHITE : ACCENT, fonts))
    })
    if (first > 0) lines.push(text(cx + MENU_COLUMN_W / 2, y + MENU_PAD + MENU_HEADING_H - 6, 2, fonts.body, 18, WHITE, '▲', '\\1a&H60&'))
    if (first + MENU_VISIBLE < rows.length) lines.push(text(cx + MENU_COLUMN_W / 2, y + h - 6, 2, fonts.body, 18, WHITE, '▼', '\\1a&H60&'))
  })
  return lines
}

/** The pictures' size in the shortcuts, as the page's hints (.files-hint .control-icon); the bumpers' band is wider. */
const KEY_ICON = 40
const KEY_ICON_WIDE = 60

/** The controller button's panel: every shortcut (the buttons' pictures, then what they do), over the video's lower right, on the menus' glass. */
function shortcuts(state: PlayerState, fonts: OsdFonts): string[] {
  if (!state.keysShown || !state.shortcuts.length) return []
  const lines: string[] = []
  const rowH = KEY_ICON
  const gap = 18
  const iconWidth = (icon: PlayerShortcut['icons'][number]): number => ('text' in icon ? icon.text.length * 13 + 16 : icon.wide ? KEY_ICON_WIDE : KEY_ICON)
  const iconsWidth = (s: PlayerShortcut): number => s.icons.reduce((w, icon) => w + iconWidth(icon), 0) + (s.icons.length - 1) * 4
  const keysW = Math.max(...state.shortcuts.map(iconsWidth))
  const textW = Math.max(...state.shortcuts.map((s) => s.what.length)) * 20 * 0.52
  const w = 36 * 2 + keysW + 10 + textW
  const h = 28 * 2 + 40 + 4 + gap + state.shortcuts.length * (rowH + gap) - gap
  const x = OSD_W - PAD_X - w
  const y = OSD_H - 340 - h
  lines.push(shape(roundRect(x + 4, y + 30, w - 8, h, 28), BLACK, 0.5, '\\blur30'))
  lines.push(shape(roundRect(x, y, w, h, 28), PANEL, 0.92))
  lines.push(text(x + 36, y + 28 + 20, 4, fonts.display, 32, WHITE, 'Shortcuts', '\\fsp1'))
  state.shortcuts.forEach((s, i) => {
    const top = y + 28 + 40 + 4 + gap + i * (rowH + gap)
    let ix = x + 36
    for (const icon of s.icons) {
      const iw = iconWidth(icon)
      if ('text' in icon) {
        lines.push(shape(roundRect(ix, top + 6, iw, rowH - 12, (rowH - 12) / 2), WHITE, 0.14))
        lines.push(text(ix + iw / 2, top + rowH / 2, 5, fonts.bodyBold, 18, WHITE, icon.text))
      } else {
        // A bumper's picture is a band across a square: drawn square, cut to the band.
        const size = icon.wide ? iw : KEY_ICON
        const drawn = glyphDrawing(icon.name, ix, top + rowH / 2 - size / 2, size)
        const clip = icon.wide ? `\\clip(${n(ix)},${n(top)},${n(ix + iw)},${n(top + rowH)})` : ''
        if (drawn?.fill) lines.push(shape(drawn.fill, WHITE, 1, clip))
        for (const stroke of drawn?.strokes ?? []) {
          lines.push(`{\\an7\\pos(0,0)${BASE}\\bord${n(stroke.width / 2)}\\1a&HFF&\\3c${colour(WHITE)}\\3a&H00&${clip}\\p1}${stroke.path}{\\p0}`)
        }
        if (icon.mark) lines.push(text(ix + iw + 4, top + rowH + 2, 3, fonts.bodyBold, 16, WHITE, icon.mark))
      }
      ix += iw + 4
    }
    lines.push(text(x + 36 + keysW + 10, top + rowH / 2, 4, fonts.body, 20, WHITE, s.what))
  })
  return lines
}

/** The spinner: a gold quarter going round a faint ring. */
function spinner(now: number): string[] {
  const r = 34
  const cx = OSD_W / 2
  const cy = OSD_H / 2
  const ring: Point[] = arc(r, 0, 360, 48).map(([px, py]) => [px - 12 + cx, py - 12 + cy])
  const sweep: Point[] = arc(r, 0, 100, 16).map(([px, py]) => [px - 12 + cx, py - 12 + cy])
  const angle = (now / 2.6) % 360
  const path = (points: Point[]): string => `m ${points.map(([px, py]) => `${n(px)} ${n(py)}`).join(' l ')} l ${points.slice(0, -1).reverse().map(([px, py]) => `${n(px)} ${n(py)}`).join(' ')}`
  return [
    `{\\an7\\pos(0,0)${BASE}\\bord3\\1a&HFF&\\3c${colour(WHITE)}\\3a${alpha(0.18)}\\p1}${path(ring)}{\\p0}`,
    `{\\an7\\pos(0,0)\\org(${cx},${cy})${BASE}\\frz${n(-angle)}\\bord3.5\\1a&HFF&\\3c${colour(ACCENT)}\\3a&H00&\\p1}${path(sweep)}{\\p0}`
  ]
}

/** Everything on screen now, as ASS events (one a line); empty when nothing's showing. */
export function renderOsd(state: PlayerState, now: number, fonts: OsdFonts): string {
  const lines: string[] = []
  if (barShown(state, now) || state.menu) lines.push(...bar(state, now, fonts))
  if (state.loading) lines.push(...spinner(now))
  const middle = state.skipped
    ? `${state.skipped.by < 0 ? 'Rewinding' : 'Fast-forwarding'} ${Math.abs(state.skipped.by)} seconds`
    : state.note?.text
  if (middle) lines.push(text(OSD_W / 2, OSD_H / 2 + (state.loading ? 80 : 0), 5, fonts.display, 36, WHITE, middle, '\\bord2\\3c&H000000&\\3a&H80&\\blur4\\fsp1'))
  lines.push(...shortcuts(state, fonts))
  lines.push(...menu(state, fonts))
  return lines.join('\n')
}
