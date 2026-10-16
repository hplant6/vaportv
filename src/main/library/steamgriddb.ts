import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, extname, join } from 'node:path'

// Art for games Steam doesn't know about (emulated ones), from steamgriddb.com.
// Everything is cached under ~/.cache/steamtv/art, including "not found", so each
// game is looked up once.

const API = 'https://www.steamgriddb.com/api/v2'
export const ART_CACHE = join(homedir(), '.cache', 'steamtv', 'art')
const INDEX = join(ART_CACHE, 'index.json')
/** Look a missing game up again after this long; SteamGridDB keeps growing. */
const RETRY_MISSES = 14 * 24 * 60 * 60 * 1000

export type ArtKind = 'portrait' | 'wide' | 'hero'

const DIMENSIONS: Record<ArtKind, string> = {
  portrait: '600x900',
  wide: '460x215,920x430',
  // Logo-free wide banners, for the screensaver.
  hero: '1920x620,3840x1240'
}

/** SteamGridDB keeps heroes apart from grids. */
const ENDPOINT: Record<ArtKind, string> = { portrait: 'grids', wide: 'grids', hero: 'heroes' }

interface IndexEntry {
  /** SteamGridDB game id, or null if the search found nothing. */
  gameId: number | null
  /** File names in ART_CACHE (relative, so the cache can be copied between machines). */
  portrait?: string | null
  wide?: string | null
  hero?: string | null
  checkedAt: number
  /** Chosen by hand in the Artwork window: automatic lookups leave it alone. */
  manual?: boolean
}

let index: Record<string, IndexEntry> | null = null
let loading: Promise<Record<string, IndexEntry>> | null = null

/**
 * The index, read from disk once. Lookups run several at a time; they must all
 * share one object, or a late read replaces another lookup's fresh result.
 */
function loadIndex(): Promise<Record<string, IndexEntry>> {
  loading ??= readFile(INDEX, 'utf8')
    .catch(() => '{}')
    .then((text) => (index = JSON.parse(text) as Record<string, IndexEntry>))
  return loading
}

// Lookups run a few at a time; saves go one after another so they can't race on
// the temporary file.
let saving: Promise<void> = Promise.resolve()

function saveIndex(): Promise<void> {
  saving = saving.then(async () => {
    await mkdir(ART_CACHE, { recursive: true })
    await writeFile(`${INDEX}.tmp`, JSON.stringify(index, null, 1))
    await rename(`${INDEX}.tmp`, INDEX)
  })
  return saving
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * A SteamGridDB API call: its data, or null when the answer is "nothing there".
 * Throttling and server errors are retried, then thrown, so a failed request is
 * never mistaken for (and cached as) "not on SteamGridDB".
 */
async function api<T>(key: string, path: string): Promise<T | null> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000)
    })
    if (res.status === 401 || res.status === 403) throw new Error('SteamGridDB rejected the API key')
    if (res.status === 404) return null
    if (res.ok) {
      // A response cut short under load fails to parse; that's worth a retry too.
      const body = (await res.json().catch(() => null)) as { success: boolean; data: T } | null
      if (body) return body.success ? body.data : null
    }
    if (attempt >= 3) throw new Error(`SteamGridDB: HTTP ${res.status} for ${path}`)
    // 429 or a server hiccup: back off and try again.
    await sleep(2000 * 2 ** attempt)
  }
}

async function download(url: string, cacheKey: string, kind: ArtKind): Promise<string | null> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
  if (!res.ok) return null
  const ext = extname(new URL(url).pathname) || '.jpg'
  const hash = (s: string, n: number): string => createHash('sha1').update(s).digest('hex').slice(0, n)
  // The source's hash in the name: a different picture gets a different file (and URL), so
  // the page shows the new one rather than the cached old one.
  const file = join(ART_CACHE, `${hash(cacheKey, 16)}-${kind}-${hash(url, 6)}${ext}`)
  await mkdir(ART_CACHE, { recursive: true })
  await writeFile(file, Buffer.from(await res.arrayBuffer()))
  return basename(file)
}

