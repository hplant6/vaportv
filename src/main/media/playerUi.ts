import type { ButtonIconName } from '../../shared/buttonIcons'

// What the mpv player's on-screen controls do, apart from drawing them (playerOsd.ts) and from mpv
// (externalPlayer.ts): the same controls as the page's player (MediaPlayer.tsx). The bar has two
// rows the cursor moves between: the buttons, where it starts (stop, back 10, play/pause, on 10,
// audio & subtitles; D-pad left and right move along them), and, D-pad up, the seek bar (A plays
// or pauses, left and right scrub; down goes back to the buttons).
// The triggers skip back or on 10 seconds, Y opens Audio & subtitles, B closes that or stops.
// Pure: `now` comes in, and what mpv should do comes back as commands.

export type PlayerInput =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'select'
  | 'back'
  | 'tracks'
  | 'skipBack'
  | 'skipOn'
  | 'playPause'
  | 'stop'

export type PlayerCommand =
  | { seek: number }
  | { pause: boolean }
  | { audio: number }
  | { subtitle: number | null }
  | { stop: true }

export interface PlayerTrack {
  /** mpv's track id (aid / sid). */
  id: number
  name: string
}

export type PlayerButtonId = 'stop' | 'back' | 'playPause' | 'on' | 'tracks' | 'keys'

export interface PlayerState {
  title: string
  subtitle: string
  position: number
  duration: number
  paused: boolean
  /** Opening, buffering or catching up after a jump. */
  loading: boolean
  audio: PlayerTrack[]
  subtitles: PlayerTrack[]
  /** The tracks playing (subtitle null: none). */
  aid: number | null
  sid: number | null
  /** The bar shows until then (ms), and always while paused. */
  barUntil: number
  row: 'seek' | 'buttons'
  button: PlayerButtonId
  /** Audio & subtitles: the column and row the cursor's on. */
  menu: { column: 'audio' | 'subtitles'; row: number } | null
  /** Where a scrub has the marker, until the presses stop and it jumps there. */
  scrub: { to: number; settleAt: number; streak: number; lastAt: number } | null
  /** A trigger's skip, said in the middle for a moment: seconds back (negative) or on. */
  skipped: { by: number; until: number } | null
  /** A short line in the middle ("This has no other audio or subtitles"). */
  note: { text: string; until: number } | null
  /** The controller button's panel: every shortcut, by the buttons' names on the controller in use. */
  keysShown: boolean
  shortcuts: PlayerShortcut[]
}

/** A line of the shortcuts panel: the buttons' pictures (or their names, without one), and what they do. */
export interface PlayerShortcut {
  icons: ({ name: ButtonIconName; wide?: boolean; mark?: string } | { text: string })[]
  what: string
}

export const SKIP_S = 10
const SCRUB_SHARE = 1 / 120
const SCRUB_MIN_S = 10
const SCRUB_FASTEST = 4
const SCRUB_SETTLE_MS = 700
const SCRUB_STREAK_MS = 400
const BAR_MS = 3500
/** The cursor on the buttons: the bar stays up longer, as something's being picked. */
const BUTTONS_BAR_MS = 8000
const SKIPPED_MS = 1400
const NOTE_MS = 2500

export function initialState(title: string, subtitle: string, now: number): PlayerState {
  return {
    title,
    subtitle,
    position: 0,
    duration: 0,
    paused: false,
    loading: true,
    audio: [],
    subtitles: [],
    aid: null,
    sid: null,
    barUntil: now + BAR_MS,
    row: 'buttons',
    button: 'playPause',
    menu: null,
    scrub: null,
    skipped: null,
    note: null,
    keysShown: false,
    shortcuts: []
  }
}

/** The buttons along the bottom row, in order. */
export function buttonsOf(state: PlayerState): PlayerButtonId[] {
  return hasTracks(state) ? ['stop', 'back', 'playPause', 'on', 'tracks', 'keys'] : ['stop', 'back', 'playPause', 'on', 'keys']
}

export function hasTracks(state: PlayerState): boolean {
  return state.audio.length > 1 || state.subtitles.length > 0
}

