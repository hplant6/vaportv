import { existsSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import type { GameInfo } from '../../shared/types'

// What ES-DE's scraper saved about each game (its gamelist.xml per system): a fuller
// description, a rating, and the year, genre, players and makers. Only there for people
// who've scraped in ES-DE; it goes over the libretro database's where both have a field.

const gamelistDirs = (): string[] =>
  process.env.STEAMTV_ESDE_GAMELISTS ? [process.env.STEAMTV_ESDE_GAMELISTS] : [join(homedir(), 'ES-DE', 'gamelists'), join(homedir(), '.emulationstation', 'gamelists')]

/** ES-DE's folder names for each console (EmuDeck's ROM folders are named the same). Arcade games say their own. */
const SYSTEMS: Record<string, string[]> = {
  gamecube: ['gc'],
  wii: ['wii'],
  wiiu: ['wiiu'],
  switch: ['switch'],
  ps2: ['ps2'],
  ps3: ['ps3'],
  psx: ['psx'],
  psp: ['psp'],
  xbox: ['xbox'],
  xbox360: ['xbox360'],
  dreamcast: ['dreamcast'],
  saturn: ['saturn'],
  n64: ['n64'],
  nes: ['nes', 'famicom'],
  snes: ['snes', 'sfc'],
  genesis: ['genesis', 'megadrive'],
  sega32x: ['sega32x'],
  amiga: ['amiga']
}

export function esdeSystems(platform: string): string[] {
  return SYSTEMS[platform] ?? []
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decode(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, code: string) => {
    if (code[0] !== '#') return ENTITIES[code] ?? whole
    return String.fromCodePoint(code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10))
  })
}

/** A game's key: its file (or folder) name without the extension, lower case. */
export const fileKey = (path: string): string => basename(path).replace(/\.[a-z0-9]{1,4}$/i, '').toLowerCase()

/** gamelist.xml → each game's info by its file's key. */
export function parseGamelist(xml: string): Map<string, GameInfo> {
  const games = new Map<string, GameInfo>()
  for (const [, body] of xml.matchAll(/<game\b[^>]*>([\s\S]*?)<\/game>/g)) {
    const field = (tag: string): string | undefined => {
      const value = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(body)?.[1]
      return value?.trim() ? decode(value.trim()) : undefined
    }
    const path = field('path')
    if (!path) continue
    const rating = Number(field('rating'))
    const info: GameInfo = {
      year: /^(\d{4})/.exec(field('releasedate') ?? '')?.[1],
      genre: field('genre'),
      players: field('players'),
      developer: field('developer'),
      publisher: field('publisher'),
      description: field('desc'),
      rating: rating > 0 && rating <= 1 ? rating : undefined
    }
    for (const key of Object.keys(info) as (keyof GameInfo)[]) if (info[key] === undefined) delete info[key]
    if (Object.keys(info).length) games.set(fileKey(path), info)
  }
  return games
}

const cache = new Map<string, { mtime: number; games: Map<string, GameInfo> }>()

/** A system's gamelist, read again only when ES-DE has changed it. */
async function gamelist(system: string): Promise<Map<string, GameInfo>> {
  for (const dir of gamelistDirs()) {
    const file = join(dir, system, 'gamelist.xml')
    if (!existsSync(file)) continue
    const mtime = (await stat(file)).mtimeMs
    const hit = cache.get(file)
    if (hit?.mtime === mtime) return hit.games
    const games = parseGamelist(await readFile(file, 'utf8'))
    cache.set(file, { mtime, games })
    return games
  }
  return new Map()
}

/** What ES-DE scraped for a game, found by any of its files' (or folders') names. */
export async function esdeInfo(systems: string[], files: string[]): Promise<GameInfo | null> {
  const keys = [...new Set(files.map(fileKey))]
  for (const system of systems) {
    const games = await gamelist(system).catch(() => new Map<string, GameInfo>())
    for (const key of keys) {
      const found = games.get(key)
      if (found) return found
    }
  }
  return null
}
