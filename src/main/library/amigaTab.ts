import { join } from 'node:path'
import type { LibraryTab } from '../../shared/types'
import { recentsLayout, type Config } from '../config'
import { dumpName } from './discs'
import { emulatedTab, fillEmulatedArt, withNames, type EmulatedGame } from './emulated'
import { romRoot } from './emudeck'
import { PUAE_CORE, RETROARCH } from './emulators'
import { scanAmiga, type AmigaGame } from './amiga'

export function amigaRoot(config: Config): string {
  return process.env.STEAMTV_AMIGA_ROMS ?? join(romRoot(config), 'amiga')
}

export async function loadAmigaGames(config: Config): Promise<AmigaGame[]> {
  return scanAmiga(amigaRoot(config), config.amigaTitles)
}

function asEmulated(game: AmigaGame): EmulatedGame {
  return { id: game.id, title: game.title, platform: 'amiga', artKey: `amiga:${game.title}`, thumbnailNames: [dumpName(game)] }
}

export async function amigaGames(config: Config): Promise<EmulatedGame[]> {
  return withNames(config, (await loadAmigaGames(config)).map(asEmulated))
}

export async function loadAmigaTab(config: Config): Promise<LibraryTab> {
  return emulatedTab(await amigaGames(config), config.amigaLayout ?? 'rows', recentsLayout(config, 'amiga'))
}

export function fillAmigaArt(config: Config, onUpdate: () => void): void {
  fillEmulatedArt('amiga', config.steamGridDbKey, () => amigaGames(config), onUpdate)
}

/** RetroArch (Flatpak) with the PUAE core, full-screen. PUAE unzips games itself. */
export function puaeCommand(config: Config, game: AmigaGame): { command: string; args: string[] } {
  const [command, ...args] = config.retroarch ?? RETROARCH
  return { command, args: [...args, '-L', config.puaeCore ?? PUAE_CORE, '-f', game.path] }
}
