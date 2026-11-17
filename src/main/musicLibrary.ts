import { createHash } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import { cp, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { homedir, userInfo } from 'node:os'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { parseFile } from 'music-metadata'
import type { MusicEntry, MusicFolder, MusicPlace, MusicTags } from '../shared/types'
import { allowed, AUDIO, copyInto } from './browse'
import { artUrl } from './library/art'

// The Music app's library: your own music, wherever it is. Its places are ~/Music, each drive
// plugged in, and each network share mounted under ~/Network (scripts/add-music-share.sh: a
// share is mounted there by a systemd unit, so to vaporTV it's just a folder). Folders are
// browsed as they are; a song's title, artist, album and cover come from its tags, read as the
// list shows it, and a folder's cover.jpg (or the like) stands in for a song without one.

/** Where network shares are mounted, one folder each ("LargeBox-Music" shows as "LargeBox Music"). */
export const NETWORK_DIR = join(homedir(), 'Network')
/** Covers pulled out of songs (and copied from folders), for the page to show. */
export const MUSIC_COVERS = join(homedir(), '.cache', 'steamtv', 'music-covers')
/** A folder's own picture, by the names people and rippers give it. */
const FOLDER_COVERS = /^(cover|folder|front|album|albumart(small|large)?)\.(jpe?g|png|webp)$/i
/** A NAS's or Windows' own housekeeping folders (snapshots, recycle bins), never music. */
const SYSTEM_FOLDERS = /^(@|#recycle$|\$recycle\.bin$|system volume information$|\.)/i
/** Songs read at once: shares are slow to open a file, and the list shows a screenful at a time. */
const READ_AT_ONCE = 4

/** Where to look: the shares, the drives, then ~/Music (as "Music on this TV"). */
export async function musicPlaces(): Promise<MusicPlace[]> {
  const places: MusicPlace[] = []
  const music = join(homedir(), 'Music')
  for (const entry of await readdir(NETWORK_DIR, { withFileTypes: true }).catch(() => [])) {
    if (entry.isDirectory() && !entry.name.startsWith('.')) places.push({ name: entry.name.replace(/[-_]+/g, ' '), path: join(NETWORK_DIR, entry.name), kind: 'network' })
  }
  for (const parent of [join('/run/media', userInfo().username), '/media']) {
    for (const entry of await readdir(parent, { withFileTypes: true }).catch(() => [])) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) places.push({ name: entry.name, path: join(parent, entry.name), kind: 'drive' })
    }
  }
  // This TV's own music folder (~/Music) goes last, after the shares and drives.
  if (existsSync(music)) places.push({ name: 'Music on this TV', path: music, kind: 'folder' })
  return places
}

const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** Places switched out of the library (Music sources: a games-only drive), kept with the settings. Still browsable in Folders. */
const SOURCES_FILE = join(homedir(), '.config', 'steamtv', 'music-sources.json')
let excluded: Set<string> | null = null

export async function excludedPlaces(): Promise<Set<string>> {
  if (excluded) return excluded
  try {
    const got = JSON.parse(await readFile(SOURCES_FILE, 'utf8')) as { excluded?: string[] }
    excluded = new Set(Array.isArray(got.excluded) ? got.excluded : [])
  } catch {
    excluded = new Set()
  }
  return excluded
}

/** A place in or out of the library. */
export async function includePlace(path: string, on: boolean): Promise<void> {
  const set = await excludedPlaces()
  if (on) set.delete(resolve(path))
  else set.add(resolve(path))
  await mkdir(dirname(SOURCES_FILE), { recursive: true })
  await writeFile(SOURCES_FILE, JSON.stringify({ excluded: [...set] }, null, 1))
}

/** The places the library reads (search, the index, Claude): every place not switched out. */
export async function libraryPlaces(): Promise<MusicPlace[]> {
  const out = await excludedPlaces()
  return (await musicPlaces()).filter((p) => !out.has(resolve(p.path)))
}