export function barShown(state: PlayerState, now: number): boolean {
  return state.paused || now < state.barUntil || state.scrub !== null
}

/** The menu's columns: Audio when there's any, Subtitles always (it has Off). */
export function menuColumns(state: PlayerState): ('audio' | 'subtitles')[] {
  return state.audio.length ? ['audio', 'subtitles'] : ['subtitles']
}

/** A column's rows: its tracks, and for subtitles Off first. id null is Off. */
export function menuRows(state: PlayerState, column: 'audio' | 'subtitles'): { id: number | null; name: string; checked: boolean }[] {
  if (column === 'audio') return state.audio.map((t) => ({ id: t.id, name: t.name, checked: t.id === state.aid }))
  return [{ id: null, name: 'Off', checked: state.sid === null }, ...state.subtitles.map((t) => ({ id: t.id, name: t.name, checked: t.id === state.sid }))]
}

function showBar(state: PlayerState, now: number): PlayerState {
  return { ...state, barUntil: now + (state.row === 'buttons' ? BUTTONS_BAR_MS : BAR_MS) }
}

const clampTime = (state: PlayerState, at: number): number => Math.max(0, Math.min(Math.max(0, state.duration - 1), at))

function skip(state: PlayerState, by: number, now: number): [PlayerState, PlayerCommand[]] {
  const was = state.skipped && now < state.skipped.until ? state.skipped.by : 0
  const total = Math.sign(was) === Math.sign(by) ? was + by : by
  const to = clampTime(state, (state.scrub?.to ?? state.position) + by)
  return [{ ...showBar(state, now), position: to, scrub: null, skipped: { by: total, until: now + SKIPPED_MS } }, [{ seek: to }]]
}

function openMenu(state: PlayerState, now: number): PlayerState {
  if (!hasTracks(state)) return { ...state, note: { text: 'This has no other audio or subtitles', until: now + NOTE_MS } }
  // The cursor starts on the audio track playing (or the first row).
  const column = menuColumns(state)[0]
  const row = Math.max(0, menuRows(state, column).findIndex((r) => r.checked))
  return { ...state, menu: { column, row } }
}

function press(state: PlayerState, button: PlayerButtonId, now: number): [PlayerState, PlayerCommand[]] {
  switch (button) {
    case 'stop':
      return [state, [{ stop: true }]]
    case 'back':
      return skip(state, -SKIP_S, now)
    case 'on':
      return skip(state, SKIP_S, now)
    case 'playPause':
      return [showBar({ ...state, paused: !state.paused }, now), [{ pause: !state.paused }]]
    case 'tracks':
      return [openMenu({ ...state, keysShown: false }, now), []]
    case 'keys':
      return [showBar({ ...state, keysShown: !state.keysShown }, now), []]
  }
}

