import { join } from 'node:path'
import type { LibraryTab } from '../../shared/types'
import { recentsLayout, type Config } from '../config'
import { dumpName } from './discs'
import { emulatedTab, fillEmulatedArt, type EmulatedGame } from './emulated'
import { romRoot } from './emudeck'
import { MUPEN64_CORE, RETROARCH } from './emulators'
import { scanN64, type N64Game } from './n64'

export function n64Root(config: Config): string {
  return process.env.STEAMTV_N64_ROMS ?? join(romRoot(config), 'n64')
}

export async function loadN64Games(config: Config): Promise<N64Game[]> {
  return scanN64(n64Root(config), config.n64Titles)
}

function asEmulated(game: N64Game): EmulatedGame {
  return { id: game.id, title: game.title, platform: 'n64', artKey: `n64:${game.title}`, thumbnailNames: [dumpName(game)] }
}

export async function n64Games(config: Config): Promise<EmulatedGame[]> {
  return (await loadN64Games(config)).map(asEmulated)
}

export async function loadN64Tab(config: Config): Promise<LibraryTab> {
  return emulatedTab(await n64Games(config), config.n64Layout ?? 'rows', recentsLayout(config, 'n64'))
}

export function fillN64Art(config: Config, onUpdate: () => void): void {
  fillEmulatedArt('n64', config.steamGridDbKey, () => n64Games(config), onUpdate)
}

/** RetroArch (Flatpak) with the Mupen64Plus-Next core, full-screen. RetroArch unzips zipped dumps itself. */
export function mupen64Command(config: Config, game: N64Game): { command: string; args: string[] } {
  const [command, ...args] = config.retroarch ?? RETROARCH
  return { command, args: [...args, '-L', config.mupen64Core ?? MUPEN64_CORE, '-f', game.path] }
}