/** For comparing names: case, punctuation and "Halo - Reach" vs "Halo: Reach" don't matter. */
export function normalizeName(name: string): string {
  return name
    // Compatibility forms to plain ones: "Ⅴ" → "V", full-width letters → ASCII.
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * SteamGridDB's game for a title: a result with exactly that name if there is one
 * (the first result is sometimes a mod or spin-off, e.g. "Halo 3" → a fan project),
 * otherwise the first result.
 */
async function findGame(key: string, title: string): Promise<number | null> {
  const results = await api<{ id: number; name: string }[]>(key, `/search/autocomplete/${encodeURIComponent(title)}`)
  if (!results?.length) return null
  const wanted = normalizeName(title)
  return (results.find((r) => normalizeName(r.name) === wanted) ?? results[0]).id
}

/** Cached art for a game, without any network access. */
export async function cachedArt(cacheKey: string): Promise<{ portrait?: string; wide?: string; hero?: string }> {
  const entry = (await loadIndex())[cacheKey]
  const keep = (name?: string | null): string | undefined => {
    const path = name && join(ART_CACHE, basename(name))
    return path && existsSync(path) ? path : undefined
  }
  return { portrait: keep(entry?.portrait), wide: keep(entry?.wide), hero: keep(entry?.hero) }
}

/**
 * Finds and downloads art for `title` unless already cached (or recently not found).
 * Returns true if anything new was saved.
 */
export async function fetchArt(key: string, cacheKey: string, title: string): Promise<boolean> {
  const all = await loadIndex()
  const entry = all[cacheKey]
  if (entry?.manual) return false
  const recentMiss = entry?.gameId === null && Date.now() - entry.checkedAt < RETRY_MISSES
  // Entries from before heroes were fetched just get their hero added.
  const complete = entry?.gameId != null && entry.portrait !== undefined && entry.wide !== undefined && entry.hero !== undefined
  if (recentMiss || complete) return false

  let gameId = entry?.gameId ?? null
  if (gameId === null) gameId = await findGame(key, title)
  const next: IndexEntry = { gameId, checkedAt: Date.now(), portrait: entry?.portrait, wide: entry?.wide, hero: entry?.hero }
  if (gameId !== null) {
    for (const kind of ['portrait', 'wide', 'hero'] as const) {
      if (next[kind] !== undefined) continue
      const grids = await api<{ url: string }[]>(
        key,
        `/${ENDPOINT[kind]}/game/${gameId}?dimensions=${DIMENSIONS[kind]}&types=static&nsfw=false&humor=false&epilepsy=false`
      )
      next[kind] = grids?.[0] ? await download(grids[0].url, cacheKey, kind) : null
    }
  }
  all[cacheKey] = next
  await saveIndex()
  return gameId !== null
}

/** A SteamGridDB game, as the Artwork window lists it. */
export interface ArtMatch {
  id: number
  name: string
  /** Release year, when SteamGridDB knows it. */
  year?: number
}

/** SteamGridDB games matching `query`, best first. */
export async function searchGames(key: string, query: string): Promise<ArtMatch[]> {
  const results = await api<{ id: number; name: string; release_date?: number }[]>(key, `/search/autocomplete/${encodeURIComponent(query)}`)
  return (results ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    year: r.release_date ? new Date(r.release_date * 1000).getFullYear() : undefined
  }))
}

/** A game's static portrait covers on SteamGridDB: full image and thumbnail URLs. */
export async function gameCovers(key: string, gameId: number): Promise<{ url: string; thumb: string }[]> {
  const grids = await api<{ url: string; thumb: string }[]>(
    key,
    `/grids/game/${gameId}?dimensions=${DIMENSIONS.portrait}&types=static&nsfw=false&humor=false&epilepsy=false`
  )
  return (grids ?? []).map((g) => ({ url: g.url, thumb: g.thumb }))
}

/**
 * Art chosen by hand: `cover` from SteamGridDB game `gameId`, with that game's first wide
 * art and hero. Saved as manual, so automatic lookups never replace it.
 */
export async function chooseArt(key: string, cacheKey: string, gameId: number, cover: string): Promise<void> {
  const all = await loadIndex()
  const old = all[cacheKey]
  const first = async (kind: 'wide' | 'hero'): Promise<string | null> => {
    const grids = await api<{ url: string }[]>(
      key,
      `/${ENDPOINT[kind]}/game/${gameId}?dimensions=${DIMENSIONS[kind]}&types=static&nsfw=false&humor=false&epilepsy=false`
    )
    return grids?.[0] ? download(grids[0].url, cacheKey, kind) : null
  }
  const next: IndexEntry = {
    gameId,
    checkedAt: Date.now(),
    manual: true,
    portrait: await download(cover, cacheKey, 'portrait'),
    wide: await first('wide'),
    hero: await first('hero')
  }
  all[cacheKey] = next
  await saveIndex()
  // The pictures this replaces.
  for (const kind of ['portrait', 'wide', 'hero'] as const) {
    const file = old?.[kind]
    if (file && file !== next[kind]) await rm(join(ART_CACHE, basename(file)), { force: true })
  }
}

/** Back to automatic: forgets the game's art so the next lookup finds it afresh. */
export async function resetArt(cacheKey: string): Promise<void> {
  const all = await loadIndex()
  delete all[cacheKey]
  await saveIndex()
}
