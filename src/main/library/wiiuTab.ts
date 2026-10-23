import { join } from 'node:path'
import type { LibraryTab } from '../../shared/types'
import { recentsLayout, type Config } from '../config'
import { emulatedTab, fillEmulatedArt, withNames, type EmulatedGame } from './emulated'
import { romRoot } from './emudeck'
import { cemuPath } from './emulators'
import { scanWiiU, type WiiUGame } from './wiiu'

export function wiiURoot(config: Config): string {
  return process.env.STEAMTV_WIIU_ROMS ?? join(romRoot(config), 'wiiu')
}

export async function loadWiiUGames(config: Config): Promise<WiiUGame[]> {
  return scanWiiU(wiiURoot(config), config.wiiuTitles)
}

function asEmulated(game: WiiUGame): EmulatedGame {
  return { id: game.id, title: game.title, platform: 'wiiu', artKey: `wiiu:${game.title}`, thumbnailNames: [game.title] }
}

export async function wiiUGames(config: Config): Promise<EmulatedGame[]> {
  return withNames(config, (await loadWiiUGames(config)).map(asEmulated))
}

export async function loadWiiUTab(config: Config): Promise<LibraryTab> {
  return emulatedTab(await wiiUGames(config), config.wiiuLayout ?? 'rows', recentsLayout(config, 'wiiu'))
}

export function fillWiiUArt(config: Config, onUpdate: () => void): void {
  fillEmulatedArt('wiiu', config.steamGridDbKey, () => wiiUGames(config), onUpdate)
}

/** Cemu (EmuDeck's AppImage), full-screen, straight into the game. */
export function cemuCommand(config: Config, game: WiiUGame): { command: string; args: string[] } {
  return { command: cemuPath(config), args: ['-f', '-g', game.path] }
}
