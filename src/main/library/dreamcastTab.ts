import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { LibraryTab } from '../../shared/types'
import { recentsLayout, type Config } from '../config'
import { scanDreamcast, type DreamcastGame } from './dreamcast'
import { emulatedTab, fillEmulatedArt, type EmulatedGame } from './emulated'
import { DEFAULT_ROM_ROOT } from './switchTab'

// Disc lists vaporTV writes for multi-disc games (the ROM folders are left alone).
const DISC_LISTS = join(homedir(), '.local', 'share', 'steamtv', 'disc-lists')
const FLYCAST_CORE = join(homedir(), '.var', 'app', 'org.libretro.RetroArch', 'config', 'retroarch', 'cores', 'flycast_libretro.so')

export function dreamcastRoot(config: Config): string {
  return (
    process.env.STEAMTV_DREAMCAST_ROMS ?? join(config.romRoot ?? process.env.STEAMTV_ROM_ROOT ?? DEFAULT_ROM_ROOT, 'dreamcast')
  )
}

export async function loadDreamcastGames(config: Config): Promise<DreamcastGame[]> {
  return scanDreamcast(dreamcastRoot(config), config.dreamcastTitles)
}

function asEmulated(game: DreamcastGame): EmulatedGame {
  return { id: game.id, title: game.title, platform: 'dreamcast', artKey: `dreamcast:${game.title}` }
}

export async function dreamcastGames(config: Config): Promise<EmulatedGame[]> {
  return (await loadDreamcastGames(config)).map(asEmulated)
}

export async function loadDreamcastTab(config: Config): Promise<LibraryTab> {
  return emulatedTab(await dreamcastGames(config), config.dreamcastLayout ?? 'rows', recentsLayout(config, 'dreamcast'))
}

export function fillDreamcastArt(config: Config, onUpdate: () => void): void {
  fillEmulatedArt('dreamcast', config.steamGridDbKey, () => dreamcastGames(config), onUpdate)
}

/**
 * What RetroArch opens: the game's file, or for a multi-disc game a .m3u listing
 * every disc, so RetroArch's Disc Control can switch discs when the game asks.
 */
export async function dreamcastContent(game: DreamcastGame): Promise<string> {
  if (game.discs.length < 2) return game.path
  await mkdir(DISC_LISTS, { recursive: true })
  const list = join(DISC_LISTS, `${game.title.replace(/[/\\:*?"<>|]/g, '_')}.m3u`)
  await writeFile(list, game.discs.join('\n') + '\n')
  return list
}

/** RetroArch (Flatpak) with the Flycast core, full-screen. */
export function flycastCommand(config: Config, content: string): { command: string; args: string[] } {
  const [command, ...args] = config.retroarch ?? ['flatpak', 'run', 'org.libretro.RetroArch']
  return { command, args: [...args, '-L', config.flycastCore ?? FLYCAST_CORE, '-f', content] }
}
