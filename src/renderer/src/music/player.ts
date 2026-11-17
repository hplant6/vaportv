import type { MusicTags } from '../../../shared/types'
import { MUSIC_HOLD_EVENT } from '../components/MusicPreview'

// The Music app's player: one audio element for the whole of vaporTV, so a queue keeps playing
// when the Music screen closes. It holds the background music while there's a queue, plays
// through it (shuffled or in order, repeating all or one), and feeds an analyser the
// visualizer reads. Screens subscribe for changes.

export type Repeat = 'off' | 'all' | 'one'

export interface PlayerState {
  queue: MusicTags[]
  /** Into `order`'s positions: which song is playing. -1 with nothing queued. */
  at: number
  /** The queue's indexes in play order (shuffled, or 0..n). */
  order: number[]
  playing: boolean
  /** Loading or waiting for the share. */
  loading: boolean
  shuffle: boolean
  repeat: Repeat
  time: number
  duration: number
  /** A radio station is playing (Claude's, from this song): Now playing can show its songs. */
  station: { seed: MusicTags } | null
}

/** Back goes to the start of the song after this long in; before it, the song before. */
const RESTART_AFTER_S = 3
const SKIP_S = 10

const audio = new Audio()
// Read through Web Audio for the visualizer: the art scheme sends the header that allows it.
audio.crossOrigin = 'anonymous'
audio.preload = 'auto'

let state: PlayerState = { queue: [], at: -1, order: [], playing: false, loading: false, shuffle: false, repeat: 'off', time: 0, duration: 0, station: null }
const listeners = new Set<(s: PlayerState) => void>()
let holding = false
let context: AudioContext | null = null
let analyser: AnalyserNode | null = null

function set(next: Partial<PlayerState>): void {
  state = { ...state, ...next }
  for (const listener of listeners) listener(state)
}

export function playerState(): PlayerState {
  return state
}

export function subscribe(listener: (s: PlayerState) => void): () => void {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

export function current(): MusicTags | null {
  return state.at >= 0 ? (state.queue[state.order[state.at]] ?? null) : null
}

/** The analyser (made on first use, after a press, as Chromium wants), for the visualizer. */
export function musicAnalyser(): AnalyserNode | null {
  if (!analyser) {
    try {
      context = new AudioContext()
      const source = context.createMediaElementSource(audio)
      analyser = context.createAnalyser()
      analyser.fftSize = 1024
      analyser.smoothingTimeConstant = 0.78
      source.connect(analyser)
      analyser.connect(context.destination)
    } catch (err) {
      console.error('steamtv: music analyser:', err)
      return null
    }
  }
  if (context?.state === 'suspended') void context.resume()
  return analyser
}

function hold(on: boolean): void {
  if (holding === on) return
  holding = on
  window.dispatchEvent(new CustomEvent(MUSIC_HOLD_EVENT, { detail: on }))
}

function shuffled(count: number, first: number): number[] {
  const rest = Array.from({ length: count }, (_, i) => i).filter((i) => i !== first)
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[rest[i], rest[j]] = [rest[j], rest[i]]
  }
  return first >= 0 ? [first, ...rest] : rest
}

async function load(at: number, autoplay = true): Promise<void> {
  const song = state.queue[state.order[at]]
  if (!song) return
  set({ at, time: 0, duration: song.duration ?? 0, loading: true })
  musicAnalyser()
  try {
    // Included with vaporTV: played from the page's own files.
    const url = song.url ?? (await window.steamtv.openFile(song.path))
    // Another song since (its tags filling in doesn't count).
    if (current()?.path !== song.path) return
    audio.src = url
    if (autoplay) await audio.play()
  } catch (err) {
    console.error('steamtv: music:', err)
    set({ loading: false })
    // One that won't open is skipped (a share that dropped, a file gone).
    if (current()?.path === song.path) void next(true)
  }
}

/** Plays `songs` from `start` (shuffled when shuffle's on, `start` first); `station` when they're a radio station. */
export function playQueue(songs: MusicTags[], start = 0, station: PlayerState['station'] = null): void {
  if (!songs.length) return
  hold(true)
  const order = state.shuffle ? shuffled(songs.length, start) : songs.map((_, i) => i)
  state = { ...state, queue: songs, order, station }
  void load(state.shuffle ? 0 : start)
}

