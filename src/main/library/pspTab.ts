import { join } from 'node:path'
import type { LibraryTab } from '../../shared/types'
import { recentsLayout, type Config } from '../config'
import { dumpName } from './discs'
import { emulatedTab, fillEmulatedArt, type EmulatedGame } from './emulated'
import { romRoot } from './emudeck'
import { PPSSPP } from './emulators'
import { scanPsp, type PspGame } from './psp'

export function pspRoot(config: Config): string {
  return process.env.STEAMTV_PSP_ROMS ?? join(romRoot(config), 'psp')
}

export async function loadPspGames(config: Config): Promise<PspGame[]> {
  return scanPsp(pspRoot(config), config.pspTitles)
}

function asEmulated(game: PspGame): EmulatedGame {
  return { id: game.id, title: game.title, platform: 'psp', artKey: `psp:${game.title}`, thumbnailNames: [dumpName(game)] }
}

export async function pspGames(config: Config): Promise<EmulatedGame[]> {
  return (await loadPspGames(config)).map(asEmulated)
}

export async function loadPspTab(config: Config): Promise<LibraryTab> {
  return emulatedTab(await pspGames(config), config.pspLayout ?? 'rows', recentsLayout(config, 'psp'))
}

export function fillPspArt(config: Config, onUpdate: () => void): void {
  fillEmulatedArt('psp', config.steamGridDbKey, () => pspGames(config), onUpdate)
}

/** PPSSPP (Flatpak), full-screen. */
export function ppssppCommand(config: Config, game: PspGame): { command: string; args: string[] } {
  const [command, ...args] = config.ppsspp ?? PPSSPP
  return { command, args: [...args, '--fullscreen', game.path] }
}
