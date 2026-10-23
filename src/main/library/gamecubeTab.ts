import { join } from 'node:path'
import type { LibraryTab } from '../../shared/types'
import { recentsLayout, type Config } from '../config'
import { emulatedTab, fillEmulatedArt, withNames, type EmulatedGame } from './emulated'
import { scanGameCube, type GameCubeGame } from './gamecube'
import { romRoot } from './emudeck'
import { dumpName } from './discs'
import { DOLPHIN } from './emulators'

export function gamecubeRoot(config: Config): string {
  return process.env.STEAMTV_GAMECUBE_ROMS ?? join(romRoot(config), 'gc')
}

export async function loadGameCubeGames(config: Config): Promise<GameCubeGame[]> {
  return scanGameCube(gamecubeRoot(config), config.gamecubeTitles)
}

function asEmulated(game: GameCubeGame): EmulatedGame {
  return { id: game.id, title: game.title, platform: 'gamecube', artKey: `gamecube:${game.title}`, thumbnailNames: [dumpName(game)] }
}

export async function gamecubeGames(config: Config): Promise<EmulatedGame[]> {
  return withNames(config, (await loadGameCubeGames(config)).map(asEmulated))
}

export async function loadGameCubeTab(config: Config): Promise<LibraryTab> {
  return emulatedTab(await gamecubeGames(config), config.gamecubeLayout ?? 'rows', recentsLayout(config, 'gamecube'))
}

export function fillGameCubeArt(config: Config, onUpdate: () => void): void {
  fillEmulatedArt('gamecube', config.steamGridDbKey, () => gamecubeGames(config), onUpdate)
}

/**
 * Dolphin (Flatpak) opening a game directly: -e runs it, -b quits Dolphin when the
 * game stops. Full-screen and no "are you sure?" come from Dolphin's own settings.
 */
export function dolphinCommand(config: Config, game: GameCubeGame): { command: string; args: string[] } {
  const [command, ...args] = config.dolphin ?? DOLPHIN
  return { command, args: [...args, '-b', '-e', game.path] }
}
