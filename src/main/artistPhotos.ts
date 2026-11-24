// Photos of the artists on the Music tab, from Deezer's public search (no key, no account): the
// artist whose name matches exactly (ignoring case, accents and punctuation), its large square
// picture, downloaded once to ~/.cache/steamtv/artist-photos. An artist Deezer doesn't have (or
// has no picture of) is remembered, and asked about again after a month. Only names are sent.

import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { artUrl } from './library/art'

export const ARTIST_PHOTOS = join(homedir(), '.cache', 'steamtv', 'artist-photos')
const INDEX = join(ARTIST_PHOTOS, 'index.json')
/** An artist with no photo is asked about again after this long. */
const RETRY_MS = 30 * 24 * 60 * 60 * 1000
/** Deezer allows 50 requests in 5 s; well under it. */
const GAP_MS = 250
/** Names not worth asking about. */
const SKIP = new Set(['unknown artist', 'various artists', 'various', 'va'])

type Entry = { file?: string; missed?: number }
let index: Record<string, Entry> | null = null
let saving: Promise<void> | null = null

/** "Beyoncé", "beyonce", "BEYONCÉ!" as one. */
export function artistKey(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

async function load(): Promise<Record<string, Entry>> {
  if (index) return index
  index = await readFile(INDEX, 'utf8')
    .then((text) => JSON.parse(text) as Record<string, Entry>)
    .catch(() => ({}))
  return index
}

function save(): void {
  saving ??= (async () => {
    await new Promise((r) => setTimeout(r, 2000))
    saving = null
    await mkdir(ARTIST_PHOTOS, { recursive: true })
    const tmp = `${INDEX}.tmp`
    await writeFile(tmp, JSON.stringify(index ?? {}))
    await rename(tmp, INDEX)
  })().catch(() => undefined)
}

/** The photo's URL for the page, where there's one on disk. */
function known(entry: Entry | undefined): string | null {
  return entry?.file && existsSync(join(ARTIST_PHOTOS, entry.file)) ? artUrl(join(ARTIST_PHOTOS, entry.file)) : null
}

/** Deezer's picture of the artist named exactly so, downloaded; its file name, or null. */
async function fetchPhoto(name: string): Promise<string | null> {
  const res = await fetch(`https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=10`, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`Deezer ${res.status}`)
  const found = ((await res.json()) as { data?: { name?: string; picture_xl?: string }[] }).data ?? []
  const want = artistKey(name)
  const hit = found.find((a) => a.name && artistKey(a.name) === want)
  // Deezer's stand-in for an artist without a picture has no image id ("/images/artist//...").
  if (!hit?.picture_xl || hit.picture_xl.includes('/artist//')) return null
  const image = await fetch(hit.picture_xl, { signal: AbortSignal.timeout(15000) })
  if (!image.ok) return null
  const file = `${createHash('sha1').update(want).digest('hex').slice(0, 20)}.jpg`
  await mkdir(ARTIST_PHOTOS, { recursive: true })
  await writeFile(join(ARTIST_PHOTOS, file), Buffer.from(await image.arrayBuffer()))
  return file
}

let queue: string[] = []
let running = false

/**
 * The photos known now for these artists (name → URL); the rest are looked up in the background,
 * a few a second, and `onFound` hears as each arrives.
 */
export async function artistPhotos(names: string[], onFound: (name: string, url: string) => void): Promise<Record<string, string>> {
  const idx = await load()
  const out: Record<string, string> = {}
  const now = Date.now()
  for (const name of names) {
    const k = artistKey(name)
    if (!k || SKIP.has(k)) continue
    const url = known(idx[k])
    if (url) out[name] = url
    else if (!idx[k]?.missed || now - idx[k].missed! > RETRY_MS) queue.push(name)
  }
  queue = [...new Set(queue)]
  if (!running && queue.length) {
    running = true
    void (async () => {
      while (queue.length) {
        const name = queue.shift()!
        const k = artistKey(name)
        try {
          const file = await fetchPhoto(name)
          idx[k] = file ? { file } : { missed: Date.now() }
          save()
          const url = known(idx[k])
          if (url) onFound(name, url)
        } catch {
          // Offline or refused: left to try again next time the tab opens.
        }
        await new Promise((r) => setTimeout(r, GAP_MS))
      }
      running = false
    })()
  }
  return out
}
