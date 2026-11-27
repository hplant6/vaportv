import { useEffect, useState } from 'react'
import type { MusicFavorites, MusicTags } from '../../../shared/types'
import { toast } from '../components/Toast'
import { FAVORITE_EVENT } from '../input/focus'
import { play } from '../input/sounds'
import { dropSong, playQueue, playerState, toggleShuffle } from './player'
import { openNowPlaying } from './nowPlaying'

// Liked songs and favorite albums for every screen that shows them (the Music tab, its pages,
// Now playing, Home's row): one copy, asked for again after each change. The Favorite button
// on anything marked data-song-path or data-album-id likes or favorites it; Now playing's
// heart does the same for the song playing. And radio: a station from a song, through Claude.

/** Fired after a change, for screens to ask again. */
export const MUSIC_FAVORITES_EVENT = 'steamtv:music-favorites'

let favorites: MusicFavorites = { songs: [], albums: [] }
/** Songs given a thumbs down. */
let disliked = new Set<string>()
let loading: Promise<void> | null = null

function reload(): Promise<void> {
  loading = Promise.all([window.steamtv.music.favorites(), window.steamtv.music.disliked()])
    .then(([got, down]) => {
      favorites = got
      disliked = new Set(down)
      window.dispatchEvent(new Event(MUSIC_FAVORITES_EVENT))
    })
    .catch(() => undefined)
  return loading
}

/** The favorites, kept up to date. */
export function useMusicFavorites(): MusicFavorites & { liked: Set<string>; albumIds: Set<string>; disliked: Set<string> } {
  const [, setVersion] = useState(0)
  useEffect(() => {
    const changed = (): void => setVersion((v) => v + 1)
    window.addEventListener(MUSIC_FAVORITES_EVENT, changed)
    if (!loading) void reload()
    return () => window.removeEventListener(MUSIC_FAVORITES_EVENT, changed)
  }, [])
  return { ...favorites, liked: new Set(favorites.songs.map((s) => s.path)), albumIds: new Set(favorites.albums.map((a) => a.id)), disliked }
}

export function isLiked(path: string | undefined): boolean {
  return !!path && favorites.songs.some((s) => s.path === path)
}

export async function toggleLiked(path: string, title: string): Promise<void> {
  const on = await window.steamtv.music.toggleSong(path)
  play(on ? 'favorite' : 'move')
  toast(on ? `Added ${title} to Liked songs` : `Removed ${title} from Liked songs`)
  await reload()
}

/**
 * Thumbs down: the song leaves the queue (the next plays if it was playing), is never on a
 * station again, and Claude hears it next time. Again (from a song's menu): back up.
 */
export async function toggleDisliked(path: string, title: string): Promise<void> {
  const down = await window.steamtv.music.toggleDislike(path)
  play('move')
  if (down) dropSong(path)
  toast(down ? `Thumbs down: ${title} won't play on radio again` : `${title} can play on radio again`)
  await reload()
}

export async function toggleFavoriteAlbum(id: string, title: string): Promise<void> {
  const on = await window.steamtv.music.toggleAlbum(id)
  play(on ? 'favorite' : 'move')
  toast(on ? `Added ${title} to Favorites` : `Removed ${title} from Favorites`)
  await reload()
}

// The Favorite button on a song or an album, wherever it shows.
window.addEventListener(FAVORITE_EVENT, (event) => {
  const el = (event as CustomEvent<HTMLElement>).detail
  const name = el.dataset.title ?? el.getAttribute('aria-label') ?? 'it'
  if (el.dataset.songPath) void toggleLiked(el.dataset.songPath, name)
  else if (el.dataset.albumId) void toggleFavoriteAlbum(el.dataset.albumId, name)
})

/** Whether radio can be offered: Claude Code on this box, and music of your own (asked as each screen opens: music may have just arrived). */
export function useClaudeReady(): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let live = true
    void window.steamtv.music
      .claudeReady()
      .catch(() => false)
      .then((r) => live && setReady(r))
    return () => {
      live = false
    }
  }, [])
  return ready
}

/** Plays songs now (shuffled or not) and opens Now playing, coming back to `from`. */
export function playNow(songs: MusicTags[], from: Element | null, at = 0, shuffle = false): void {
  if (!songs.length) return
  if (shuffle !== playerState().shuffle) toggleShuffle()
  playQueue(songs, shuffle ? Math.floor(Math.random() * songs.length) : at)
  openNowPlaying(from)
}

let tuning = false
const tuningListeners = new Set<(on: boolean) => void>()
function setTuning(on: boolean): void {
  tuning = on
  for (const listener of tuningListeners) listener(on)
}

/** Whether Claude is picking a station's songs (the radio button turns while it does). */
export function useTuning(): boolean {
  const [on, setOn] = useState(tuning)
  useEffect(() => {
    tuningListeners.add(setOn)
    return () => {
      tuningListeners.delete(setOn)
    }
  }, [])
  return on
}

/** A radio station from a song (Claude picks what sounds like it), played in its order; Now playing opens unless it's already up. */
export async function startRadio(song: MusicTags, from: Element | null): Promise<void> {
  if (tuning) return
  setTuning(true)
  window.steamtv.logInput(`radio: asking Claude for songs like ${song.title}`)
  try {
    const station = await window.steamtv.music.radio(song.path)
    if (!station?.length) {
      window.steamtv.logInput('radio: Claude found nothing')
      return toast(`Claude couldn't make a station from ${song.title}`)
    }
    window.steamtv.logInput(`radio: ${station.length} songs`)
    // The station's own order (already mixed), from its first song: the one it started from.
    if (playerState().shuffle) toggleShuffle()
    playQueue(station, 0, { seed: song })
    toast(`${song.title} radio: ${station.length} songs. The radio button again lists them`)
    if (!document.querySelector('.music-playing')) openNowPlaying(from)
  } catch (err) {
    window.steamtv.logInput(`radio: failed: ${err instanceof Error ? err.message : String(err)}`)
    toast(`Claude couldn't make a station from ${song.title}`)
  } finally {
    setTuning(false)
  }
}
