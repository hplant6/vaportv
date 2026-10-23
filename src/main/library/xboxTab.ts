import { join } from 'node:path'
import type { LibraryTab } from '../../shared/types'
import { recentsLayout, type Config } from '../config'
import { emulatedTab, fillEmulatedArt, type EmulatedGame } from './emulated'
import { scanXbox, type XboxGame } from './xbox'
import { romRoot } from './emudeck'
import { dumpName } from './discs'
import { XEMU } from './emulators'

export function xboxRoot(config: Config): string {
  return process.env.STEAMTV_XBOX_ROMS ?? join(romRoot(config), 'xbox')
}

export async function loadXboxGames(config: Config): Promise<XboxGame[]> {
  return scanXbox(xboxRoot(config), config.xboxTitles)
}

function asEmulated(game: XboxGame): EmulatedGame {
  return { id: game.id, title: game.title, platform: 'xbox', artKey: `xbox:${game.title}`, thumbnailNames: [dumpName(game).replace(/\.\d+$/, '')] }
}

export async function xboxGames(config: Config): Promise<EmulatedGame[]> {
  return (await loadXboxGames(config)).map(asEmulated)
}

export async function loadXboxTab(config: Config): Promise<LibraryTab> {
  return emulatedTab(await xboxGames(config), config.xboxLayout ?? 'rows', recentsLayout(config, 'xbox'))
}

export function fillXboxArt(config: Config, onUpdate: () => void): void {
  fillEmulatedArt('xbox', config.steamGridDbKey, () => xboxGames(config), onUpdate)
}

/** xemu (EmuDeck's Flatpak) booting a game's disc image full-screen; its BIOS and hard disk are xemu's own settings. */
export function xemuCommand(config: Config, game: XboxGame): { command: string; args: string[] } {
  const [command, ...args] = config.xemu ?? XEMU
  return { command, args: [...args, '-full-screen', '-dvd_path', game.path] }
}
