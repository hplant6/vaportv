import { join } from 'node:path'
import type { LibraryTab } from '../../shared/types'
import { recentsLayout, type Config } from '../config'
import { scanDreamcast, type DreamcastGame } from './dreamcast'
import { emulatedTab, fillEmulatedArt, withNames, type EmulatedGame } from './emulated'
import { romRoot } from './emudeck'
import { discContent, dumpName } from './discs'
import { FLYCAST_CORE, RETROARCH } from './emulators'

export function dreamcastRoot(config: Config): string {
  return process.env.STEAMTV_DREAMCAST_ROMS ?? join(romRoot(config), 'dreamcast')
}

export async function loadDreamcastGames(config: Config): Promise<DreamcastGame[]> {
  return scanDreamcast(dreamcastRoot(config), config.dreamcastTitles)
}

function asEmulated(game: DreamcastGame): EmulatedGame {
  return { id: game.id, title: game.title, platform: 'dreamcast', artKey: `dreamcast:${game.title}`, thumbnailNames: [dumpName(game)] }
}

export async function dreamcastGames(config: Config): Promise<EmulatedGame[]> {
  return withNames(config, (await loadDreamcastGames(config)).map(asEmulated))
}

export async function loadDreamcastTab(config: Config): Promise<LibraryTab> {
  return emulatedTab(await dreamcastGames(config), config.dreamcastLayout ?? 'rows', recentsLayout(config, 'dreamcast'))
}

export function fillDreamcastArt(config: Config, onUpdate: () => void): void {
  fillEmulatedArt('dreamcast', config.steamGridDbKey, () => dreamcastGames(config), onUpdate)
}

/** What RetroArch opens: the game's file, or a .m3u of every disc for Disc Control. */
export function dreamcastContent(game: DreamcastGame): Promise<string> {
  return discContent(game)
}

/** RetroArch (Flatpak) with the Flycast core, full-screen. */
export function flycastCommand(config: Config, content: string): { command: string; args: string[] } {
  const [command, ...args] = config.retroarch ?? RETROARCH
  return { command, args: [...args, '-L', config.flycastCore ?? FLYCAST_CORE, '-f', content] }
}
