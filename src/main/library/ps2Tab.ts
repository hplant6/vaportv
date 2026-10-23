import { join } from 'node:path'
import type { LibraryTab } from '../../shared/types'
import { recentsLayout, type Config } from '../config'
import { emulatedTab, fillEmulatedArt, type EmulatedGame } from './emulated'
import { scanPs2, type Ps2Game } from './ps2'
import { romRoot } from './emudeck'
import { dumpName } from './discs'
import { pcsx2Path } from './emulators'

export function ps2Root(config: Config): string {
  return process.env.STEAMTV_PS2_ROMS ?? join(romRoot(config), 'ps2')
}

export async function loadPs2Games(config: Config): Promise<Ps2Game[]> {
  return scanPs2(ps2Root(config), config.ps2Titles)
}

function asEmulated(game: Ps2Game): EmulatedGame {
  return { id: game.id, title: game.title, platform: 'ps2', artKey: `ps2:${game.title}`, thumbnailNames: [dumpName(game)] }
}

export async function ps2Games(config: Config): Promise<EmulatedGame[]> {
  return (await loadPs2Games(config)).map(asEmulated)
}

export async function loadPs2Tab(config: Config): Promise<LibraryTab> {
  return emulatedTab(await ps2Games(config), config.ps2Layout ?? 'rows', recentsLayout(config, 'ps2'))
}

export function fillPs2Art(config: Config, onUpdate: () => void): void {
  fillEmulatedArt('ps2', config.steamGridDbKey, () => ps2Games(config), onUpdate)
}

/**
 * PCSX2 (EmuDeck's AppImage) opening a game directly: -batch quits PCSX2 when the game
 * stops (as ES-DE starts it), -fullscreen for the TV.
 */
export function pcsx2Command(config: Config, game: Ps2Game): { command: string; args: string[] } {
  return { command: pcsx2Path(config), args: ['-batch', '-fullscreen', '--', game.path] }
}