/** One press: the new state and what mpv should do. */
export function handle(state: PlayerState, input: PlayerInput, now: number): [PlayerState, PlayerCommand[]] {
  // Audio & subtitles open: it has the cursor.
  if (state.menu) {
    const { column, row } = state.menu
    const columns = menuColumns(state)
    const rows = menuRows(state, column)
    switch (input) {
      case 'up':
      case 'down': {
        const next = Math.max(0, Math.min(rows.length - 1, row + (input === 'down' ? 1 : -1)))
        return [{ ...state, menu: { column, row: next } }, []]
      }
      case 'left':
      case 'right': {
        const next = columns[columns.indexOf(column) + (input === 'right' ? 1 : -1)]
        if (!next) return [state, []]
        const nextRows = menuRows(state, next)
        return [{ ...state, menu: { column: next, row: Math.min(row, nextRows.length - 1) } }, []]
      }
      case 'select': {
        const picked = rows[row]
        const closed = { ...state, menu: null, row: 'buttons' as const, button: 'tracks' as const }
        if (!picked) return [closed, []]
        if (column === 'audio') return [{ ...closed, aid: picked.id }, picked.id === state.aid ? [] : [{ audio: picked.id! }]]
        return [{ ...closed, sid: picked.id }, picked.id === state.sid ? [] : [{ subtitle: picked.id }]]
      }
      case 'back':
      case 'tracks':
        return [{ ...state, menu: null, row: 'buttons', button: 'tracks' }, []]
      case 'stop':
        return [state, [{ stop: true }]]
      case 'playPause':
        return press(state, 'playPause', now)
      case 'skipBack':
        return skip(state, -SKIP_S, now)
      case 'skipOn':
        return skip(state, SKIP_S, now)
    }
  }

  const hidden = !barShown(state, now)
  if (input === 'back' && state.keysShown) return [{ ...state, keysShown: false }, []]
  switch (input) {
    case 'back':
    case 'stop':
      return [state, [{ stop: true }]]
    case 'tracks':
      return [openMenu({ ...state, keysShown: false }, now), []]
    case 'skipBack':
      return skip(state, -SKIP_S, now)
    case 'skipOn':
      return skip(state, SKIP_S, now)
    case 'playPause':
      return press(state, 'playPause', now)
    case 'select':
      // With the bar hidden, A plays or pauses (and shows the bar, on play/pause).
      if (hidden) return press({ ...state, row: 'buttons', button: 'playPause' }, 'playPause', now)
      if (state.row === 'buttons') return press(state, state.button, now)
      return press(state, 'playPause', now)
    case 'up':
    case 'down':
      // The first press with the bar hidden shows it: up on the seek bar, down on the buttons.
      if (hidden) return [showBar(input === 'up' ? { ...state, row: 'seek' } : { ...state, row: 'buttons', button: 'playPause' }, now), []]
      if (input === 'up') return [showBar({ ...state, row: 'seek' }, now), []]
      return [showBar(state.row === 'seek' ? { ...state, row: 'buttons', button: 'playPause' } : state, now), []]
    case 'left':
    case 'right': {
      // The first press with the bar hidden shows it, the cursor on play/pause.
      if (hidden) return [showBar({ ...state, row: 'buttons', button: 'playPause' }, now), []]
      if (state.row === 'buttons') {
        const buttons = buttonsOf(state)
        const next = buttons[buttons.indexOf(state.button) + (input === 'right' ? 1 : -1)]
        return [showBar(next ? { ...state, button: next } : state, now), []]
      }
      // Scrub: each press moves the marker (a share of the video, at least SCRUB_MIN_S), faster
      // the longer it's held; it jumps there once the presses stop.
      const s = state.scrub
      const streak = s && now - s.lastAt < SCRUB_STREAK_MS ? s.streak + 1 : 0
      const step = Math.max(SCRUB_MIN_S, state.duration * SCRUB_SHARE) * Math.min(SCRUB_FASTEST, 1 + streak * 0.25)
      const to = clampTime(state, (s?.to ?? state.position) + (input === 'right' ? step : -step))
      return [showBar({ ...state, row: 'seek', scrub: { to, settleAt: now + SCRUB_SETTLE_MS, streak, lastAt: now } }, now), []]
    }
  }
}

/**
 * Time passing: a scrub that's settled jumps, the bar hides when its time's up (the cursor
 * going back to play/pause, where the next press finds it), and notes expire.
 */
export function tick(state: PlayerState, now: number): [PlayerState, PlayerCommand[]] {
  let next = state
  const commands: PlayerCommand[] = []
  if (next.scrub && now >= next.scrub.settleAt) {
    commands.push({ seek: next.scrub.to })
    next = { ...showBar(next, now), position: next.scrub.to, scrub: null }
  }
  if ((next.row !== 'buttons' || next.button !== 'playPause') && !next.paused && !next.menu && !next.scrub && now >= next.barUntil)
    next = { ...next, row: 'buttons', button: 'playPause' }
  if (next.keysShown && !barShown(next, now)) next = { ...next, keysShown: false }
  if (next.skipped && now >= next.skipped.until) next = { ...next, skipped: null }
  if (next.note && now >= next.note.until) next = { ...next, note: null }
  return [next, commands]
}
