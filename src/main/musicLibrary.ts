import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { homedir, userInfo } from 'node:os'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { parseFile } from 'music-metadata'
import type { MusicEntry, MusicFolder, MusicPlace, MusicTags } from '../shared/types'
import { allowed, AUDIO } from './browse'
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

/** Where to start: ~/Music, the shares, then the drives. */
export async function musicPlaces(): Promise<MusicPlace[]> {
  const places: MusicPlace[] = []
  const music = join(homedir(), 'Music')
  if (existsSync(music)) places.push({ name: 'Music', path: music, kind: 'folder' })
  for (const entry of await readdir(NETWORK_DIR, { withFileTypes: true }).catch(() => [])) {
    if (entry.isDirectory() && !entry.name.startsWith('.')) places.push({ name: entry.name.replace(/[-_]+/g, ' '), path: join(NETWORK_DIR, entry.name), kind: 'network' })
  }
  for (const parent of [join('/run/media', userInfo().username), '/media']) {
    for (const entry of await readdir(parent, { withFileTypes: true }).catch(() => [])) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) places.push({ name: entry.name, path: join(parent, entry.name), kind: 'drive' })
    }
  }
  return places
}

const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

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
async function readTags(path: string): Promise<MusicTags> {
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
      track: c.track?.no ?? undefined,
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
        card.cover = tags.cover
      } else {
        card.cover = await folderCover(dir)
        if (!card.cover && folder) card.cover = (await readFolder(folder)).cover
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
