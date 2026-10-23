import { join } from 'node:path'
import type { LibraryTab } from '../../shared/types'
import { recentsLayout, type Config } from '../config'
import { emulatedTab, fillEmulatedArt, type EmulatedGame } from './emulated'
import { scanWii, type WiiGame } from './wii'
import { romRoot } from './emudeck'
import { dumpName } from './discs'

// Wii games open in Dolphin, as GameCube's do (see gamecubeTab's dolphinCommand).

export function wiiRoot(config: Config): string {
  return process.env.STEAMTV_WII_ROMS ?? join(romRoot(config), 'wii')
}

export async function loadWiiGames(config: Config): Promise<WiiGame[]> {
  return scanWii(wiiRoot(config), config.wiiTitles)
}

function asEmulated(game: WiiGame): EmulatedGame {
  return { id: game.id, title: game.title, platform: 'wii', artKey: `wii:${game.title}`, thumbnailNames: [dumpName(game)] }
}

export async function wiiGames(config: Config): Promise<EmulatedGame[]> {
  return (await loadWiiGames(config)).map(asEmulated)
}

export async function loadWiiTab(config: Config): Promise<LibraryTab> {
  return emulatedTab(await wiiGames(config), config.wiiLayout ?? 'rows', recentsLayout(config, 'wii'))
}

export function fillWiiArt(config: Config, onUpdate: () => void): void {
  fillEmulatedArt('wii', config.steamGridDbKey, () => wiiGames(config), onUpdate)
}