/** A folder's subfolders, then its songs, in name order (track numbers in names sort as numbers). */
export async function browseMusic(dir: string): Promise<MusicEntry[]> {
  const full = resolve(dir)
  if (!allowed(full)) throw new Error("vaporTV can't look in there")
  const entries = (await readdir(full, { withFileTypes: true })).filter((e) => !SYSTEM_FOLDERS.test(e.name))
  const folders: MusicEntry[] = []
  const tracks: MusicEntry[] = []
  await Promise.all(
    entries.map(async (entry) => {
      const path = join(full, entry.name)
      if (entry.isFile()) {
        if (AUDIO.test(entry.name)) tracks.push({ name: entry.name, path, kind: 'track' })
        return
      }
      // A folder (a share's can come back as symlinks or unknown, so ask the file itself), and when it last changed.
      const info = await stat(path).catch(() => null)
      if (info?.isDirectory()) folders.push({ name: entry.name, path, kind: 'folder', modified: info.mtimeMs })
      else if (info?.isFile() && AUDIO.test(entry.name)) tracks.push({ name: entry.name, path, kind: 'track' })
    })
  )
  folders.sort((a, b) => byName.compare(a.name, b.name))
  tracks.sort((a, b) => byName.compare(a.name, b.name))
  return [...folders, ...tracks]
}

/** "03 - Song Name.flac" → "Song Name": a file's name as a title when its tags have none. */
export function titleFromName(file: string): string {
  const name = basename(file, extname(file))
  return name.replace(/^\s*(\d{1,3}|[a-d]\d{1,2})(\s*[-–._]\s*|\s+)(?=\S)/i, '').trim() || name
}

const tagCache = new Map<string, MusicTags>()
const folderCovers = new Map<string, Promise<string | undefined>>()

async function saveCover(key: string, data: Uint8Array, format: string): Promise<string> {
  const ext = /png/i.test(format) ? 'png' : /webp/i.test(format) ? 'webp' : 'jpg'
  const file = join(MUSIC_COVERS, `${createHash('sha1').update(key).digest('hex').slice(0, 20)}.${ext}`)
  if (!existsSync(file)) {
    await mkdir(MUSIC_COVERS, { recursive: true })
    await writeFile(file, data)
  }
  return artUrl(file)
}

/** A folder's picture (cover.jpg and the like), copied beside the others; once per folder. */
function folderCover(dir: string): Promise<string | undefined> {
  let found = folderCovers.get(dir)
  if (!found) {
    found = (async () => {
      const names = await readdir(dir).catch(() => [] as string[])
      const name = names.find((n) => FOLDER_COVERS.test(n))
      if (!name) return undefined
      return saveCover(join(dir, name), await readFile(join(dir, name)), extname(name))
    })().catch(() => undefined)
    folderCovers.set(dir, found)
  }
  return found
}

/** One song's tags (from its file, or its name when it has none), and its cover if it or its folder has one. */
export async function readTags(path: string): Promise<MusicTags> {
  const cached = tagCache.get(path)
  if (cached) return cached
  let tags: MusicTags = { path, title: titleFromName(path) }
  try {
    // duration: false reads it from the headers, not by scanning the whole file (slow over a share).
    const meta = await parseFile(path, { duration: false })
    const c = meta.common
    tags = {
      path,
      title: c.title?.trim() || titleFromName(path),
      artist: c.artist?.trim() || c.albumartist?.trim() || undefined,
      album: c.album?.trim() || undefined,
      albumArtist: c.albumartist?.trim() || undefined,
      track: c.track?.no ?? undefined,
      disc: c.disk?.no ?? undefined,
      year: c.year ?? undefined,
      genre: c.genre?.map((g) => g.split(/\s*[,;/|]\s*/)[0].trim()).find(Boolean),
      duration: meta.format.duration && Number.isFinite(meta.format.duration) ? meta.format.duration : undefined
    }
    const picture = c.picture?.[0]
    // Songs of an album share their cover: saved once, by album (or by file, without one).
    if (picture) tags.cover = await saveCover(`${c.albumartist ?? c.artist ?? ''}/${c.album ?? path}/${picture.data.length}`, picture.data, picture.format)
  } catch {
    // Not readable as a song (or a share hiccup): its name will do.
  }
  if (!tags.cover) tags.cover = await folderCover(dirname(path))
  tagCache.set(path, tags)
  return tags
}

/** `work` on each of these, READ_AT_ONCE at a time; the answers in the order asked. */
async function fewAtATime<T, R>(items: T[], work: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++
      out[i] = await work(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(READ_AT_ONCE, items.length) }, worker))
  return out
}

/** Tags for these songs, a few at a time; in the order asked. */
export async function musicTags(paths: string[]): Promise<MusicTags[]> {
  return fewAtATime(
    paths.map((p) => resolve(p)).filter((p) => allowed(p) && AUDIO.test(p)),
    readTags
  )
}

