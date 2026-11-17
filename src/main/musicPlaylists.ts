import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { MusicPlaylist, MusicTags } from '../shared/types'
import { sameSong } from './musicFavorites'
import { indexedSong, librarySongs } from './musicIndex'
import { readTags } from './musicLibrary'

// Your own playlists: made from a radio station (Save as playlist), by adding songs or albums
// (Add to playlist), or by asking Claude ("make me a playlist of rainy-day jazz"). Kept with
// vaporTV's settings, each song by its path and by what it is, as the favorites are, so a
// moved share finds them again. A station's or Claude's playlist remembers how it was made;
// with Keep it fresh on, it's made again (new albums included) once a day.

const FILE = join(homedir(), '.config', 'steamtv', 'music-playlists.json')
/** Keep it fresh: made again when it's older than this. */
export const FRESH_MS = 24 * 60 * 60_000

interface SavedSong {
  path: string
  title: string
  artist?: string
  album?: string
  duration?: number
}

interface Saved {
  id: string
  name: string
  songs: SavedSong[]
  created: number
  updated: number
  /** On Home's Music row. */
  home: boolean
  /** How it was made, to make it again: a station from a song, or a request to Claude. */
  source?: { seed?: string; request?: string }
  /** Keep it fresh: made again from `source` once a day. */
  fresh: boolean
}

let saved: Saved[] | null = null

async function load(): Promise<Saved[]> {
  if (saved) return saved
  try {
    const got = JSON.parse(await readFile(FILE, 'utf8')) as { playlists?: Saved[] }
    saved = Array.isArray(got.playlists) ? got.playlists : []
  } catch {
    saved = []
  }
  return saved
}

async function save(): Promise<void> {
  if (!saved) return
  await mkdir(dirname(FILE), { recursive: true })
  const temp = `${FILE}.tmp`
  await writeFile(temp, JSON.stringify({ playlists: saved }, null, 1))
  await rename(temp, FILE)
}

function find(list: Saved[], id: string): Saved {
  const p = list.find((x) => x.id === id)
  if (!p) throw new Error('That playlist is gone')
  return p
}

async function record(path: string): Promise<SavedSong> {
  const t = indexedSong(path) ?? (await readTags(path))
  return { path, title: t.title, artist: t.artist, album: t.album, duration: t.duration }
}

/** Every playlist, newest first, its songs found in the index (by path, else by what they are). */
export async function musicPlaylists(): Promise<MusicPlaylist[]> {
  const list = await load()
  const all = await librarySongs()
  return [...list]
    .sort((a, b) => b.created - a.created)
    .map((p) => ({
      id: p.id,
      name: p.name,
      home: p.home,
      fresh: p.fresh,
      canFresh: !!(p.source?.seed || p.source?.request),
      updated: p.updated,
      songs: p.songs.map((s): MusicTags => indexedSong(s.path) ?? all.find((t) => sameSong(t, s)) ?? { ...s })
    }))
}

/** A new playlist of these songs; its id. */
export async function createPlaylist(name: string, paths: string[], source?: Saved['source']): Promise<string> {
  const list = await load()
  const now = Date.now()
  const songs: SavedSong[] = []
  for (const path of paths) songs.push(await record(path))
  const p: Saved = { id: randomUUID(), name: name.trim() || 'New playlist', songs, created: now, updated: now, home: false, source, fresh: false }
  list.push(p)
  await save()
  return p.id
}

/** Songs added to the end (those already in it are left where they are); how many were new. */
export async function addToPlaylist(id: string, paths: string[]): Promise<number> {
  const p = find(await load(), id)
  let added = 0
  for (const path of paths) {
    if (p.songs.some((s) => s.path === path)) continue
    p.songs.push(await record(path))
    added++
  }
  p.updated = Date.now()
  await save()
  return added
}

export async function removeFromPlaylist(id: string, path: string): Promise<void> {
  const p = find(await load(), id)
  p.songs = p.songs.filter((s) => s.path !== path)
  p.updated = Date.now()
  await save()
}

/** A song moved from one place in the playlist to another. */
export async function moveInPlaylist(id: string, from: number, to: number): Promise<void> {
  const p = find(await load(), id)
  if (from < 0 || from >= p.songs.length || to < 0 || to >= p.songs.length) return
  const [song] = p.songs.splice(from, 1)
  p.songs.splice(to, 0, song)
  p.updated = Date.now()
  await save()
}

/** Name, Show on Home, Keep it fresh. */
export async function changePlaylist(id: string, change: { name?: string; home?: boolean; fresh?: boolean }): Promise<void> {
  const p = find(await load(), id)
  if (change.name !== undefined && change.name.trim()) p.name = change.name.trim()
  if (change.home !== undefined) p.home = change.home
  if (change.fresh !== undefined) p.fresh = change.fresh
  await save()
}

export async function deletePlaylist(id: string): Promise<void> {
  const list = await load()
  saved = list.filter((p) => p.id !== id)
  await save()
}

/** Keep it fresh: its songs made again from how it was made (`make`: the station or Claude's pick), if it's due or `now`. True if it changed. */
export async function freshenPlaylist(id: string, make: (source: NonNullable<Saved['source']>) => Promise<string[] | null>, now = false): Promise<boolean> {
  const p = find(await load(), id)
  if (!p.source || (!now && (!p.fresh || Date.now() - p.updated < FRESH_MS))) return false
  const paths = await make(p.source)
  if (!paths?.length) return false
  const songs: SavedSong[] = []
  for (const path of paths) songs.push(await record(path))
  p.songs = songs
  p.updated = Date.now()
  await save()
  return true
}
