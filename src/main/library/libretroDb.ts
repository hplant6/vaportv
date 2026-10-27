import { existsSync } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { GameInfo } from '../../shared/types'
import { normalizeName } from './steamgriddb'

// The libretro game database (what RetroArch's playlists know about a game): year, genre,
// players, developer and publisher for most consoles, and a description for the
// PlayStations. One file per system from the libretro-database repository, cut down to
// those fields and kept a month. Matched by the dump's own name, as the thumbnails are.

const SERVER = 'https://raw.githubusercontent.com/libretro/libretro-database/master/rdb'
const cacheDir = (): string => process.env.STEAMTV_LIBRETRO_DB_CACHE ?? join(homedir(), '.cache', 'steamtv', 'libretro-db')
const TTL = 30 * 24 * 60 * 60 * 1000

/** One game in a system's database, as kept: its dump name, file name and what's known. */
export interface DbEntry {
  name: string
  rom?: string
  info: GameInfo
}

/** Reads one MessagePack value: the subset libretrodb writes (maps, strings, numbers, binary). */
function reader(buf: Buffer, start: number): { next: () => unknown; done: () => boolean } {
  let i = start
  const take = (n: number): Buffer => buf.subarray(i, (i += n))
  const len = (bytes: 1 | 2 | 4): number => {
    const n = bytes === 1 ? buf[i] : bytes === 2 ? buf.readUInt16BE(i) : buf.readUInt32BE(i)
    i += bytes
    return n
  }
  const map = (n: number): Record<string, unknown> => {
    const out: Record<string, unknown> = {}
    for (let k = 0; k < n; k++) out[String(next())] = next()
    return out
  }
  const array = (n: number): unknown[] => Array.from({ length: n }, () => next())
  function next(): unknown {
    const type = buf[i++]
    if (type <= 0x7f) return type
    if (type <= 0x8f) return map(type & 0x0f)
    if (type <= 0x9f) return array(type & 0x0f)
    if (type <= 0xbf) return take(type & 0x1f).toString('utf8')
    switch (type) {
      case 0xc0: return null
      case 0xc2: return false
      case 0xc3: return true
      case 0xc4: return take(len(1))
      case 0xc5: return take(len(2))
      case 0xc6: return take(len(4))
      case 0xcc: return len(1)
      case 0xcd: return len(2)
      case 0xce: return len(4)
      case 0xcf: return Number(take(8).readBigUInt64BE())
      case 0xd9: return take(len(1)).toString('utf8')
      case 0xda: return take(len(2)).toString('utf8')
      case 0xdb: return take(len(4)).toString('utf8')
      case 0xdc: return array(len(2))
      case 0xdd: return array(len(4))
      case 0xde: return map(len(2))
      case 0xdf: return map(len(4))
    }
    throw new Error(`libretro database: unknown type 0x${type.toString(16)} at ${i - 1}`)
  }
  return { next, done: () => i >= buf.length }
}

const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : undefined)

/** A libretrodb file ("RARCHDB\0", then one map per game, then nil and an index) → what's known of each game. */
export function parseRdb(buf: Buffer): DbEntry[] {
  if (buf.subarray(0, 7).toString('latin1') !== 'RARCHDB') throw new Error('libretro database: not an RDB file')
  const read = reader(buf, 16)
  const entries: DbEntry[] = []
  while (!read.done()) {
    const row = read.next()
    if (!row || typeof row !== 'object') break
    const r = row as Record<string, unknown>
    const name = text(r.name)
    if (!name) continue
    const info: GameInfo = {
      year: typeof r.releaseyear === 'number' ? String(r.releaseyear) : undefined,
      genre: text(r.genre),
      players: typeof r.users === 'number' && r.users > 0 ? String(r.users) : undefined,
      developer: text(r.developer),
      publisher: text(r.publisher),
      description: text(r.description)
    }
    for (const key of Object.keys(info) as (keyof GameInfo)[]) if (info[key] === undefined) delete info[key]
    // Rows with nothing to say (most of the hash-only dumps) aren't kept.
    if (Object.keys(info).length) entries.push({ name, rom: text(r.rom_name), info })
  }
  return entries
}

const loaded = new Map<string, Promise<DbEntry[]>>()

/** A system's database, cached as JSON; an old copy serves when the download fails. */
function database(system: string): Promise<DbEntry[]> {
  let entries = loaded.get(system)
  if (!entries) {
    entries = loadDatabase(system).catch((err) => {
      loaded.delete(system)
      throw err
    })
    loaded.set(system, entries)
  }
  return entries
}

async function loadDatabase(system: string): Promise<DbEntry[]> {
  const file = join(cacheDir(), `${system.replace(/[^\w -]/g, '_')}.json`)
  const cached = existsSync(file) ? await stat(file) : null
  if (cached && Date.now() - cached.mtimeMs < TTL) return JSON.parse(await readFile(file, 'utf8')) as DbEntry[]
  try {
    const res = await fetch(`${SERVER}/${encodeURIComponent(system)}.rdb`, { signal: AbortSignal.timeout(60000) })
    if (!res.ok) throw new Error(`libretro database: ${system} ${res.status}`)
    const entries = parseRdb(Buffer.from(await res.arrayBuffer()))
    await mkdir(cacheDir(), { recursive: true })
    await writeFile(file, JSON.stringify(entries))
    return entries
  } catch (err) {
    if (cached) return JSON.parse(await readFile(file, 'utf8')) as DbEntry[]
    throw err
  }
}

/** "Capcom vs. SNK 2 EO (USA)" → "capcom vs snk 2 eo": a name without its tags, for comparing. */
const baseName = (name: string): string => normalizeName(name.replace(/\s*[([].*$/, ''))
const withoutExtension = (file: string): string => file.replace(/\.[a-z0-9]{1,4}$/i, '')

/** USA and World releases first, then Europe, then the rest; among those, the one that says most. */
const rank = (entry: DbEntry): number =>
  (/\((USA|World)/.test(entry.name) ? 0 : /\(Europe/.test(entry.name) ? 100 : 200) - Object.keys(entry.info).length

/**
 * What the database knows of a game: by its exact dump or set name (or file name), else
 * the release with exactly its title. `systems` best first, as for the thumbnails.
 */
export async function libretroInfo(systems: string[], exactNames: string[], title: string): Promise<GameInfo | null> {
  const dbs = await Promise.all(
    systems.map((system) =>
      database(system).catch((err: Error): DbEntry[] => {
        console.error(`steamtv: ${err.message}`)
        return []
      })
    )
  )
  for (const exact of exactNames) {
    for (const entries of dbs) {
      const found = entries.find((e) => e.name === exact) ?? entries.find((e) => e.rom && withoutExtension(e.rom) === exact)
      if (found) return found.info
    }
  }
  const wanted = baseName(title)
  for (const entries of dbs) {
    const same = entries.filter((e) => baseName(e.name) === wanted)
    if (same.length) return same.sort((a, b) => rank(a) - rank(b))[0].info
  }
  return null
}