/** "Aphex Twin - Syro" → artist and album; a name without " - " is the album alone. */
export function splitFolderName(name: string): { artist?: string; title: string } {
  const at = name.search(/\s+[-–]\s+/)
  if (at <= 0) return { title: name.trim() }
  const rest = name.slice(at).replace(/^\s+[-–]\s+/, '').trim()
  return rest ? { artist: name.slice(0, at).trim(), title: rest } : { title: name.trim() }
}

const folderCache = new Map<string, Promise<MusicFolder>>()

/** A folder's first song and first subfolder, in name order (as the list shows them). */
async function firstInside(dir: string): Promise<{ song?: string; folder?: string }> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const names = entries.filter((e) => !SYSTEM_FOLDERS.test(e.name)).sort((a, b) => byName.compare(a.name, b.name))
  const song = names.find((e) => !e.isDirectory() && AUDIO.test(e.name))
  const folder = names.find((e) => e.isDirectory())
  return { song: song && join(dir, song.name), folder: folder && join(dir, folder.name) }
}

/**
 * A folder as a card: its picture (cover.jpg and the like, else its first song's), and the album
 * and artist that song's tags name. A folder of folders (an artist's albums) shows its first
 * album's cover. Without tags, its name: "Artist - Album" splits in two.
 */
function readFolder(dir: string): Promise<MusicFolder> {
  let found = folderCache.get(dir)
  if (!found) {
    found = (async () => {
      const named = splitFolderName(basename(dir))
      const card: MusicFolder = { path: dir, ...named }
      const { song, folder } = await firstInside(dir)
      if (song) {
        const tags = await readTags(song)
        if (tags.album) card.title = tags.album
        if (tags.artist) card.artist = tags.artist
        if (tags.year) card.year = tags.year
        if (tags.genre) card.genre = tags.genre
        card.cover = tags.cover
      } else if (folder) {
        // An artist's folder: their first album's cover and genre.
        const first = await readFolder(folder)
        card.cover = (await folderCover(dir)) ?? first.cover
        if (first.genre) card.genre = first.genre
      } else {
        card.cover = await folderCover(dir)
      }
      return card
    })().catch(() => ({ path: dir, ...splitFolderName(basename(dir)) }))
    folderCache.set(dir, found)
  }
  return found
}

/** Folders as cards, a few at a time; in the order asked. */
export async function musicFolders(paths: string[]): Promise<MusicFolder[]> {
  return fewAtATime(
    paths.map((p) => resolve(p)).filter((p) => allowed(p)),
    readFolder
  )
}

/** Searching walks this deep into a place, and stops at this many folders and songs. */
const SEARCH_DEPTH = 6
const SEARCH_MOST = 40_000
/** A place's names are walked once, and walked again after this long (music gets added). */
const INDEX_MS = 5 * 60_000
/** At most this many of each come back. */
const FOUND_FOLDERS = 60
const FOUND_SONGS = 100

export interface Indexed {
  entry: MusicEntry
  /** Its path from the place, folded for matching. */
  where: string
  /** Its own name, folded. */
  own: string
  /** A folder: whether songs are right in it (an album, not an artist's folder of them). */
  album?: boolean
}

const indexes = new Map<string, { at: number; names: Promise<Indexed[]> }>()

/** "Beyoncé" and "beyonce" match: lower case, accents off. */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/**
 * Folders a search and the index don't go into: games' and emulators' (a game drive's sound
 * effects aren't music), Wine prefixes (whose z: is the whole system), and vaporTV's own
 * Ambience (rain and the like, for the background).
 */
export const NOT_MUSIC = /^(gog|lutris|heroic|steam|steamapps|steamlibrary|compatdata|shadercache|dosdevices|drive_c|pfx|prefix|\.?wine|games?|emulation|emudeck|roms|bios|saves|states|retroarch|rpcs3|ryujinx|yuzu|dolphin|pcsx2|ppsspp|duckstation|xemu|xenia|cemu|ambience)$/i

