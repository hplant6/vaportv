import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import type { MusicAlbum, MusicIndexStatus, MusicTags } from '../shared/types'
import { builtInSongs } from './music'
import { excludedPlaces, fold, indexOf, libraryPlaces, readTags } from './musicLibrary'

// The music library as a library, not folders: every song's tags, read once and kept on disk,
// so the Music tab can show Albums, Artists and Genres across every place at once, Claude can
// see each album's artist, year and genre, and a share's songs needn't be opened again.
// A scan walks the places' names (musicLibrary's name index), reads tags only for songs that
// are new or changed (by size and time), and forgets songs that went from a place it could read.

/** Kept here; losing it just means the next scan reads every song again. */
const INDEX_FILE = join(homedir(), '.cache', 'steamtv', 'music-index.json')
const VERSION = 1
/** Saved after this many songs read, so a long first scan of a share isn't lost to a restart. */
const SAVE_EVERY = 250
/** Songs read at once: a share is slow to open a file. */
const READ_AT_ONCE = 4
/** Opening Music rescans when the last scan is older than this. */
const RESCAN_MS = 30 * 60_000

/** A song in the index: its tags, and the file's size and time to tell when it changes. */
export interface IndexedSong extends MusicTags {
  size: number
  mtime: number
}

let songs: Record<string, IndexedSong> = {}
/** The music included with vaporTV, always in the library (never on disk in the index). */
const INCLUDED = builtInSongs()
/** Bumped whenever `songs` changes, so the albums are worked out again. */
let changes = 0
let loaded: Promise<void> | null = null
let scanning: Promise<void> | null = null
let lastScan = 0
let status: MusicIndexStatus = { scanning: false, read: 0, toRead: 0, songs: 0 }
let onStatus: (s: MusicIndexStatus) => void = () => {}

/** Who hears how a scan is going (the window). */
export function setMusicIndexListener(listener: (s: MusicIndexStatus) => void): void {
  onStatus = listener
}

function report(next: Partial<MusicIndexStatus>): void {
  status = { ...status, ...next, songs: Object.keys(songs).length }
  onStatus(status)
}

export function musicIndexStatus(): MusicIndexStatus {
  return { ...status, songs: Object.keys(songs).length }
}

function load(): Promise<void> {
  loaded ??= (async () => {
    try {
      const saved = JSON.parse(await readFile(INDEX_FILE, 'utf8')) as { version?: number; songs?: Record<string, IndexedSong> }
      if (saved.version === VERSION && saved.songs && typeof saved.songs === 'object') {
        songs = saved.songs
        changes++
      }
    } catch {
      // None yet (or unreadable): the scan reads everything.
    }
  })()
  return loaded
}

async function save(): Promise<void> {
  await mkdir(dirname(INDEX_FILE), { recursive: true })
  // Written beside it, then moved over it: a crash mid-write leaves the old one whole.
  const temp = `${INDEX_FILE}.tmp`
  await writeFile(temp, JSON.stringify({ version: VERSION, songs }))
  await rename(temp, INDEX_FILE)
}

/** Scans every place: new and changed songs' tags read, gone ones forgotten. One at a time; asking again joins the one running. */
export function scanMusic(): Promise<void> {
  scanning ??= (async () => {
    await load()
    report({ scanning: true, read: 0, toRead: 0 })
    try {
      const seen = new Set<string>()
      const reachable: string[] = []
      const toRead: { path: string; size: number; mtime: number }[] = []
      // A place switched out of the library: its songs go.
      for (const root of await excludedPlaces()) reachable.push(root)
      for (const place of await libraryPlaces()) {
        const root = resolve(place.path)
        const names = await indexOf(root)
        // A place that lists nothing (a share that's down) keeps what it had.
        if (!names.length) continue
        reachable.push(root)
        for (const n of names) {
          if (n.entry.kind !== 'track') continue
          const path = n.entry.path
          seen.add(path)
          const info = await stat(path).catch(() => null)
          if (!info) continue
          const known = songs[path]
          if (!known || known.size !== info.size || known.mtime !== info.mtimeMs) toRead.push({ path, size: info.size, mtime: info.mtimeMs })
        }
      }
      for (const path of Object.keys(songs)) {
        if (!seen.has(path) && reachable.some((root) => path.startsWith(root + '/'))) {
          delete songs[path]
          changes++
        }
      }
      report({ toRead: toRead.length })
      let read = 0
      let next = 0
      const worker = async (): Promise<void> => {
        while (next < toRead.length) {
          const file = toRead[next++]
          const tags = await readTags(file.path)
          songs[file.path] = { ...tags, size: file.size, mtime: file.mtime }
          changes++
          read++
          if (read % 25 === 0) report({ read })
          if (read % SAVE_EVERY === 0) await save().catch(() => {})
        }
      }
      await Promise.all(Array.from({ length: READ_AT_ONCE }, worker))
      await save().catch(() => {})
      report({ read })
    } finally {
      lastScan = Date.now()
      report({ scanning: false })
      scanning = null
    }
  })()
  return scanning
}

/** Opening Music: a scan if the last one is old (the first after vaporTV starts, always). */
export function freshenMusic(): void {
  if (!scanning && Date.now() - lastScan > RESCAN_MS) void scanMusic().catch(() => {})
}

/** A genre tag that lists several ("Uplifting, Hopeful, Cinematic"; "Rock/Pop"): the first. */
export function firstGenre(genre: string | undefined): string | undefined {
  return genre?.split(/\s*[,;/|]\s*/).find(Boolean)?.trim() || undefined
}

/** "Various Artists" when an album's songs name several and its tags don't say. */
const VARIOUS = 'Various Artists'

