import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { LayoutTab } from '../../shared/types'
import type { Config } from '../config'
import { romRoot } from './emudeck'

// Where each console tab's emulator is (EmuDeck's places unless set in config), and
// whether it's there: a tab whose emulator isn't installed is left out of the nav.

export const ryujinxPath = (config: Config): string =>
  config.ryujinx ?? join(homedir(), 'Applications', 'publish', 'Ryujinx.sh')

export const rpcs3Path = (config: Config): string => config.rpcs3 ?? join(homedir(), 'Applications', 'rpcs3.AppImage')

export const xeniaPath = (config: Config): string => config.xenia ?? join(romRoot(config), 'xbox360', 'xenia_canary.exe')

// Same as recents.ts's steamRoot; repeated so this module stays free of the tab modules.
const steamDir = (config: Config): string =>
  config.steamRoot ?? process.env.STEAMTV_STEAM_ROOT ?? join(homedir(), '.local', 'share', 'Steam')

export const protonPath = (config: Config): string =>
  config.proton ?? join(steamDir(config), 'steamapps', 'common', 'Proton - Experimental', 'proton')

export const DOLPHIN = ['flatpak', 'run', 'org.DolphinEmu.dolphin-emu']
export const RETROARCH = ['flatpak', 'run', 'org.libretro.RetroArch']
export const FLYCAST_CORE = join(homedir(), '.var', 'app', 'org.libretro.RetroArch', 'config', 'retroarch', 'cores', 'flycast_libretro.so')

/** A Flatpak app installed for this user or system-wide. */
function flatpakInstalled(id: string): boolean {
  return [join(homedir(), '.local', 'share', 'flatpak', 'app', id), join('/var/lib/flatpak/app', id)].some((dir) => existsSync(dir))
}

/** Whether a command would start: a `flatpak run <id>` needs the app installed; a path needs to exist. */
function canRun(command: string[]): boolean {
  if (command[0] === 'flatpak') {
    const id = command[command.indexOf('run') + 1]
    return !!id && flatpakInstalled(id)
  }
  // A bare name is looked up on PATH at launch; trust it.
  return !command[0].includes('/') || existsSync(command[0])
}

/** Whether the emulator a console tab launches is installed (Steam's tab: whether Steam is). */
export function emulatorInstalled(config: Config, tab: Exclude<LayoutTab, 'steam'>): boolean {
  switch (tab) {
    case 'switch':
      return existsSync(ryujinxPath(config))
    case 'ps3':
      return existsSync(rpcs3Path(config))
    case 'xbox360':
      return existsSync(xeniaPath(config)) && existsSync(protonPath(config))
    case 'gamecube':
      return canRun(config.dolphin ?? DOLPHIN)
    case 'dreamcast':
      return canRun(config.retroarch ?? RETROARCH) && existsSync(config.flycastCore ?? FLYCAST_CORE)
  }
}
