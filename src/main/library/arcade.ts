import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { arcadeRowName, type ArcadeRow } from '../../shared/arcade'
import type { CollectionRow, LibraryTab } from '../../shared/types'
import { recentsLayout, type Config } from '../config'
import { readFavorites, readHistory } from '../history'
import { emulatedItem, fillEmulatedArt, type EmulatedGame } from './emulated'
import { romRoot } from './emudeck'
import { arcadeCoreFile, RETROARCH, type ArcadeCore as Core } from './emulators'

// The Arcade tab gathers several boards' folders: each game is a MAME-style ROM set
// (sf2.zip), named from MAME's list, and opens in RetroArch with that board's core.

export interface ArcadeSystem {
  id: Exclude<ArcadeRow, 'recent' | 'favorites'>
  name: string
  /** Folders under the ROM root (EmuDeck's names), and the core each one's sets are for. */
  folders: { dir: string; core: Core }[]
}

/** The tab's rows after Recently played and Favorites, in this order. */
export const ARCADE_SYSTEMS: ArcadeSystem[] = [
  { id: 'atomiswave', name: arcadeRowName('atomiswave'), folders: [{ dir: 'atomiswave', core: 'flycast' }] },
  { id: 'naomi', name: arcadeRowName('naomi'), folders: [{ dir: 'naomi', core: 'flycast' }, { dir: 'naomigd', core: 'flycast' }] },
  { id: 'naomi2', name: arcadeRowName('naomi2'), folders: [{ dir: 'naomi2', core: 'flycast' }] },
  {
    id: 'cps',
    name: arcadeRowName('cps'),
    folders: ['cps', 'cps1', 'cps2', 'cps3'].map((dir) => ({ dir, core: 'fbneo' as const }))
  },
  { id: 'neogeo', name: arcadeRowName('neogeo'), folders: [{ dir: 'neogeo', core: 'fbneo' }] },
  {
    id: 'arcade',
    name: arcadeRowName('arcade'),
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
}

let names: { games: Names['games']; skip: Set<string> } | null = null

async function arcadeNames(): Promise<NonNullable<typeof names>> {
  if (!names) {
    // 2 MB of names: read only when the Arcade tab or Recents needs them.
    const data = (await import('./arcade-names.json')).default as unknown as Names
    names = { games: data.games, skip: new Set(data.skip) }
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

export const arcadeCoreName = (id: string): string => ARCADE_CORES.find((core) => core.id === id)?.name ?? id

/** The cores installed that can run this game's board, its board's own first. */
export function arcadeCoreChoices(config: Config, game: ArcadeGame): { id: string; name: string }[] {
  return ARCADE_CORES.filter((core) => core.boards.includes(game.system) && existsSync(arcadeCoreFile(config, core.id)))
    .sort((a, b) => Number(b.id === game.defaultCore) - Number(a.id === game.defaultCore))
    .map(({ id, name }) => ({ id, name }))
}

const ROM_SET = /\.(zip|7z)$/i

export async function arcadeGames(config: Config): Promise<ArcadeGame[]> {
  const { games: known, skip } = await arcadeNames()
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
  return found.sort((a, b) => a.title.localeCompare(b.title))
}

export async function loadArcadeTab(config: Config): Promise<LibraryTab> {
  const layout = config.arcadeLayout ?? 'rows'
  const recents = recentsLayout(config, 'arcade')
  const games = await arcadeGames(config)
  if (!games.length) return { layout, recentsLayout: recents, rows: [] }
  const history = await readHistory()
  const favorites = await readFavorites()
  const items = await Promise.all(games.map((game) => emulatedItem(game, history[game.id], favorites.includes(game.id))))
  const byId = new Map(items.map((item) => [item.id, item]))
  // Carousels turned off in Settings are left out; their games still count elsewhere.
  const hidden = new Set(config.arcadeRowsHidden ?? [])
  const rows: CollectionRow[] = []
  const recent = items.filter((item) => history[item.id]).sort((a, b) => history[b.id] - history[a.id])
  if (recent.length && !hidden.has('recent')) rows.push({ id: 'recent', name: arcadeRowName('recent'), items: recent, notInstalled: 0 })
  const favorite = favorites.map((id) => byId.get(id)).filter((item) => item !== undefined)
  if (favorite.length && !hidden.has('favorites')) {
    rows.push({ id: 'favorites', name: arcadeRowName('favorites'), items: favorite, notInstalled: 0 })
  }
  for (const system of ARCADE_SYSTEMS) {
    if (hidden.has(system.id)) continue
    const systemItems = items.filter((_, i) => games[i].system === system.id)
    if (systemItems.length) rows.push({ id: system.id, name: system.name, items: systemItems, notInstalled: 0, hint: 'Y to favourite' })
  }
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
