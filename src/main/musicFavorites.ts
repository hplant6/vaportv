import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { MusicAlbum, MusicFavorites, MusicTags } from '../shared/types'
import { indexedSong, libraryAlbums, librarySongs } from './musicIndex'
import { fold, readTags } from './musicLibrary'

// Liked songs and favorite albums (the Favorite button; the heart in Now playing), and songs
// given a thumbs down (never on a radio station again; Claude hears what you liked and didn't),
// kept with
// vaporTV's settings. Each is saved by its path and what it is (title, artist, album, length),
// so when a share mounts somewhere new or folders are tidied, it's found again in the index
// by what it is rather than lost.

const FILE = join(homedir(), '.config', 'steamtv', 'music-favorites.json')

interface SavedSong {
  path: string
  title: string
  artist?: string
  album?: string
  duration?: number
  /** When it was liked (ms). */
  at: number
}

interface SavedAlbum {
  id: string
  title: string
  artist?: string
  at: number
}

let saved: { songs: SavedSong[]; albums: SavedAlbum[]; dislikes: SavedSong[] } | null = null

async function load(): Promise<{ songs: SavedSong[]; albums: SavedAlbum[]; dislikes: SavedSong[] }> {
  if (saved) return saved
  try {
    const got = JSON.parse(await readFile(FILE, 'utf8')) as { songs?: SavedSong[]; albums?: SavedAlbum[]; dislikes?: SavedSong[] }
    const list = <T,>(v: T[] | undefined): T[] => (Array.isArray(v) ? v : [])
    saved = { songs: list(got.songs), albums: list(got.albums), dislikes: list(got.dislikes) }
  } catch {
    saved = { songs: [], albums: [], dislikes: [] }
  }
  return saved
}

async function save(): Promise<void> {
  if (!saved) return
  await mkdir(dirname(FILE), { recursive: true })
  const temp = `${FILE}.tmp`
  await writeFile(temp, JSON.stringify(saved, null, 1))
  await rename(temp, FILE)
}

/** Same song: same title and artist, and lengths within two seconds when both are known. */
export function sameSong(a: { title: string; artist?: string; duration?: number }, b: { title: string; artist?: string; duration?: number }): boolean {
  if (fold(a.title) !== fold(b.title) || fold(a.artist ?? '') !== fold(b.artist ?? '')) return false
  return a.duration === undefined || b.duration === undefined || Math.abs(a.duration - b.duration) < 2
}

/** The liked songs (newest first) and favorite albums (newest first), found in the index: by path, else by what they are. */
export async function musicFavorites(): Promise<MusicFavorites> {
  const { songs, albums } = await load()
  const all = await librarySongs()
  const albumList = await libraryAlbums()
  const likedSongs: MusicTags[] = []
  for (const s of [...songs].sort((a, b) => b.at - a.at)) {
    const found = indexedSong(s.path) ?? all.find((t) => sameSong(t, s))
    // Not in the index (its place unplugged): as it was saved, for the list to show.
    likedSongs.push(found ?? { path: s.path, title: s.title, artist: s.artist, album: s.album, duration: s.duration })
  }
  const favoriteAlbums: MusicAlbum[] = []
  for (const a of [...albums].sort((x, y) => y.at - x.at)) {
    const found = albumList.find((b) => b.id === a.id) ?? albumList.find((b) => fold(b.title) === fold(a.title) && fold(b.artist ?? '') === fold(a.artist ?? ''))
    if (found) favoriteAlbums.push(found)
  }
  return { songs: likedSongs, albums: favoriteAlbums }
}

/** Likes or unlikes a song (by path: its tags from the index, else read); true if it's liked now. */
export async function toggleFavoriteSong(path: string): Promise<boolean> {
  const state = await load()
  const at = state.songs.findIndex((s) => s.path === path)
  if (at >= 0) {
    state.songs.splice(at, 1)
    await save()
    return false
  }
  const tags = indexedSong(path) ?? (await readTags(path))
  // The same song saved from elsewhere (an old path): unliked instead.
  const same = state.songs.findIndex((s) => sameSong(s, tags))
  if (same >= 0) {
    state.songs.splice(same, 1)
    await save()
    return false
  }
  state.songs.push({ path, title: tags.title, artist: tags.artist, album: tags.album, duration: tags.duration, at: Date.now() })
  await save()
  return true
}

/** Favorites or unfavorites an album (by its id in the index); true if it's a favorite now. */
export async function toggleFavoriteAlbum(id: string): Promise<boolean> {
  const state = await load()
  const album = (await libraryAlbums()).find((a) => a.id === id)
  const at = state.albums.findIndex((a) => a.id === id || (album && fold(a.title) === fold(album.title) && fold(a.artist ?? '') === fold(album.artist ?? '')))
  if (at >= 0) {
    state.albums.splice(at, 1)
    await save()
    return false
  }
  if (!album) return false
  state.albums.push({ id, title: album.title, artist: album.artist, at: Date.now() })
  await save()
  return true
}

/** A song's record as saved: what it is and when. */
function record(path: string, tags: MusicTags): SavedSong {
  return { path, title: tags.title, artist: tags.artist, album: tags.album, duration: tags.duration, at: Date.now() }
}

/**
 * Thumbs down on a song (or, again, back up); true if it's disliked now. A disliked song is
 * never on a radio station again, and Claude hears it among what you didn't like. It's no
 * longer a liked song either.
 */
export async function toggleDislike(path: string): Promise<boolean> {
  const state = await load()
  const tags = indexedSong(path) ?? (await readTags(path))
  const at = state.dislikes.findIndex((s) => s.path === path || sameSong(s, tags))
  if (at >= 0) {
    state.dislikes.splice(at, 1)
    await save()
    return false
  }
  state.dislikes.push(record(path, tags))
  state.songs = state.songs.filter((s) => s.path !== path && !sameSong(s, tags))
  await save()
  return true
}

/** Whether a song's had a thumbs down. */
export async function isDisliked(song: MusicTags): Promise<boolean> {
  return (await load()).dislikes.some((s) => s.path === song.path || sameSong(s, song))
}

/** What you've liked and given a thumbs down, newest first (a few dozen each), as "Artist — Title" for Claude. */
export async function musicTaste(most = 30): Promise<{ liked: string[]; disliked: string[] }> {
  const { songs, dislikes } = await load()
  const line = (s: SavedSong): string => `${s.artist ? `${s.artist} — ` : ''}${s.title}`
  const newest = (list: SavedSong[]): string[] => [...list].sort((a, b) => b.at - a.at).slice(0, most).map(line)
  return { liked: newest(songs), disliked: newest(dislikes) }
}

/** Paths given a thumbs down (for the screens to mark). */
export async function dislikedPaths(): Promise<string[]> {
  return (await load()).dislikes.map((s) => s.path)
}
