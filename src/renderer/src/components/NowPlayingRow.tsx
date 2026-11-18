import { useEffect, useState, useSyncExternalStore } from 'react'
import type { MusicBar, MusicTags } from '../../../shared/types'
import { DEFAULT_CONTROLS, type Controls } from '../../../shared/controls'
import { useBackgroundSong } from '../music/backgroundSong'
import { current, next, playerState, subscribe } from '../music/player'
import { skipTrack } from './BackgroundMusic'
import { ButtonIcon, useControllerFamily } from './ButtonIcon'

// The bar's second row: the song playing, centred, with what's up next on the left and the
// controller's Next song button on the right. The Music player's queue when it has one (it
// knows what's next and how far in), else background music's song.
//
// When it shows is Settings → Music & sounds: 'auto' drops it down for a few seconds as each
// song starts, and while the cursor's on it (Down from the bar); 'always' keeps it down while
// music plays; 'off' never shows it.

/** How long the row stays down after a song starts (auto). */
const PEEK_MS = 3000

/** Settings fires this after changing when the row shows. */
export const MUSIC_BAR_EVENT = 'steamtv:music-bar'

/** The row's focusable strip: Down from the bar steps here. */
export const NOW_PLAYING_ROW = 'nav-now'

// ── When it shows, and the Next song button: from Settings, shared by every screen's bar ──

let bar: MusicBar = 'auto'
let controls: Controls = DEFAULT_CONTROLS
const settingsListeners = new Set<() => void>()
function loadSettings(): void {
  window.steamtv.getSettings().then((s) => {
    bar = s.musicBar
    controls = s.controls
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
const useNextSongButton = (): number => useSyncExternalStore(subscribeSettings, () => controls.nextSong)

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
 * `focused`: the cursor's on the row (auto keeps it down meanwhile).
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

/** The player's state, redrawn as it changes. */
const usePlayer = () => useSyncExternalStore(subscribe, playerState)

/** Next song: whatever you hear (as the controller's Next song button does). */
function skip(): void {
  if (playerState().at >= 0) void next()
  else skipTrack('music', 1, true)
}

export function NowPlayingRow({ onFocusChange }: { onFocusChange: (focused: boolean) => void }) {
  const state = usePlayer()
  const song = useSong()
  const family = useControllerFamily()
  const nextSong = useNextSongButton()
  if (!song) return null
  const queued = state.at >= 0
  // After this one: the next in play order, or with repeat all, round to the first.
  const after = queued ? (state.order[state.at + 1] ?? (state.repeat === 'all' ? state.order[0] : undefined)) : undefined
  const upNext = after !== undefined ? state.queue[after] : null
  return (
    // One strip the cursor can rest on (Down from the bar): it keeps the row down, and A skips on.
    <button
      className={NOW_PLAYING_ROW}
      tabIndex={-1}
      aria-label={`Now playing: ${name(song)}${upNext ? `. Up next: ${name(upNext)}` : ''}`}
      data-focusable=""
      data-select-sound="move"
      onFocus={() => onFocusChange(true)}
      onBlur={() => onFocusChange(false)}
      onClick={skip}
    >
      <span className="nav-now-side left">
        {upNext && (
          <>
            <span className="nav-now-label display">Up next:</span>
            <span className="nav-now-song">{name(upNext)}</span>
          </>
        )}
      </span>
      <span className="nav-now-middle">
        <span className="nav-now-label display">Now playing:</span>
        <span className="nav-now-song now">{name(song)}</span>
      </span>
      <span className="nav-now-side right">
        <ButtonIcon button={nextSong} family={family} />
        <span className="nav-now-label display">Next song</span>
      </span>
    </button>
  )
}
