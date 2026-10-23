import { join } from 'node:path'
import type { LibraryTab } from '../../shared/types'
import { recentsLayout, type Config } from '../config'
import { dumpName } from './discs'
import { emulatedTab, fillEmulatedArt, type EmulatedGame } from './emulated'
import { romRoot } from './emudeck'
import { duckstationPath } from './emulators'
import { scanPsx, type PsxGame } from './psx'

export function psxRoot(config: Config): string {
  return process.env.STEAMTV_PSX_ROMS ?? join(romRoot(config), 'psx')
}

export async function loadPsxGames(config: Config): Promise<PsxGame[]> {
  return scanPsx(psxRoot(config), config.psxTitles)
}

function asEmulated(game: PsxGame): EmulatedGame {
  return { id: game.id, title: game.title, platform: 'psx', artKey: `psx:${game.title}`, thumbnailNames: [dumpName(game)] }
}

export async function psxGames(config: Config): Promise<EmulatedGame[]> {
  return (await loadPsxGames(config)).map(asEmulated)
}

export async function loadPsxTab(config: Config): Promise<LibraryTab> {
  return emulatedTab(await psxGames(config), config.psxLayout ?? 'rows', recentsLayout(config, 'psx'))
}

export function fillPsxArt(config: Config, onUpdate: () => void): void {
  fillEmulatedArt('psx', config.steamGridDbKey, () => psxGames(config), onUpdate)
}

/** DuckStation (EmuDeck's AppImage), full-screen, opening `content` (see discContent); -batch quits it when the game is closed. */
export function duckstationCommand(config: Config, content: string): { command: string; args: string[] } {
  return { command: duckstationPath(config), args: ['-batch', '-fullscreen', '--', content] }
}
