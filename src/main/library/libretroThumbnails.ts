import { existsSync } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { EmulatedGame } from './emulated'
import { normalizeName } from './steamgriddb'

// The libretro thumbnail library (what RetroArch shows): box art, and flyers for arcade
// games, named exactly after the No-Intro/Redump dump or MAME's name for the set. Free
// and keyless; a second source when SteamGridDB has no cover.

const SERVER = 'https://thumbnails.libretro.com'
const listingsDir = (): string => process.env.STEAMTV_THUMBNAIL_CACHE ?? join(homedir(), '.cache', 'steamtv', 'libretro-thumbnails')
const LISTING_TTL = 7 * 24 * 60 * 60 * 1000

/** The thumbnail sets for each platform, best first. Switch has none. */
const SYSTEMS: Record<string, string[]> = {
  gamecube: ['Nintendo - GameCube'],
  wii: ['Nintendo - Wii'],
  ps2: ['Sony - PlayStation 2'],
  xbox: ['Microsoft - Xbox'],
  dreamcast: ['Sega - Dreamcast'],
  n64: ['Nintendo - Nintendo 64'],
  saturn: ['Sega - Saturn'],
  nes: ['Nintendo - Nintendo Entertainment System'],
  snes: ['Nintendo - Super Nintendo Entertainment System'],
  genesis: ['Sega - Mega Drive - Genesis'],
  sega32x: ['Sega - 32X'],
  amiga: ['Commodore - Amiga'],
  psx: ['Sony - PlayStation'],
  psp: ['Sony - PlayStation Portable'],
  wiiu: ['Nintendo - Wii U'],
  ps3: ['Sony - PlayStation 3'],
  xbox360: ['Microsoft - Xbox 360'],
  atomiswave: ['Atomiswave', 'MAME'],
  naomi: ['Sega - Naomi', 'MAME'],
  naomi2: ['Sega - Naomi 2', 'MAME'],
  cps: ['FBNeo - Arcade Games', 'MAME'],
  neogeo: ['SNK - Neo Geo', 'FBNeo - Arcade Games', 'MAME'],
  arcade: ['MAME', 'FBNeo - Arcade Games']
}

/** The libretro database names for a platform (what RetroArch's core info files list too), best first. */
export function libretroSystems(platform: string): string[] {
  return SYSTEMS[platform] ?? []
}

/** File names swap these characters for "_" ("Street Fighter II: …" → "Street Fighter II_ …"). */
export function thumbnailName(name: string): string {
  return name.replace(/[&*/:`<>?\\|"]/g, '_')
}

export interface Thumbnail {
  name: string
  url: string
}

const listings = new Map<string, Promise<string[]>>()

/** Every box art name in a set (without .png), from the server's folder listing; kept a week. */
function listing(system: string): Promise<string[]> {
  let names = listings.get(system)
  if (!names) {
    names = loadListing(system).catch((err) => {
      listings.delete(system)
      throw err
    })
    listings.set(system, names)
  }
  return names
}

async function loadListing(system: string): Promise<string[]> {
  const file = join(listingsDir(), `${system.replace(/[^\w -]/g, '_')}.json`)
  if (existsSync(file) && Date.now() - (await stat(file)).mtimeMs < LISTING_TTL) {
    return JSON.parse(await readFile(file, 'utf8')) as string[]
  }
  const res = await fetch(`${SERVER}/${encodeURIComponent(system)}/Named_Boxarts/`, { signal: AbortSignal.timeout(30000) })
  if (!res.ok) throw new Error(`libretro thumbnails: ${system} listing ${res.status}`)
  const html = await res.text()
  const names = [...html.matchAll(/href="([^"]+)\.png"/g)].map((m) => decodeURIComponent(m[1]))
  await mkdir(listingsDir(), { recursive: true })
  await writeFile(file, JSON.stringify(names))
  return names
}

const thumbnail = (system: string, name: string): Thumbnail => ({
  name,
  url: `${SERVER}/${encodeURIComponent(system)}/Named_Boxarts/${encodeURIComponent(name)}.png`
})

/** "Capcom vs. SNK 2 EO (USA)" → "capcom vs snk 2 eo": a name without its tags, for comparing. */
const baseName = (name: string): string => normalizeName(name.replace(/\s*[([].*$/, ''))

/** USA and World releases first, then Europe, then the rest. */
function regionRank(name: string): number {
  if (/\((USA|World)/.test(name)) return 0
  if (/\(Europe/.test(name)) return 1
  return 2
}

/**
 * The game's box art, when one is named for it: its exact dump or set name first,
 * else the one release with exactly its title (USA or World preferred).
 */
export async function libretroCover(game: EmulatedGame): Promise<Thumbnail | null> {
  const systems = SYSTEMS[game.platform] ?? []
  for (const system of systems) {
    const names = new Set(await listing(system).catch(() => [] as string[]))
    for (const exact of game.thumbnailNames ?? []) {
      const name = thumbnailName(exact)
      if (names.has(name)) return thumbnail(system, name)
    }
  }
  const wanted = baseName(game.artTitle ?? game.title)
  for (const system of systems) {
    const same = (await listing(system).catch(() => [] as string[])).filter((name) => baseName(name) === wanted)
    if (same.length) return thumbnail(system, same.sort((a, b) => regionRank(a) - regionRank(b))[0])
  }
  return null
}

/** Box art whose names contain every word of `query`, for picking by hand. */
export async function libretroCovers(game: EmulatedGame, query?: string): Promise<Thumbnail[]> {
  const words = normalizeName(query ?? game.artTitle ?? game.title).split(' ').filter(Boolean)
  const found: Thumbnail[] = []
  for (const system of SYSTEMS[game.platform] ?? []) {
    for (const name of await listing(system).catch(() => [] as string[])) {
      const normal = ` ${normalizeName(name)} `
      if (words.every((word) => normal.includes(` ${word} `))) found.push(thumbnail(system, name))
      if (found.length >= 60) return found
    }
  }
  return found
}

/** Whether there's a thumbnail set for the platform at all. */
export const hasLibretroThumbnails = (platform: string): boolean => (SYSTEMS[platform]?.length ?? 0) > 0
