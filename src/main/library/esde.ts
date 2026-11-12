import { readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, extname, join } from 'node:path'
import { mainGenre } from '../../shared/genres'

// What ES-DE's scrapers saved about each game (its gamelist.xml per system): the genre and
// release year, for the left bar's Genres and Years. Read, not changed; a game ES-DE hasn't
// scraped just has neither.

/** ES-DE's folder for each tab's games, where its name differs (or there are two). */
const SYSTEMS: Record<string, string[]> = {
  gamecube: ['gc', 'gamecube'],
  genesis: ['genesis', 'megadrive']
}

export interface GameFacts {
  genre?: string
  year?: number
}

interface Entry extends GameFacts {
  path: string
  name: string
}

function gamelistsDir(): string {
  return process.env.STEAMTV_ESDE_GAMELISTS ?? join(homedir(), 'ES-DE', 'gamelists')
}

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function text(block: string, tag: string): string | undefined {
  const found = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1]
  return found?.replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => XML_ENTITIES[e]).trim()
}

/** The <game> entries of a gamelist.xml. */
export function parseGamelist(xml: string): Entry[] {
  const entries: Entry[] = []
  for (const [, block] of xml.matchAll(/<game>([\s\S]*?)<\/game>/g)) {
    const path = text(block, 'path')
    if (!path) continue
    const year = Number(text(block, 'releasedate')?.slice(0, 4))
    entries.push({ path, name: text(block, 'name') ?? '', genre: mainGenre(text(block, 'genre')), year: year > 1970 && year < 2100 ? year : undefined })
  }
  return entries
}

/** A name to match by: lower case, no extension, nothing in brackets, letters and digits only. */
export function matchKey(name: string): string {
  return name
    .replace(/\.[a-z0-9]{1,7}$/i, '')
    .replace(/[([{][^)\]}]*[)\]}]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

// Read again only when the file changes.
const cache = new Map<string, { mtime: number; entries: Entry[] }>()

async function readGamelist(system: string): Promise<Entry[]> {
  const file = join(gamelistsDir(), system, 'gamelist.xml')
  const info = await stat(file).catch(() => null)
  if (!info) return []
  const cached = cache.get(file)
  if (cached?.mtime === info.mtimeMs) return cached.entries
  const entries = parseGamelist(await readFile(file, 'utf8').catch(() => ''))
  cache.set(file, { mtime: info.mtimeMs, entries })
  return entries
}

/** Each game's genre and year where ES-DE has them, by id: matched by its file's name, else its title. */
export async function gameFacts(platform: string, games: { id: string; title: string; path?: string }[]): Promise<Map<string, GameFacts>> {
  const entries = (await Promise.all((SYSTEMS[platform] ?? [platform]).map(readGamelist))).flat()
  const facts = new Map<string, GameFacts>()
  if (!entries.length) return facts
  const byFile = new Map<string, Entry>()
  const byName = new Map<string, Entry>()
  for (const entry of entries) {
    if (!entry.genre && !entry.year) continue
    const file = matchKey(basename(entry.path))
    const folder = matchKey(basename(entry.path.slice(0, entry.path.length - basename(entry.path).length - 1)))
    if (file && !byFile.has(file)) byFile.set(file, entry)
    // A game in its own folder (Switch's, PS3's) by the folder's name too.
    if (folder && !byFile.has(folder)) byFile.set(folder, entry)
    const name = matchKey(entry.name)
    if (name && !byName.has(name)) byName.set(name, entry)
  }
  for (const game of games) {
    const file = game.path ? matchKey(basename(game.path, extname(game.path))) : ''
    const entry = (file && byFile.get(file)) || byName.get(matchKey(game.title))
    if (entry) facts.set(game.id, { genre: entry.genre, year: entry.year })
  }
  return facts
}
