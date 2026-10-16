import { join } from 'node:path'
import type { LibraryTab } from '../../shared/types'
import { recentsLayout, type Config } from '../config'
import { emulatedTab, fillEmulatedArt, type EmulatedGame } from './emulated'
import { steamRoot } from './recents'
import { romRoot, xeniaPrefix } from './emudeck'
import { protonPath, xeniaPath } from './emulators'
import { scanXbox360, type Xbox360Game } from './xbox360'

// EmuDeck's Xbox 360 setup: the Windows build of Xenia Canary in roms/xbox360,
// run through Proton, games in roms/xbox360/roms.

export function xbox360Root(config: Config): string {
  return process.env.STEAMTV_XBOX360_ROMS ?? join(romRoot(config), 'xbox360', 'roms')
}

export async function loadXbox360Games(config: Config): Promise<Xbox360Game[]> {
  return scanXbox360(xbox360Root(config), config.xbox360Titles)
}

function asEmulated(game: Xbox360Game): EmulatedGame {
  return { id: game.id, title: game.title, platform: 'xbox360', artKey: `xbox360:${game.title}` }
}

export async function xbox360Games(config: Config): Promise<EmulatedGame[]> {
  return (await loadXbox360Games(config)).map(asEmulated)
}

export async function loadXbox360Tab(config: Config): Promise<LibraryTab> {
  return emulatedTab(await xbox360Games(config), config.xbox360Layout ?? 'rows', recentsLayout(config, 'xbox360'))
}

export function fillXbox360Art(config: Config, onUpdate: () => void): void {
  fillEmulatedArt('xbox360', config.steamGridDbKey, () => xbox360Games(config), onUpdate)
}

/** The command, arguments and environment that run `game` in Xenia under Proton. */
export function xeniaCommand(
  config: Config,
  game: Xbox360Game
): { command: string; args: string[]; env: Record<string, string> } {
  const steam = steamRoot(config)
  const proton = protonPath(config)
  const xenia = xeniaPath(config)
  return {
    command: proton,
    // Xenia is a Windows program; a Linux path resolves on Wine's Z: drive.
    args: ['run', xenia, game.path],
    env: {
      STEAM_COMPAT_DATA_PATH: xeniaPrefix(config, steam),
      STEAM_COMPAT_CLIENT_INSTALL_PATH: steam
    }
  }
}
