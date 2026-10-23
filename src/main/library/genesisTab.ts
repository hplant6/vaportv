import { join } from 'node:path'
import type { LibraryTab } from '../../shared/types'
import { recentsLayout, type Config } from '../config'
import { dumpName } from './discs'
import { emulatedTab, fillEmulatedArt, withNames, type EmulatedGame } from './emulated'
import { romRoot } from './emudeck'
import { GENESIS_PLUS_GX_CORE, RETROARCH } from './emulators'
import { scanGenesis, type GenesisGame } from './genesis'

export function genesisRoot(config: Config): string {
  return process.env.STEAMTV_GENESIS_ROMS ?? join(romRoot(config), 'genesis')
}

export async function loadGenesisGames(config: Config): Promise<GenesisGame[]> {
  return scanGenesis(genesisRoot(config), config.genesisTitles)
}

function asEmulated(game: GenesisGame): EmulatedGame {
  return { id: game.id, title: game.title, platform: 'genesis', artKey: `genesis:${game.title}`, thumbnailNames: [dumpName(game)] }
}

export async function genesisGames(config: Config): Promise<EmulatedGame[]> {
  return withNames(config, (await loadGenesisGames(config)).map(asEmulated))
}

export async function loadGenesisTab(config: Config): Promise<LibraryTab> {
  return emulatedTab(await genesisGames(config), config.genesisLayout ?? 'rows', recentsLayout(config, 'genesis'))
}

export function fillGenesisArt(config: Config, onUpdate: () => void): void {
  fillEmulatedArt('genesis', config.steamGridDbKey, () => genesisGames(config), onUpdate)
}

/** RetroArch (Flatpak) with the Genesis Plus GX core, full-screen. RetroArch unzips zipped dumps itself. */
export function genesisPlusGxCommand(config: Config, game: GenesisGame): { command: string; args: string[] } {
  const [command, ...args] = config.retroarch ?? RETROARCH
  return { command, args: [...args, '-L', config.genesisPlusGxCore ?? GENESIS_PLUS_GX_CORE, '-f', game.path] }
}
