import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { homedir, userInfo } from 'node:os'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { parseFile } from 'music-metadata'
import type { MusicEntry, MusicPlace, MusicTags } from '../shared/types'
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
  const entries = await readdir(full, { withFileTypes: true })
  const folders: MusicEntry[] = []
  const tracks: MusicEntry[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const path = join(full, entry.name)
    // A share's folders can come back as symlinks or unknown; ask the file itself.
    const isDir = entry.isDirectory() || ((entry.isSymbolicLink() || !entry.isFile()) && (await stat(path).then((s) => s.isDirectory()).catch(() => false)))
    if (isDir) folders.push({ name: entry.name, path, kind: 'folder' })
    else if (AUDIO.test(entry.name)) tracks.push({ name: entry.name, path, kind: 'track' })
  }
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

/** Tags for these songs, a few at a time; in the order asked. */
export async function musicTags(paths: string[]): Promise<MusicTags[]> {
  const ok = paths.map((p) => resolve(p)).filter((p) => allowed(p) && AUDIO.test(p))
  const out: MusicTags[] = new Array(ok.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < ok.length) {
      const i = next++
      out[i] = await readTags(ok[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(READ_AT_ONCE, ok.length) }, worker))
  return out
}
