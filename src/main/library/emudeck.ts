import { crc32 } from 'node:zlib'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Config } from '../config'

// Where emulated games live. vaporTV follows EmuDeck's layout (a folder per system
// under roms/), and reads EmuDeck's own settings to find it, wherever EmuDeck put it.

interface EmuDeckPaths {
  romsPath?: string
  toolsPath?: string
}

// EmuDeck keeps its choices in a shell file: older versions in ~/emudeck, newer in ~/.config/EmuDeck.
const SETTINGS = [join(homedir(), 'emudeck', 'settings.sh'), join(homedir(), '.config', 'EmuDeck', 'settings.sh')]

let cached: EmuDeckPaths | null = null

/** Reads `name="value"` lines (quotes can wrap part of the value, e.g. "/run/media/deck/SATA"/Emulation). */
export function parseEmuDeckSettings(text: string): EmuDeckPaths {
  const paths: EmuDeckPaths = {}
  for (const line of text.split('\n')) {
    const match = /^(romsPath|toolsPath)=(.*)$/.exec(line.trim())
    if (!match) continue
    const value = match[2]
      .replace(/["']/g, '')
      .replace(/^~(?=\/|$)/, homedir())
      .replace(/\$\{?HOME\}?/g, homedir())
      .trim()
    if (value) paths[match[1] as keyof EmuDeckPaths] = value
  }
  return paths
}

export function emuDeckPaths(): EmuDeckPaths {
  if (cached) return cached
  for (const file of SETTINGS) {
    try {
      cached = parseEmuDeckSettings(readFileSync(file, 'utf8'))
      return cached
    } catch {
      // Not this one.
    }
  }
  cached = {}
  return cached
}

/** Common places for an Emulation/roms folder when EmuDeck's settings don't say: home, then drives. */
function guessRomRoot(): string | undefined {
  const candidates = [join(homedir(), 'Emulation', 'roms')]
  const media = join('/run/media', process.env.USER ?? 'deck')
  for (const drive of (() => {
    try {
      return readdirSync(media)
    } catch {
      return []
    }
  })()) {
    candidates.push(join(media, drive, 'Emulation', 'roms'))
  }
  return candidates.find((dir) => existsSync(dir))
}

/**
 * The folder holding a subfolder per system (switch/, ps3/, gc/ ...): set in config,
 * else EmuDeck's, else the first Emulation/roms found, else ~/Emulation/roms.
 */
export function romRoot(config: Config): string {
  return (
    config.romRoot ??
    process.env.STEAMTV_ROM_ROOT ??
    emuDeckPaths().romsPath ??
    guessRomRoot() ??
    join(homedir(), 'Emulation', 'roms')
  )
}

/**
 * The Steam app id of a non-Steam shortcut, as Steam (and EmuDeck's appID.py) derive it:
 * crc32 of exe + name, top bit set.
 */
export function shortcutAppId(exe: string, name: string): number {
  return (crc32(exe + name) | 0x80000000) >>> 0
}

/**
 * The Proton prefix to run Xenia in: EmuDeck's (named after its Xenia launcher's
 * shortcut id, so its settings and saves carry over), or vaporTV's own without EmuDeck.
 */
export function xeniaPrefix(config: Config, steamRoot: string): string {
  if (config.xeniaPrefix) return config.xeniaPrefix
  const tools = emuDeckPaths().toolsPath
  if (!tools) return join(homedir(), '.local', 'share', 'steamtv', 'proton', 'xenia')
  const launcher = `"/usr/bin/env bash" "${join(tools, 'launchers', 'xenia.sh')}"`
  return join(steamRoot, 'steamapps', 'compatdata', String(shortcutAppId(launcher, 'Xenia')))
}
