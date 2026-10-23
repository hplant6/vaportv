import { join } from 'node:path'
import type { LibraryTab } from '../../shared/types'
import { recentsLayout, type Config } from '../config'
import { dumpName } from './discs'
import { emulatedTab, fillEmulatedArt, withNames, type EmulatedGame } from './emulated'
import { romRoot } from './emudeck'
import { SNES9X_CORE, RETROARCH } from './emulators'
import { scanSnes, type SnesGame } from './snes'

export function snesRoot(config: Config): string {
  return process.env.STEAMTV_SNES_ROMS ?? join(romRoot(config), 'snes')
}

export async function loadSnesGames(config: Config): Promise<SnesGame[]> {
  return scanSnes(snesRoot(config), config.snesTitles)
}

function asEmulated(game: SnesGame): EmulatedGame {
  return { id: game.id, title: game.title, platform: 'snes', artKey: `snes:${game.title}`, thumbnailNames: [dumpName(game)] }
}

export async function snesGames(config: Config): Promise<EmulatedGame[]> {
  return withNames(config, (await loadSnesGames(config)).map(asEmulated))
}

export async function loadSnesTab(config: Config): Promise<LibraryTab> {
  return emulatedTab(await snesGames(config), config.snesLayout ?? 'rows', recentsLayout(config, 'snes'))
}

export function fillSnesArt(config: Config, onUpdate: () => void): void {
  fillEmulatedArt('snes', config.steamGridDbKey, () => snesGames(config), onUpdate)
}

/** RetroArch (Flatpak) with the Snes9x core, full-screen. RetroArch unzips zipped dumps itself. */
export function snes9xCommand(config: Config, game: SnesGame): { command: string; args: string[] } {
  const [command, ...args] = config.retroarch ?? RETROARCH
  return { command, args: [...args, '-L', config.snes9xCore ?? SNES9X_CORE, '-f', game.path] }
}