/** Jumps to the song at this place in the play order. */
export function playAt(position: number): void {
  if (position >= 0 && position < state.order.length) void load(position)
}

/** Takes a song out of the queue (a thumbs down); the one playing gives way to the next. */
export function dropSong(path: string): void {
  const index = state.queue.findIndex((s) => s.path === path)
  if (index < 0) return
  const queue = state.queue.filter((_, i) => i !== index)
  if (!queue.length) return stopMusic()
  const position = state.order.indexOf(index)
  const playing = position === state.at
  const order = state.order.filter((i) => i !== index).map((i) => (i > index ? i - 1 : i))
  // Before the one playing: it moves up one. The one playing: the next takes its place.
  const at = Math.min(position < state.at ? state.at - 1 : state.at, order.length - 1)
  state = { ...state, queue, order, at }
  if (playing) void load(at)
  else set({})
}

/** Songs' tags read after they were queued (a request through Claude queues names first): the queue keeps its order. */
export function updateTags(got: MusicTags[]): void {
  if (!got.length) return
  const byPath = new Map(got.map((t) => [t.path, t]))
  if (!state.queue.some((t) => byPath.has(t.path))) return
  set({ queue: state.queue.map((t) => byPath.get(t.path) ?? t) })
}

export function toggle(): void {
  if (state.at < 0) return
  musicAnalyser()
  if (audio.paused) void audio.play().catch(() => undefined)
  else audio.pause()
}

/** The next song; at the end, the first again with repeat all, else it stops. `auto`: the last one ended. */
export async function next(auto = false): Promise<void> {
  if (state.at < 0) return
  if (auto && state.repeat === 'one') {
    audio.currentTime = 0
    return void audio.play().catch(() => undefined)
  }
  if (state.at + 1 < state.order.length) return load(state.at + 1)
  if (state.repeat === 'all') return load(0)
  if (auto) {
    audio.pause()
    audio.currentTime = 0
    set({ playing: false })
  }
}

/** The start of this song, or (near its start) the one before. */
export function previous(): void {
  if (state.at < 0) return
  if (audio.currentTime > RESTART_AFTER_S || state.at === 0) {
    audio.currentTime = 0
    return
  }
  void load(state.at - 1)
}

export function seekBy(seconds: number): void {
  if (state.at < 0) return
  const length = audio.duration || state.duration
  const to = audio.currentTime + seconds
  audio.currentTime = Math.max(0, length ? Math.min(length - 0.5, to) : to)
}

export const skipSeconds = SKIP_S

/** Shuffle on (the rest of the queue in a new order, this song first) or off (back in order, from this song). */
export function toggleShuffle(): void {
  const playingIndex = state.at >= 0 ? state.order[state.at] : -1
  const shuffle = !state.shuffle
  const order = shuffle ? shuffled(state.queue.length, playingIndex) : state.queue.map((_, i) => i)
  set({ shuffle, order, at: playingIndex < 0 ? -1 : shuffle ? 0 : playingIndex })
}

export function cycleRepeat(): void {
  set({ repeat: state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off' })
}

/** Stops and forgets the queue; the background music comes back. */
export function stopMusic(): void {
  audio.pause()
  audio.removeAttribute('src')
  audio.load()
  set({ queue: [], order: [], at: -1, playing: false, loading: false, time: 0, duration: 0, station: null })
  hold(false)
}

audio.addEventListener('playing', () => set({ playing: true, loading: false }))
audio.addEventListener('pause', () => set({ playing: false }))
audio.addEventListener('waiting', () => set({ loading: true }))
audio.addEventListener('ended', () => void next(true))
audio.addEventListener('timeupdate', () => set({ time: audio.currentTime }))
audio.addEventListener('durationchange', () => Number.isFinite(audio.duration) && set({ duration: audio.duration }))
audio.addEventListener('error', () => {
  if (!audio.getAttribute('src')) return
  console.error('steamtv: music: playback error', audio.error?.message)
  void next(true)
})
// A game or app in front: the music pauses, as the background music does.
window.addEventListener('blur', () => audio.pause())
