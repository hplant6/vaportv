import { existsSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { ARCADE_LISTS, arcadeListHidden, arcadeListName, type ArcadeList } from '../../shared/arcade'
import type { CollectionRow, LibraryTab } from '../../shared/types'
import { recentsLayout, type Config } from '../config'
import { readFavorites, readHistory, readPlaytime } from '../history'
import { emulatedItem, emulatedTab, fillEmulatedArt, withNames, type EmulatedGame } from './emulated'
import { romRoot } from './emudeck'
import { gameFacts } from './esde'
import { arcadeCoreFile, RETROARCH, type ArcadeCore as Core } from './emulators'

// The Arcade tab gathers several boards' folders: each game is a MAME-style ROM set
// (sf2.zip), named from MAME's list, and opens in RetroArch with that board's core.
// Neo Geo sets are found the same way (ids stay arcade:neogeo/<set>, so history,
// favourites and chosen cores carry over) but have a tab of their own.

export interface ArcadeSystem {
  id: 'atomiswave' | 'naomi' | 'naomi2' | 'cps' | 'neogeo' | 'arcade'
  name: string
  /** Folders under the ROM root (EmuDeck's names), and the core each one's sets are for. */
  folders: { dir: string; core: Core }[]
}

/** The tab's rows after Recently played and Favorites, in this order. */
export const ARCADE_SYSTEMS: ArcadeSystem[] = [
  { id: 'atomiswave', name: 'Atomiswave', folders: [{ dir: 'atomiswave', core: 'flycast' }] },
  { id: 'naomi', name: 'NAOMI', folders: [{ dir: 'naomi', core: 'flycast' }, { dir: 'naomigd', core: 'flycast' }] },
  { id: 'naomi2', name: 'NAOMI 2', folders: [{ dir: 'naomi2', core: 'flycast' }] },
  {
    id: 'cps',
    name: 'CPS',
    folders: ['cps', 'cps1', 'cps2', 'cps3'].map((dir) => ({ dir, core: 'fbneo' as const }))
  },
  { id: 'neogeo', name: 'Neo Geo', folders: [{ dir: 'neogeo', core: 'fbneo' }] },
  {
    id: 'arcade',
    name: 'MAME',
    folders: [
      { dir: 'arcade', core: 'mame' },
      { dir: 'mame', core: 'mame' },
      { dir: 'fbneo', core: 'fbneo' }
    ]
  }
]

/**
 * Sets current MAME has renamed since the MAME 2010-era sets many collections still
 * have. Anything else MAME's list doesn't know shows its set name, until named in
 * config (`arcadeTitles`).
 */
const OLD_SET_TITLES: Record<string, string> = {
  acedrvrw: 'Ace Driver',
  victlapw: 'Ace Driver: Victory Lap',
  raveracw: 'Rave Racer',
  souledga: 'Soul Edge',
  xmen2p: 'X-Men',
  zigzag: 'Zig Zag',
  sqixbl: 'Super Qix'
}

/** BIOS sets older MAME versions had under names current MAME doesn't use. */
const OLD_BIOS = new Set(['cpzn1', 'cpzn2', 'galgbios', 'taitofx1', 'taitogn', 'psarc95', 'tps', 'vspsx'])

interface Names {
  /** Set name → [description, year, parent set if a clone]. */
  games: Record<string, [string, string, string?]>
  skip: string[]
  /** Capcom's sets by the CPS board they run on (MAME's driver for them). */
  cps: Record<string, 1 | 2 | 3>
}

let names: { games: Names['games']; skip: Set<string>; cps: Names['cps'] } | null = null

async function arcadeNames(): Promise<NonNullable<typeof names>> {
  if (!names) {
    // 2 MB of names: read only when the Arcade tab or Recents needs them.
    const data = (await import('./arcade-names.json')).default as unknown as Names
    names = { games: data.games, skip: new Set(data.skip), cps: data.cps ?? {} }
  }
  return names
}

/**
 * MAME's name down to the game's: no region or revision, and of a western / Japanese
 * pair just the first ("Samurai Shodown / Samurai Spirits" → "Samurai Shodown").
 */
export function arcadeTitle(description: string): string {
  return description.replace(/\s*\(.*$/, '').split(' / ')[0].trim() || description
}

export interface ArcadeGame extends EmulatedGame {
  system: ArcadeSystem['id']
  path: string
  /** A Capcom set's CPS board (whatever folder it's in), for the bar's CPS1, CPS2 and CPS3. */
  board?: 1 | 2 | 3
  /** Its year, as MAME has it. */
  year?: number
  /** The core it opens in: the one chosen for it, else its board's. */
  core: string
  defaultCore: Core
}

/**
 * RetroArch cores that run arcade sets, and the boards each can run. Older MAME
 * versions want sets dumped for them, which is why a game may need one of these.
 */
const ARCADE_CORES: { id: string; name: string; boards: ArcadeSystem['id'][] }[] = [
  { id: 'flycast', name: 'Flycast', boards: ['atomiswave', 'naomi', 'naomi2'] },
  { id: 'fbneo', name: 'FinalBurn Neo', boards: ['cps', 'neogeo', 'arcade'] },
  { id: 'mame', name: 'MAME (current)', boards: ['atomiswave', 'naomi', 'naomi2', 'cps', 'neogeo', 'arcade'] },
  { id: 'mame2016', name: 'MAME 2016', boards: ['cps', 'neogeo', 'arcade'] },
  { id: 'mame2015', name: 'MAME 2015', boards: ['cps', 'neogeo', 'arcade'] },
  { id: 'mame2010', name: 'MAME 2010', boards: ['cps', 'neogeo', 'arcade'] },
  { id: 'mame2003_plus', name: 'MAME 2003-Plus', boards: ['cps', 'neogeo', 'arcade'] },
  { id: 'mame2003', name: 'MAME 2003', boards: ['cps', 'neogeo', 'arcade'] },
  { id: 'mame2000', name: 'MAME 2000', boards: ['cps', 'neogeo', 'arcade'] },
  { id: 'fbalpha2012', name: 'FB Alpha 2012', boards: ['cps', 'neogeo', 'arcade'] }
]


/** The cores installed that can run this game's board, its board's own first. */
export function arcadeCoreChoices(config: Config, game: ArcadeGame): { id: string; name: string }[] {
  return ARCADE_CORES.filter((core) => core.boards.includes(game.system) && existsSync(arcadeCoreFile(config, core.id)))
    .sort((a, b) => Number(b.id === game.defaultCore) - Number(a.id === game.defaultCore))
    .map(({ id, name }) => ({ id, name }))
}

const ROM_SET = /\.(zip|7z)$/i

export async function arcadeGames(config: Config): Promise<ArcadeGame[]> {
  const { games: known, skip, cps } = await arcadeNames()
  const root = process.env.STEAMTV_ARCADE_ROMS ?? romRoot(config)
  const titles = config.arcadeTitles ?? {}
  const found: ArcadeGame[] = []
  for (const system of ARCADE_SYSTEMS) {
    for (const { dir, core } of system.folders) {
      const files = await readdir(join(root, dir)).catch(() => [] as string[])
      for (const file of files) {
        if (!ROM_SET.test(file)) continue
        const set = file.replace(ROM_SET, '')
        if (skip.has(set) || OLD_BIOS.has(set)) continue
        const entry = known[set]
        const parent = entry?.[2]
        const description = titles[set] ?? entry?.[0] ?? OLD_SET_TITLES[set] ?? set
        // Clones share their parent's art: one search for sf2, sf2ce, sf2hf...
        const artTitle = parent && known[parent] ? arcadeTitle(known[parent][0]) : arcadeTitle(description)
        found.push({
          id: `arcade:${dir}/${set}`,
          title: arcadeTitle(description),
          platform: system.id,
          artKey: `arcade:${artTitle}`,
          artTitle,
          // The libretro thumbnails name arcade art after MAME's full name for the set.
          thumbnailNames: [description, ...(parent && known[parent] ? [known[parent][0]] : [])],
          system: system.id,
          // A set MAME doesn't know in a CPS folder: its parent's board, else the folder's (cps2/), else CPS1's.
          board: cps[set] ?? (parent ? cps[parent] : undefined) ?? (system.id === 'cps' ? ((Number(dir.slice(3)) || 1) as 1 | 2 | 3) : undefined),
          year: Number(entry?.[1]) || undefined,
          path: join(root, dir, file),
          core: config.arcadeGameCores?.[`arcade:${dir}/${set}`] ?? core,
          defaultCore: core
        })
      }
    }
  }
  // Two sets of one game (regions, revisions) keep the rest of MAME's name apart.
  const counts = new Map<string, number>()
  for (const game of found) counts.set(`${game.system}:${game.title}`, (counts.get(`${game.system}:${game.title}`) ?? 0) + 1)
  for (const game of found) {
    if ((counts.get(`${game.system}:${game.title}`) ?? 0) < 2) continue
    const set = game.id.slice(game.id.lastIndexOf('/') + 1)
    const full = titles[set] ?? known[set]?.[0]
    if (full) game.title = full
  }
  return withNames(config, found.sort((a, b) => a.title.localeCompare(b.title)))
}

const isNeoGeo = (game: ArcadeGame): boolean => game.system === 'neogeo'

/** The Arcade tab's games: every board but the Neo Geo. */
export async function arcadeTabGames(config: Config): Promise<ArcadeGame[]> {
  return (await arcadeGames(config)).filter((game) => !isNeoGeo(game))
}

/** The Neo Geo tab's games. */
export async function neoGeoGames(config: Config): Promise<ArcadeGame[]> {
  return (await arcadeGames(config)).filter(isNeoGeo)
}

export async function loadNeoGeoTab(config: Config): Promise<LibraryTab> {
  return emulatedTab(await neoGeoGames(config), config.neogeoLayout ?? 'rows', recentsLayout(config, 'neogeo'))
}

/** Which of the bar's system lists a set goes in: its CPS board's, if it's Capcom's, else its board's. */
export function arcadeList(game: ArcadeGame): ArcadeList | null {
  if (game.board) return `cps${game.board}`
  return game.system === 'cps' || game.system === 'neogeo' ? null : game.system
}

/**
 * The Arcade tab: Recently played and Favorites (when there are any), a list per system
 * (Atomiswave, NAOMI, NAOMI 2, CPS1-3, MAME) bar those hidden in Settings, then every game A–Z.
 */
export async function loadArcadeTab(config: Config): Promise<LibraryTab> {
  const layout = config.arcadeLayout ?? 'rows'
  const recents = recentsLayout(config, 'arcade')
  const games = await arcadeTabGames(config)
  if (!games.length) return { layout, recentsLayout: recents, rows: [] }
  const [history, favorites, playtime] = await Promise.all([readHistory(), readFavorites(), readPlaytime()])
  // Genres from ES-DE, folder by folder (it keeps a gamelist per folder: arcade/, cps/, naomi/...); years from it, else MAME.
  const byDir = new Map<string, ArcadeGame[]>()
  for (const game of games) {
    const dir = game.id.slice('arcade:'.length, game.id.lastIndexOf('/'))
    byDir.set(dir, [...(byDir.get(dir) ?? []), game])
  }
  const facts = new Map([...(await Promise.all([...byDir].map(([dir, sets]) => gameFacts(dir, sets))))].flatMap((found) => [...found]))
  const items = await Promise.all(
    games.map(async (game) => ({
      ...(await emulatedItem(game, history[game.id], favorites.includes(game.id), playtime[game.id])),
      genre: facts.get(game.id)?.genre,
      year: facts.get(game.id)?.year ?? game.year,
      added: await stat(game.path).then((info) => info.mtimeMs, () => undefined)
    }))
  )
  const byId = new Map(items.map((item) => [item.id, item]))
  const rows: CollectionRow[] = []
  const recent = items.filter((item) => history[item.id]).sort((a, b) => history[b.id] - history[a.id])
  if (recent.length) rows.push({ id: 'recent', name: 'Recently played', items: recent, notInstalled: 0 })
  const favorite = favorites.map((id) => byId.get(id)).filter((item) => item !== undefined)
  if (favorite.length) rows.push({ id: 'favorites', name: 'Favorites', items: favorite, notInstalled: 0 })
  // Systems hidden in Settings are left out; their games still count in All games, Genres and Years.
  const hidden = config.arcadeRowsHidden ?? []
  const lists = games.map(arcadeList)
  for (const { id } of ARCADE_LISTS) {
    if (arcadeListHidden(hidden, id)) continue
    const listed = items.filter((_, i) => lists[i] === id)
    if (listed.length) rows.push({ id, name: arcadeListName(id), items: listed, notInstalled: 0 })
  }
  rows.push({ id: 'all', name: 'All games', items, notInstalled: 0, hint: 'Y to favourite' })
  return { layout, recentsLayout: recents, rows }
}

export function fillArcadeArt(config: Config, onUpdate: () => void): void {
  fillEmulatedArt('arcade', config.steamGridDbKey, () => arcadeGames(config), onUpdate)
}

/** RetroArch with the set's core, full-screen. */
export function arcadeCommand(config: Config, game: ArcadeGame): { command: string; args: string[] } {
  const [command, ...args] = config.retroarch ?? RETROARCH
  return { command, args: [...args, '-L', arcadeCoreFile(config, game.core), '-f', game.path] }
}