/** Every folder and song name in a place (not their tags: a share would take minutes). */
async function walk(root: string): Promise<Indexed[]> {
  const out: Indexed[] = []
  const visit = async (dir: string, depth: number, self?: Indexed): Promise<void> => {
    if (out.length >= SEARCH_MOST) return
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    const inner: Indexed[] = []
    for (const e of entries) {
      if (SYSTEM_FOLDERS.test(e.name) || out.length >= SEARCH_MOST) continue
      // Links aren't followed: a Wine prefix's z: leads to the whole system.
      if (e.isSymbolicLink()) continue
      const path = join(dir, e.name)
      let isDir = e.isDirectory()
      let isFile = e.isFile()
      if (!isDir && !isFile) {
        const info = await stat(path).catch(() => null)
        isDir = !!info?.isDirectory()
        isFile = !!info?.isFile()
      }
      const where = fold(path.slice(root.length + 1))
      if (isDir && NOT_MUSIC.test(e.name)) continue
      if (isDir) {
        const folder: Indexed = { entry: { name: e.name, path, kind: 'folder' }, where, own: fold(e.name) }
        out.push(folder)
        inner.push(folder)
      } else if (isFile && AUDIO.test(e.name)) {
        out.push({ entry: { name: e.name, path, kind: 'track' }, where, own: fold(basename(e.name, extname(e.name))) })
        if (self) self.album = true
      }
    }
    if (depth < SEARCH_DEPTH) for (const d of inner) await visit(d.entry.path, depth + 1, d)
  }
  await visit(root, 1)
  return out
}

/** A place's names, walked again when they're older than INDEX_MS. */
export function indexOf(root: string): Promise<Indexed[]> {
  let index = indexes.get(root)
  if (!index || Date.now() - index.at > INDEX_MS) {
    index = { at: Date.now(), names: walk(root) }
    indexes.set(root, index)
  }
  return index.names
}

/** Starts walking every place (opening the app does), so the first search doesn't wait for a share. */
export async function warmMusicIndex(): Promise<void> {
  for (const place of await libraryPlaces()) void indexOf(resolve(place.path))
}

/**
 * Folders and songs in every place whose names match: every word somewhere in its path from
 * the place ("aphex syro" finds Aphex Twin/Syro), and at least one in its own name (so "aphex"
 * finds the artist's folder, not every song inside it). Folders first, then songs, each in name order.
 */
export async function searchMusic(query: string): Promise<MusicEntry[]> {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const all = (await Promise.all((await libraryPlaces()).map((p) => indexOf(resolve(p.path))))).flat()
  const found = all.filter((i) => words.every((w) => i.where.includes(w)) && words.some((w) => i.own.includes(w)))
  const named = (a: Indexed, b: Indexed): number => byName.compare(a.entry.name, b.entry.name)
  const folders = found.filter((i) => i.entry.kind === 'folder').sort(named).slice(0, FOUND_FOLDERS)
  const songs = found.filter((i) => i.entry.kind === 'track').sort(named).slice(0, FOUND_SONGS)
  return [...folders, ...songs].map((i) => i.entry)
}

/** Every album (a folder with songs right in it) in every place, as "Artist/Album" from its place, for Claude to choose from. */
export async function musicAlbums(): Promise<{ entry: MusicEntry; where: string }[]> {
  const out: { entry: MusicEntry; where: string }[] = []
  for (const place of await libraryPlaces()) {
    const root = resolve(place.path)
    for (const i of await indexOf(root)) if (i.album) out.push({ entry: i.entry, where: i.entry.path.slice(root.length + 1) })
  }
  return out
}

/** Audio and cover pictures: what copying a folder of music brings across. */
const COPIED = /\.(mp3|flac|ogg|opus|m4a|aac|wav|wma|aiff?|alac|ape|wv|jpe?g|png|webp)$/i

/**
 * Copy a song, or a whole folder of them (an album, an artist's albums), into ~/Music: a
 * folder keeps its name and what's inside (audio and covers only); one already there of the
 * same name gets " (2)". Returns where it went.
 */
export async function copyMusic(source: string): Promise<string> {
  const from = resolve(source)
  if (!allowed(from)) throw new Error("vaporTV can't copy from there")
  const music = join(homedir(), 'Music')
  const info = await stat(from)
  if (info.isFile()) return copyInto(from, music)
  let target = join(music, basename(from))
  for (let n = 2; existsSync(target); n++) target = join(music, `${basename(from)} (${n})`)
  await cp(from, target, { recursive: true, filter: (src) => src === from || COPIED.test(src) || statSyncDir(src) })
  return target
}

function statSyncDir(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}
