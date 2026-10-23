import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { LibraryTab } from '../../shared/types'
import { recentsLayout, type Config } from '../config'
import { emulatedTab, fillEmulatedArt, withNames, type EmulatedGame } from './emulated'
import { scanPs3, type Ps3Game } from './ps3'

const RPCS3_CONFIG = join(homedir(), '.config', 'rpcs3')

/** RPCS3's internal drive and disc folder, from its vfs.yml (overridable for development). */
export async function ps3Folders(config: Config): Promise<{ hdd0: string; discs: string }> {
  const vfs = await readFile(join(config.rpcs3Config ?? RPCS3_CONFIG, 'vfs.yml'), 'utf8').catch(() => '')
  const entry = (key: string): string | undefined => {
    const value = new RegExp(`^${key}:\\s*(.*)$`, 'm').exec(vfs)?.[1]?.trim().replace(/^"|"$/g, '')
    // "$(EmulatorDir)…" paths are relative to RPCS3's config folder.
    return value ? value.replace('$(EmulatorDir)', `${config.rpcs3Config ?? RPCS3_CONFIG}/`) : undefined
  }
  return {
    hdd0: process.env.STEAMTV_PS3_HDD0 ?? entry('/dev_hdd0/') ?? join(RPCS3_CONFIG, 'dev_hdd0'),
    discs: process.env.STEAMTV_PS3_DISCS ?? entry('/games/') ?? join(RPCS3_CONFIG, 'games')
  }
}

export async function loadPs3Games(config: Config): Promise<Ps3Game[]> {
  const { hdd0, discs } = await ps3Folders(config)
  return scanPs3(hdd0, discs, config.ps3Titles)
}

function asEmulated(game: Ps3Game): EmulatedGame {
  return { id: game.id, title: game.title, platform: 'ps3', artKey: `ps3:${game.titleId}`, localWide: game.icon }
}

export async function ps3Games(config: Config): Promise<EmulatedGame[]> {
  return withNames(config, (await loadPs3Games(config)).map(asEmulated))
}

export async function loadPs3Tab(config: Config): Promise<LibraryTab> {
  return emulatedTab(await ps3Games(config), config.ps3Layout ?? 'rows', recentsLayout(config, 'ps3'))
}

export function fillPs3Art(config: Config, onUpdate: () => void): void {
  fillEmulatedArt('ps3', config.steamGridDbKey, () => ps3Games(config), onUpdate)
}

/**
 * RPCS3 arguments to boot a game full-screen without its own UI, by its EBOOT.BIN.
 * (RPCS3's own shortcuts boot by title id, but that depends on its game list.)
 */
export function rpcs3Args(game: Ps3Game): string[] {
  const eboot =
    game.kind === 'disc' ? join(game.path, 'PS3_GAME', 'USRDIR', 'EBOOT.BIN') : join(game.path, 'USRDIR', 'EBOOT.BIN')
  return ['--no-gui', '--fullscreen', eboot]
}
