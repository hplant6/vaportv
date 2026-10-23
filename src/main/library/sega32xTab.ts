import { join } from 'node:path'
import type { LibraryTab } from '../../shared/types'
import { recentsLayout, type Config } from '../config'
import { dumpName } from './discs'
import { emulatedTab, fillEmulatedArt, withNames, type EmulatedGame } from './emulated'
import { romRoot } from './emudeck'
import { PICODRIVE_CORE, RETROARCH } from './emulators'
import { scanSega32x, type Sega32xGame } from './sega32x'

export function sega32xRoot(config: Config): string {
  return process.env.STEAMTV_SEGA32X_ROMS ?? join(romRoot(config), 'sega32x')
}

export async function loadSega32xGames(config: Config): Promise<Sega32xGame[]> {
  return scanSega32x(sega32xRoot(config), config.sega32xTitles)
}

function asEmulated(game: Sega32xGame): EmulatedGame {
  return { id: game.id, title: game.title, platform: 'sega32x', artKey: `sega32x:${game.title}`, thumbnailNames: [dumpName(game)] }
}

export async function sega32xGames(config: Config): Promise<EmulatedGame[]> {
  return withNames(config, (await loadSega32xGames(config)).map(asEmulated))
}

export async function loadSega32xTab(config: Config): Promise<LibraryTab> {
  return emulatedTab(await sega32xGames(config), config.sega32xLayout ?? 'rows', recentsLayout(config, 'sega32x'))
}

export function fillSega32xArt(config: Config, onUpdate: () => void): void {
  fillEmulatedArt('sega32x', config.steamGridDbKey, () => sega32xGames(config), onUpdate)
}

/** RetroArch (Flatpak) with the PicoDrive core, full-screen. RetroArch unzips zipped dumps itself. */
export function picodriveCommand(config: Config, game: Sega32xGame): { command: string; args: string[] } {
  const [command, ...args] = config.retroarch ?? RETROARCH
  return { command, args: [...args, '-L', config.picodriveCore ?? PICODRIVE_CORE, '-f', game.path] }
}
