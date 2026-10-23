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
export const pcsx2Path = (config: Config): string => config.pcsx2 ?? join(homedir(), 'Applications', 'pcsx2-Qt.AppImage')
export const cemuPath = (config: Config): string => config.cemu ?? join(homedir(), 'Applications', 'Cemu.AppImage')
export const duckstationPath = (config: Config): string => config.duckstation ?? join(homedir(), 'Applications', 'DuckStation.AppImage')

export const xeniaPath = (config: Config): string => config.xenia ?? join(romRoot(config), 'xbox360', 'xenia_canary.exe')

// Same as recents.ts's steamRoot; repeated so this module stays free of the tab modules.
const steamDir = (config: Config): string =>
  config.steamRoot ?? process.env.STEAMTV_STEAM_ROOT ?? join(homedir(), '.local', 'share', 'Steam')

export const protonPath = (config: Config): string =>
  config.proton ?? join(steamDir(config), 'steamapps', 'common', 'Proton - Experimental', 'proton')

export const DOLPHIN = ['flatpak', 'run', 'org.DolphinEmu.dolphin-emu']
export const XEMU = ['flatpak', 'run', 'app.xemu.xemu']
export const RETROARCH = ['flatpak', 'run', 'org.libretro.RetroArch']
export const PPSSPP = ['flatpak', 'run', 'org.ppsspp.PPSSPP']
export const CORES = join(homedir(), '.var', 'app', 'org.libretro.RetroArch', 'config', 'retroarch', 'cores')
export const FLYCAST_CORE = join(CORES, 'flycast_libretro.so')
export const MUPEN64_CORE = join(CORES, 'mupen64plus_next_libretro.so')
export const KRONOS_CORE = join(CORES, 'kronos_libretro.so')
export const MESEN_CORE = join(CORES, 'mesen_libretro.so')
export const SNES9X_CORE = join(CORES, 'snes9x_libretro.so')
export const GENESIS_PLUS_GX_CORE = join(CORES, 'genesis_plus_gx_libretro.so')
export const PICODRIVE_CORE = join(CORES, 'picodrive_libretro.so')
export const PUAE_CORE = join(CORES, 'puae_libretro.so')

/** The RetroArch cores the Arcade tab uses by default, by board family. */
export type ArcadeCore = 'flycast' | 'fbneo' | 'mame'

/** A RetroArch core's file, by its name (`mame2003_plus` → cores/mame2003_plus_libretro.so). */
export function arcadeCoreFile(config: Config, core: string): string {
  const configured = config.arcadeCores?.[core as ArcadeCore] ?? (core === 'flycast' ? config.flycastCore : undefined)
  return configured ?? join(CORES, `${core}_libretro.so`)
}

/** A Flatpak app installed for this user or system-wide. */
export function flatpakInstalled(id: string): boolean {
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
    case 'ps2':
      return existsSync(pcsx2Path(config))
    case 'psx':
      return existsSync(duckstationPath(config))
    case 'psp':
      return canRun(config.ppsspp ?? PPSSPP)
    case 'xbox':
      return canRun(config.xemu ?? XEMU)
    case 'xbox360':
      return existsSync(xeniaPath(config)) && existsSync(protonPath(config))
    case 'gamecube':
    case 'wii':
      return canRun(config.dolphin ?? DOLPHIN)
    case 'wiiu':
      return existsSync(cemuPath(config))
    case 'dreamcast':
      return canRun(config.retroarch ?? RETROARCH) && existsSync(config.flycastCore ?? FLYCAST_CORE)
    case 'n64':
      return canRun(config.retroarch ?? RETROARCH) && existsSync(config.mupen64Core ?? MUPEN64_CORE)
    case 'saturn':
      return canRun(config.retroarch ?? RETROARCH) && existsSync(config.kronosCore ?? KRONOS_CORE)
    case 'nes':
      return canRun(config.retroarch ?? RETROARCH) && existsSync(config.mesenCore ?? MESEN_CORE)
    case 'snes':
      return canRun(config.retroarch ?? RETROARCH) && existsSync(config.snes9xCore ?? SNES9X_CORE)
    case 'genesis':
      return canRun(config.retroarch ?? RETROARCH) && existsSync(config.genesisPlusGxCore ?? GENESIS_PLUS_GX_CORE)
    case 'sega32x':
      return canRun(config.retroarch ?? RETROARCH) && existsSync(config.picodriveCore ?? PICODRIVE_CORE)
    case 'amiga':
      return canRun(config.retroarch ?? RETROARCH) && existsSync(config.puaeCore ?? PUAE_CORE)
    case 'arcade':
      return canRun(config.retroarch ?? RETROARCH) && (['flycast', 'fbneo', 'mame'] as const).some((core) => existsSync(arcadeCoreFile(config, core)))
  }
}
