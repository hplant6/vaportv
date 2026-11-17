import { useEffect, useState } from 'react'
import type { MusicPlaylist } from '../../../shared/types'
import { toast } from '../components/Toast'
import { play } from '../input/sounds'

// Your playlists for every screen that shows them (the Music tab, Home's row, the picker):
// one copy, asked for again after each change.

export const MUSIC_PLAYLISTS_EVENT = 'steamtv:music-playlists'
/** PlaylistPicker listens: detail is what to add ({ paths, name, from }). */
export const PLAYLIST_PICK_EVENT = 'steamtv:music-playlist-pick'

export interface PlaylistPick {
  paths: string[]
  /** A new playlist's name (the song's or album's). */
  name: string
  /** Where the cursor goes back to. */
  from: HTMLElement | null
}

let playlists: MusicPlaylist[] = []
let loading: Promise<void> | null = null

export function reloadPlaylists(): Promise<void> {
  loading = window.steamtv.music
    .playlists()
    .then((got) => {
      playlists = got
      window.dispatchEvent(new Event(MUSIC_PLAYLISTS_EVENT))
    })
    .catch(() => undefined)
  return loading
}

export function useMusicPlaylists(): MusicPlaylist[] {
  const [, setVersion] = useState(0)
  useEffect(() => {
    const changed = (): void => setVersion((v) => v + 1)
    window.addEventListener(MUSIC_PLAYLISTS_EVENT, changed)
    if (!loading) void reloadPlaylists()
    return () => window.removeEventListener(MUSIC_PLAYLISTS_EVENT, changed)
  }, [])
  return playlists
}

/** Add to playlist: the picker opens (a new one, or one of yours). */
export function pickPlaylist(pick: PlaylistPick): void {
  window.dispatchEvent(new CustomEvent(PLAYLIST_PICK_EVENT, { detail: pick }))
}

/** A new playlist; its id. */
export async function newPlaylist(name: string, paths: string[], source?: { seed?: string; request?: string }): Promise<string> {
  const id = await window.steamtv.music.createPlaylist(name, paths, source)
  play('favorite')
  toast(`Saved “${name}” to Playlists (${paths.length} ${paths.length === 1 ? 'song' : 'songs'})`)
  await reloadPlaylists()
  return id
}

export async function addToPlaylist(id: string, paths: string[]): Promise<void> {
  const added = await window.steamtv.music.addToPlaylist(id, paths)
  const name = playlists.find((p) => p.id === id)?.name ?? 'the playlist'
  play(added ? 'favorite' : 'move')
  toast(added ? `Added ${added} ${added === 1 ? 'song' : 'songs'} to ${name}` : `Already in ${name}`)
  await reloadPlaylists()
}
