import { useEffect, useState, useSyncExternalStore } from 'react'
import type { MusicBar, MusicTags } from '../../../shared/types'
import { useBackgroundSong } from '../music/backgroundSong'
import { current, next, playerState, subscribe, toggle } from '../music/player'
import { backgroundNow, skipTrack } from './BackgroundMusic'

// The bar's second row: the song playing on the left; on the right, how far into it you are
// and Skip and Stop (Play when stopped), as words, which the cursor moves between. The Music
// player's song when it has one, else background music's (which can skip on, but not stop:
// it fades in and out with the screens by itself).
//
// When it shows is Settings → Music & sounds: 'auto' drops it down for a few seconds as each
// song starts, and while the cursor's on its buttons (Down from the bar); 'always' keeps it
// down while music plays; 'off' never shows it.

/** How long the row stays down after a song starts (auto). */
const PEEK_MS = 3000

/** Settings fires this after changing when the row shows. */
export const MUSIC_BAR_EVENT = 'steamtv:music-bar'

/** The row's buttons: Down from the bar steps to the nearest. */
export const NOW_PLAYING_BUTTON = 'nav-now-button'

// ── When it shows: from Settings, shared by every screen's bar ──

let bar: MusicBar = 'auto'
const settingsListeners = new Set<() => void>()
function loadSettings(): void {
  window.steamtv.getSettings().then((s) => {
    bar = s.musicBar
    for (const listener of settingsListeners) listener()
  })
}
let settingsStarted = false
function subscribeSettings(listener: () => void): () => void {
  if (!settingsStarted) {
    settingsStarted = true
    loadSettings()
    window.addEventListener(MUSIC_BAR_EVENT, loadSettings)
  }
  settingsListeners.add(listener)
  return () => void settingsListeners.delete(listener)
}
const useMusicBar = (): MusicBar => useSyncExternalStore(subscribeSettings, () => bar)

// ── The song: the Music player's, else background music's ──

const useSong = (): MusicTags | null => {
  const playing = useSyncExternalStore(subscribe, current)
  const background = useBackgroundSong()
  return playing ?? background.song
}

/** When the last song started, by its path: a new screen's bar carries on the same peek, not a new one. */
let lastSong: string | null = null
let peekUntil = 0

/**
 * Whether the bar opens its second row, and whether Down from the bar can reach it. Open while
 * music plays ('always'), for a few seconds as each song starts ('auto'), or never ('off').
 * `focused`: the cursor's on the row's buttons (auto keeps it down meanwhile).
 */
export function useNowPlayingOpen(focused: boolean): { open: boolean; reachable: boolean } {
  const mode = useMusicBar()
  const song = useSong()
  const [, redraw] = useState(0)
  useEffect(() => {
    if (!song || song.path === lastSong) return
    lastSong = song.path
    peekUntil = Date.now() + PEEK_MS
    redraw((n) => n + 1)
  }, [song])
  const peeking = Date.now() < peekUntil
  useEffect(() => {
    if (!peeking) return
    const timer = setTimeout(() => redraw((n) => n + 1), peekUntil - Date.now() + 20)
    return () => clearTimeout(timer)
  }, [peeking])
  const reachable = !!song && mode !== 'off'
  const open = reachable && (mode === 'always' || peeking || focused)
  return { open, reachable }
}

const name = (song: MusicTags): string => (song.artist ? `${song.artist} - ${song.title}` : song.title)

function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const s = Math.floor(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** The player's state, redrawn as it changes (the time, a few times a second). */
const usePlayer = () => useSyncExternalStore(subscribe, playerState)

/** Background music's time and length, looked at twice a second while `on` (it has no events of its own). */
function useBackgroundTime(on: boolean): { time: number; duration: number } {
  const [time, setTime] = useState({ time: 0, duration: 0 })
  useEffect(() => {
    if (!on) return
    const look = (): void => {
      const now = backgroundNow()
      setTime(now ? { time: now.time, duration: now.duration } : { time: 0, duration: 0 })
    }
    look()
    const timer = setInterval(look, 500)
    return () => clearInterval(timer)
  }, [on])
  return time
}

export function NowPlayingRow({ onFocusChange }: { onFocusChange: (focused: boolean) => void }) {
  const state = usePlayer()
  const song = useSong()
  const queued = state.at >= 0
  const background = useBackgroundTime(!queued && !!song)
  if (!song) return null
  const { time, duration } = queued ? state : background
  const button = (label: string, onClick: () => void) => (
    <button className={`nav-tab display ${NOW_PLAYING_BUTTON}`} tabIndex={-1} aria-label={label} data-focusable="" data-select-sound="move" onClick={onClick}>
      {label}
    </button>
  )
  return (
    <div
      className="nav-now"
      // The cursor on a button keeps the row down; off them both, it may fold away.
      onFocus={() => onFocusChange(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onFocusChange(false)
      }}
    >
      <span className="nav-now-song-part">
        <span className="nav-now-label display">Now playing:</span>
        <span className="nav-now-song">{name(song)}</span>
      </span>
      <span className="nav-now-controls">
        {duration > 0 && (
          <span className="nav-now-time">
            {clock(time)}/{clock(duration)}
          </span>
        )}
        {button('Skip', () => (queued ? void next() : skipTrack('music', 1, true)))}
        {queued && button(state.playing ? 'Stop' : 'Play', toggle)}
      </span>
    </div>
  )
}