/**
 * Songs grouped into albums: by album artist (else artist) and album name, so a box set spread
 * over folders is one album and two albums sharing a folder are two. Songs with no album tag
 * are an album each folder, named after it. Each album's songs by disc then track, then name.
 */
/** Which album a song belongs to: album artist and album; without an album artist, its folder too (two "Greatest Hits" stay apart); without an album, its folder. */
function albumKey(song: MusicTags): string {
  // Included with vaporTV: their own albums, apart from any of yours with the same names.
  if (song.path.startsWith('builtin:')) return `builtin|${fold(song.album ?? '')}`
  const folder = dirname(song.path)
  if (!song.album) return `folder|${folder}`
  return song.albumArtist ? `${fold(song.albumArtist)}|${fold(song.album)}` : `|${fold(song.album)}|${folder}`
}

const songOrder = (a: MusicTags, b: MusicTags): number => (a.disc ?? 1) - (b.disc ?? 1) || (a.track ?? 0) - (b.track ?? 0) || a.path.localeCompare(b.path)

export function groupAlbums(all: IndexedSong[]): MusicAlbum[] {
  return [...songsByAlbum(all)].map(([id, list]) => toAlbum(id, list))
}

function songsByAlbum(all: IndexedSong[]): Map<string, IndexedSong[]> {
  const groups = new Map<string, IndexedSong[]>()
  for (const song of all) {
    const key = albumKey(song)
    const group = groups.get(key)
    if (group) group.push(song)
    else groups.set(key, [song])
  }
  for (const list of groups.values()) list.sort(songOrder)
  return groups
}

function toAlbum(key: string, list: IndexedSong[]): MusicAlbum {
  const first = list[0]
  const artists = new Set(list.map((s) => s.artist).filter(Boolean))
  const artist = first.albumArtist ?? (artists.size > 1 ? VARIOUS : [...artists][0])
  /** What most of its songs say. */
  const most = <T,>(pick: (s: IndexedSong) => T | undefined): T | undefined => {
    const tally = new Map<T, number>()
    for (const s of list) {
      const v = pick(s)
      if (v !== undefined) tally.set(v, (tally.get(v) ?? 0) + 1)
    }
    return [...tally].sort((x, y) => y[1] - x[1])[0]?.[0]
  }
  return {
    id: key,
    title: first.album ?? basename(dirname(first.path)),
    artist,
    year: most((s) => s.year),
    genre: most((s) => firstGenre(s.genre)),
    cover: most((s) => s.cover),
    folder: first.path.startsWith('builtin:') ? 'builtin:' : dirname(first.path),
    ...(first.path.startsWith('builtin:') ? { included: true } : {}),
    added: Math.max(...list.map((s) => s.mtime)),
    duration: list.reduce((sum, s) => sum + (s.duration ?? 0), 0),
    songs: list.length
  }
}

let albumCache: { changes: number; albums: MusicAlbum[]; byId: Map<string, IndexedSong[]> } | null = null

function albumsNow(): { albums: MusicAlbum[]; byId: Map<string, IndexedSong[]> } {
  if (albumCache?.changes === changes) return albumCache
  const byId = songsByAlbum([...Object.values(songs), ...INCLUDED.map((s) => ({ ...s, size: 0, mtime: 0 }))])
  albumCache = { changes, albums: [...byId].map(([id, list]) => toAlbum(id, list)), byId }
  return albumCache
}

/** Every album in the index (empty before the first scan finishes reading). */
export async function libraryAlbums(): Promise<MusicAlbum[]> {
  await load()
  return albumsNow().albums
}

/** An album's songs from the index, in order: instant, nothing opened. */
export async function albumSongs(id: string): Promise<MusicTags[]> {
  await load()
  return albumsNow().byId.get(id) ?? []
}

/** Whether there's an index on disk yet (a first scan still to finish). */
export function hasMusicIndex(): boolean {
  return existsSync(INDEX_FILE)
}

/** A song in the index by path (its tags), if it's there. */
export function indexedSong(path: string): MusicTags | undefined {
  return songs[path] ?? INCLUDED.find((s) => s.path === path)
}

/** Every song in the index. */
export async function librarySongs(): Promise<MusicTags[]> {
  await load()
  return [...Object.values(songs), ...INCLUDED]
}

/** Songs and albums in the index from under a place (Music sources' counts). */
export async function placeCounts(root: string): Promise<{ songs: number; albums: number }> {
  await load()
  const under = Object.values(songs).filter((s) => s.path.startsWith(root + '/'))
  return { songs: under.length, albums: new Set(under.map(albumKey)).size }
}

/** Seconds of a song ffmpeg listens to, to measure its loudness: enough for most, quick over a share. */
const MEASURE_S = 180

/** A song's loudness (LUFS): its tags', else measured once by ffmpeg (EBU R128) and kept in the index. Null if it can't be. */
export async function songLoudness(path: string): Promise<number | null> {
  await load()
  const known = indexedSong(path)?.loudness
  if (known !== undefined) return known
  const lufs = await new Promise<number | null>((done) => {
    const child = spawn('ffmpeg', ['-nostats', '-hide_banner', '-t', String(MEASURE_S), '-i', path, '-filter_complex', 'ebur128', '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString()).length > 200_000 && (err = err.slice(-50_000)))
    child.on('error', () => done(null))
    child.on('close', () => {
      // The summary at the end: "Integrated loudness: … I: -14.2 LUFS".
      const summary = err.slice(err.lastIndexOf('Integrated loudness'))
      const m = summary.match(/I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/)
      done(m && Number.isFinite(Number(m[1])) && Number(m[1]) > -70 ? Number(m[1]) : null)
    })
  })
  if (lufs !== null && songs[path]) {
    songs[path] = { ...songs[path], loudness: lufs }
    changes++
    void save().catch(() => {})
  }
  return lufs
}
