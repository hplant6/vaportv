import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface Ps3Game {
  /** `ps3:<title id>` */
  id: string
  title: string
  /** e.g. BLUS30443, NPUB30910 */
  titleId: string
  /** Installed to RPCS3's internal drive (PSN games), or a disc folder. */
  kind: 'hdd' | 'disc'
  /** Installed games: their folder under hdd0/game. Disc games: the folder holding PS3_GAME. */
  path: string
  /** The game's own 320×176 icon, a fallback for wide art. */
  icon?: string
}

/** Reads a PARAM.SFO (Sony's key/value metadata file). */
export function parseSfo(data: Buffer): Record<string, string | number> {
  if (data.length < 20 || data.readUInt32BE(0) !== 0x00505346) return {}
  const keyTable = data.readUInt32LE(8)
  const dataTable = data.readUInt32LE(12)
  const count = data.readUInt32LE(16)
  const out: Record<string, string | number> = {}
  for (let i = 0; i < count; i++) {
    const entry = 20 + i * 16
    if (entry + 16 > data.length) break
    const keyOffset = data.readUInt16LE(entry)
    const format = data.readUInt16LE(entry + 2)
    const length = data.readUInt32LE(entry + 4)
    const dataOffset = data.readUInt32LE(entry + 12)
    const keyStart = keyTable + keyOffset
    const key = data.toString('utf8', keyStart, data.indexOf(0, keyStart))
    const value = data.subarray(dataTable + dataOffset, dataTable + dataOffset + length)
    // 0x0404: 32-bit integer; otherwise UTF-8 text, NUL-padded.
    out[key] = format === 0x0404 ? value.readUInt32LE(0) : value.toString('utf8').replace(/\0+$/, '')
  }
  return out
}

/** Store titles carry ™/® marks and sometimes line breaks; drop them for display and search. */
export function cleanPs3Title(title: string): string {
  return title
    .replace(/[™®©]/g, '')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The folder holding PS3_GAME: the given one, or one level down (extracted into its own folder). */
async function findDisc(folder: string): Promise<string | null> {
  if (existsSync(join(folder, 'PS3_GAME', 'PARAM.SFO'))) return folder
  for (const sub of await readdir(folder, { withFileTypes: true }).catch(() => [])) {
    if (sub.isDirectory() && existsSync(join(folder, sub.name, 'PS3_GAME', 'PARAM.SFO'))) return join(folder, sub.name)
  }
  return null
}

async function sfo(path: string): Promise<Record<string, string | number>> {
  return parseSfo(await readFile(path).catch(() => Buffer.alloc(0)))
}

/**
 * PS3 games: those installed to RPCS3's internal drive (`hdd0`/game, category HG)
 * plus disc folders under `discRoot` (each holding PS3_GAME). Updates and disc
 * add-on data (categories GD, DG under hdd0) aren't games on their own.
 */
export async function scanPs3(hdd0: string, discRoot: string, titles: Record<string, string> = {}): Promise<Ps3Game[]> {
  const games = new Map<string, Ps3Game>()

  const gameDir = join(hdd0, 'game')
  for (const folder of await readdir(gameDir).catch(() => [] as string[])) {
    const param = await sfo(join(gameDir, folder, 'PARAM.SFO'))
    if (param.CATEGORY !== 'HG') continue
    const titleId = String(param.TITLE_ID ?? folder)
    const icon = join(gameDir, folder, 'ICON0.PNG')
    games.set(titleId, {
      id: `ps3:${titleId}`,
      title: titles[titleId] ?? cleanPs3Title(String(param.TITLE ?? folder)),
      titleId,
      kind: 'hdd',
      path: join(gameDir, folder),
      icon: existsSync(icon) ? icon : undefined
    })
  }

  for (const folder of await readdir(discRoot).catch(() => [] as string[])) {
    const disc = await findDisc(join(discRoot, folder))
    if (!disc) continue
    const base = join(disc, 'PS3_GAME')
    const param = await sfo(join(base, 'PARAM.SFO'))
    if (!param.TITLE_ID) continue
    const titleId = String(param.TITLE_ID)
    const icon = join(base, 'ICON0.PNG')
    games.set(titleId, {
      id: `ps3:${titleId}`,
      title: titles[titleId] ?? cleanPs3Title(String(param.TITLE ?? folder)),
      titleId,
      kind: 'disc',
      path: disc,
      icon: existsSync(icon) ? icon : undefined
    })
  }

  return [...games.values()].sort((a, b) => a.title.localeCompare(b.title))
}
