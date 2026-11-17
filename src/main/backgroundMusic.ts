import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { BG_ALBUM, BG_LIBRARY, BG_LIKED, BG_STATION } from '../shared/backgroundMusic'
import type { MusicTags } from '../shared/types'
import { musicRadio } from './claudeMusic'
import { musicFavorites } from './musicFavorites'
import { albumSongs, librarySongs } from './musicIndex'
import { SHUFFLE } from './music'

// Background music from the library: what a background choice that isn't a single included
// track or a playlist plays (your whole library, Liked songs, an album, or a Claude station),
// as songs for music.ts's currentMusic to play quietly.

/** The library shuffled: this many at a time is plenty for a background. */
const LIBRARY_MOST = 500
/** A background station is made again after this long. */
const STATION_MS = 24 * 60 * 60_000
const STATION_FILE = join(homedir(), '.cache', 'steamtv', 'background-station.json')

function shuffled<T>(list: T[]): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** A station from a liked song (any, at random), kept a day so the background isn't remade each start. */
async function station(): Promise<MusicTags[] | null> {
  try {
    const saved = JSON.parse(await readFile(STATION_FILE, 'utf8')) as { at: number; songs: MusicTags[] }
    if (Date.now() - saved.at < STATION_MS && saved.songs.length) return saved.songs
  } catch {
    // None yet.
  }
  const liked = (await musicFavorites()).songs
  if (!liked.length) return null
  const songs = await musicRadio(liked[Math.floor(Math.random() * liked.length)].path)
  if (!songs?.length) return null
  await mkdir(dirname(STATION_FILE), { recursive: true })
  await writeFile(STATION_FILE, JSON.stringify({ at: Date.now(), songs }))
  return songs
}

/** The songs a library choice plays (shuffled where it should be), or null for a choice that isn't one (a track, a playlist, none). */
export async function backgroundSongs(choice: string | null): Promise<MusicTags[] | null> {
  if (!choice) return null
  if (choice === BG_LIBRARY || choice === SHUFFLE) return shuffled(await librarySongs()).slice(0, LIBRARY_MOST)
  if (choice === BG_LIKED) return shuffled((await musicFavorites()).songs)
  if (choice.startsWith(BG_ALBUM)) return albumSongs(choice.slice(BG_ALBUM.length))
  // No Claude, or no liked songs yet: the library, shuffled.
  if (choice === BG_STATION) return (await station()) ?? shuffled(await librarySongs()).slice(0, LIBRARY_MOST)
  return null
}
