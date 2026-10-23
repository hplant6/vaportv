import { join } from 'node:path'
import type { LibraryTab } from '../../shared/types'
import { recentsLayout, type Config } from '../config'
import { discContent, dumpName } from './discs'
import { emulatedTab, fillEmulatedArt, withNames, type EmulatedGame } from './emulated'
import { romRoot } from './emudeck'
import { KRONOS_CORE, RETROARCH } from './emulators'
import { scanSaturn, type SaturnGame } from './saturn'

export function saturnRoot(config: Config): string {
  return process.env.STEAMTV_SATURN_ROMS ?? join(romRoot(config), 'saturn')
}

export async function loadSaturnGames(config: Config): Promise<SaturnGame[]> {
  return scanSaturn(saturnRoot(config), config.saturnTitles)
}

function asEmulated(game: SaturnGame): EmulatedGame {
  return { id: game.id, title: game.title, platform: 'saturn', artKey: `saturn:${game.title}`, thumbnailNames: [dumpName(game)] }
}

export async function saturnGames(config: Config): Promise<EmulatedGame[]> {
  return withNames(config, (await loadSaturnGames(config)).map(asEmulated))
}

export async function loadSaturnTab(config: Config): Promise<LibraryTab> {
  return emulatedTab(await saturnGames(config), config.saturnLayout ?? 'rows', recentsLayout(config, 'saturn'))
}

export function fillSaturnArt(config: Config, onUpdate: () => void): void {
  fillEmulatedArt('saturn', config.steamGridDbKey, () => saturnGames(config), onUpdate)
}

/** What RetroArch opens: the game's file, or a .m3u of every disc for Disc Control. */
export function saturnContent(game: SaturnGame): Promise<string> {
  return discContent(game)
}

/**
 * RetroArch (Flatpak) with the Kronos core, full-screen. Kronos rather than Beetle Saturn:
 * Beetle only takes zips as ST-V arcade boards, and EmuDeck's Saturn set is zipped cue/bin.
 */
export function kronosCommand(config: Config, content: string): { command: string; args: string[] } {
  const [command, ...args] = config.retroarch ?? RETROARCH
  return { command, args: [...args, '-L', config.kronosCore ?? KRONOS_CORE, '-f', content] }
}
