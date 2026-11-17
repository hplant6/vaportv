import { useEffect, useState } from 'react'
import type { MusicFavorites, MusicTags } from '../../../shared/types'
import { toast } from '../components/Toast'
import { FAVORITE_EVENT } from '../input/focus'
import { play } from '../input/sounds'
import { playQueue, playerState, toggleShuffle } from './player'

// Liked songs and favorite albums for every screen that shows them (the Music tab, its pages,
// Now playing, Home's row): one copy, asked for again after each change. The Favorite button
// on anything marked data-song-path or data-album-id likes or favorites it; Now playing's
// heart does the same for the song playing. And radio: a station from a song, through Claude.

/** Fired after a change, for screens to ask again. */
export const MUSIC_FAVORITES_EVENT = 'steamtv:music-favorites'
/** The Music app listens: open on Now playing over whatever's on screen (detail: where to come back to). */
const MUSIC_EVENT = 'steamtv:music'

let favorites: MusicFavorites = { songs: [], albums: [] }
let loading: Promise<void> | null = null

function reload(): Promise<void> {
  loading = window.steamtv.music
    .favorites()
    .then((got) => {
      favorites = got
      window.dispatchEvent(new Event(MUSIC_FAVORITES_EVENT))
    })
    .catch(() => undefined)
  return loading
}

/** The favorites, kept up to date. */
export function useMusicFavorites(): MusicFavorites & { liked: Set<string>; albumIds: Set<string> } {
  const [, setVersion] = useState(0)
  useEffect(() => {
    const changed = (): void => setVersion((v) => v + 1)
    window.addEventListener(MUSIC_FAVORITES_EVENT, changed)
    if (!loading) void reload()
    return () => window.removeEventListener(MUSIC_FAVORITES_EVENT, changed)
  }, [])
  return { ...favorites, liked: new Set(favorites.songs.map((s) => s.path)), albumIds: new Set(favorites.albums.map((a) => a.id)) }
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

let claude: Promise<boolean> | null = null
/** Whether Claude Code is on this box (asked once): radio shows only then. */
export function useClaudeReady(): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    claude ??= window.steamtv.music.claudeReady().catch(() => false)
    let live = true
    void claude.then((r) => live && setReady(r))
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
  window.dispatchEvent(new CustomEvent(MUSIC_EVENT, { detail: from }))
}

let tuning = false
/** A radio station from a song (Claude picks what sounds like it), played in its order; Now playing opens unless it's already up. */
export async function startRadio(song: MusicTags, from: Element | null): Promise<void> {
  if (tuning) return
  tuning = true
  toast(`Asking Claude for a station like ${song.title}…`)
  try {
    const station = await window.steamtv.music.radio(song.path)
    if (!station?.length) return toast(`Claude couldn't make a station from ${song.title}`)
    // The station's own order (already mixed), from its first song: the one it started from.
    if (playerState().shuffle) toggleShuffle()
    playQueue(station, 0)
    toast(`${song.title} radio: ${station.length} songs`)
    if (!document.querySelector('.music-playing')) window.dispatchEvent(new CustomEvent(MUSIC_EVENT, { detail: from }))
  } finally {
    tuning = false
  }
}
