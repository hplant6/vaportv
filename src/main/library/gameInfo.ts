import { dirname } from 'node:path'
import type { GameInfo } from '../../shared/types'
import type { Config } from '../config'
import { arcadeYear } from './arcade'
import { dumpName } from './discs'
import type { EmulatedGame } from './emulated'
import { esdeInfo, esdeSystems } from './esdeGamelists'
import { discGame } from './gameOptions'
import { libretroInfo } from './libretroDb'
import { libretroSystems } from './libretroThumbnails'

// Start on a console game: what's known about it. The libretro database for everyone,
// ES-DE's scrape over it for those who have one (its descriptions are fuller, and it
// has ratings), and MAME's year for arcade sets.

/** `game` as first found, before any rename: its dump's name is what both sources know it by. */
export async function gameInfo(config: Config, game: EmulatedGame): Promise<GameInfo | null> {
  let systems = esdeSystems(game.platform)
  let files: string[] = []
  const exact = [...(game.thumbnailNames ?? [])]
  let year: string | undefined
  if (game.id.startsWith('arcade:')) {
    // arcade:<ROM folder>/<set>: ES-DE's system is the folder, and MAME's database knows the set's file.
    const [dir, set] = game.id.slice('arcade:'.length).split('/')
    systems = [dir]
    files = [set]
    exact.push(set)
    year = await arcadeYear(set)
  } else {
    const found = await discGame(config, game.id)
    if (found) files = [found.game.path, ...found.game.discs, dumpName(found.game), dirname(found.game.path)]
    else if ('path' in game && typeof game.path === 'string') files = [game.path]
  }
  const [base, scraped] = await Promise.all([
    libretroInfo(libretroSystems(game.platform), exact, game.artTitle ?? game.title).catch(() => null),
    esdeInfo(systems, files).catch(() => null)
  ])
  const info: GameInfo = { ...(year ? { year } : {}), ...base, ...scraped }
  return Object.keys(info).length ? info : null
}
