import { join } from 'node:path'
import type { LibraryTab } from '../../shared/types'
import { recentsLayout, type Config } from '../config'
import { dumpName } from './discs'
import { emulatedTab, fillEmulatedArt, type EmulatedGame } from './emulated'
import { romRoot } from './emudeck'
import { MESEN_CORE, RETROARCH } from './emulators'
import { scanNes, type NesGame } from './nes'

export function nesRoot(config: Config): string {
  return process.env.STEAMTV_NES_ROMS ?? join(romRoot(config), 'nes')
}

export async function loadNesGames(config: Config): Promise<NesGame[]> {
  return scanNes(nesRoot(config), config.nesTitles)
}

function asEmulated(game: NesGame): EmulatedGame {
  return { id: game.id, title: game.title, platform: 'nes', artKey: `nes:${game.title}`, thumbnailNames: [dumpName(game)] }
}

export async function nesGames(config: Config): Promise<EmulatedGame[]> {
  return (await loadNesGames(config)).map(asEmulated)
}

export async function loadNesTab(config: Config): Promise<LibraryTab> {
  return emulatedTab(await nesGames(config), config.nesLayout ?? 'rows', recentsLayout(config, 'nes'))
}

export function fillNesArt(config: Config, onUpdate: () => void): void {
  fillEmulatedArt('nes', config.steamGridDbKey, () => nesGames(config), onUpdate)
}

/** RetroArch (Flatpak) with the Mesen core, full-screen. RetroArch unzips zipped dumps itself. */
export function mesenCommand(config: Config, game: NesGame): { command: string; args: string[] } {
  const [command, ...args] = config.retroarch ?? RETROARCH
  return { command, args: [...args, '-L', config.mesenCore ?? MESEN_CORE, '-f', game.path] }
}
