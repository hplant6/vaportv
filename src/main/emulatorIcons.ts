import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, lstat, mkdir, mkdtemp, readlink, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, normalize } from 'node:path'
import type { Config } from './config'
import { artUrl } from './library/art'
import { duckstationPath } from './library/emulators'
import { ART_CACHE } from './library/steamgriddb'

// Emulator icons for the card footers, for the emulators whose icons don't ship with vaporTV
// (DuckStation's is under a non-commercial licence, which vaporTV's GPL build can't carry). Each
// is taken from the user's own install instead: the Flatpak's exported icon, else the one inside
// the AppImage, else EmuDeck's copy, and kept in the art cache. Platforms whose emulator has a
// bundled icon (fixtures/home.json platformLogos) keep that one.

const ICON_CACHE = join(ART_CACHE, 'emulator-icons')

interface IconSource {
  /** The platforms whose games this emulator opens (their cards show its icon). */
  platforms: string[]
  flatpak?: string
  appImage?: (config: Config) => string
  /** EmuDeck's icon files for it, under ~/.config/EmuDeck/backend. */
  emudeck?: string[]
}

const SOURCES: Record<string, IconSource> = {
  duckstation: {
    platforms: ['psx'],
    flatpak: 'org.duckstation.DuckStation',
    appImage: duckstationPath,
    emudeck: ['icons/DuckStation.png', 'configs/steam-input/Icons/EmuDeck_DuckStation.png']
  }
}

const FLATPAK_ICONS = ['/var/lib/flatpak/exports/share/icons/hicolor', join(homedir(), '.local', 'share', 'flatpak', 'exports', 'share', 'icons', 'hicolor')]
const SIZES = ['512x512', '256x256', '128x128', '64x64']

const isFile = (path: string): Promise<boolean> => stat(path).then((s) => s.isFile(), () => false)

async function flatpakIcon(appId: string): Promise<string | null> {
  for (const root of FLATPAK_ICONS)
    for (const size of SIZES) {
      const path = join(root, size, 'apps', `${appId}.png`)
      if (await isFile(path)) return path
    }
  return null
}

/** Pulls `inner` out of the AppImage into `dir` (squashfs-root/…); it runs the AppImage only to extract, never the app. */
function extract(appImage: string, dir: string, inner: string): Promise<void> {
  return new Promise((resolve) => execFile(appImage, ['--appimage-extract', inner], { cwd: dir, timeout: 30_000 }, () => resolve()))
}

/** The AppImage's own icon: .DirIcon, following its links (each extracted in turn) to the image itself. */
async function appImageIcon(appImage: string, into: string): Promise<boolean> {
  if (!(await isFile(appImage))) return false
  const dir = await mkdtemp(join(ICON_CACHE, '.extract-'))
  try {
    let inner = '.DirIcon'
    for (let hop = 0; hop < 4; hop++) {
      await extract(appImage, dir, inner)
      const path = join(dir, 'squashfs-root', inner)
      const info = await lstat(path).catch(() => null)
      if (!info) return false
      if (info.isFile()) {
        await copyFile(path, into)
        return true
      }
      if (!info.isSymbolicLink()) return false
      // A link inside the image: extract what it points at next (never outside the image).
      const target = normalize(join(dirname(inner), await readlink(path)))
      if (target.startsWith('..') || target.startsWith('/')) return false
      inner = target
    }
    return false
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function findIcon(config: Config, id: string, source: IconSource): Promise<string | null> {
  const cached = join(ICON_CACHE, `${id}.png`)
  if (await isFile(cached)) return cached
  await mkdir(ICON_CACHE, { recursive: true })
  const fromFlatpak = source.flatpak ? await flatpakIcon(source.flatpak) : null
  if (fromFlatpak) {
    await copyFile(fromFlatpak, cached)
    return cached
  }
  if (source.appImage && (await appImageIcon(source.appImage(config), cached))) return cached
  for (const file of source.emudeck ?? []) {
    const path = join(homedir(), '.config', 'EmuDeck', 'backend', file)
    if (existsSync(path)) {
      await copyFile(path, cached)
      return cached
    }
  }
  return null
}

/** Footer icons, by platform, for the emulators that are installed but have no icon bundled. */
export async function emulatorIcons(config: Config): Promise<Record<string, string>> {
  const found: Record<string, string> = {}
  for (const [id, source] of Object.entries(SOURCES)) {
    const icon = await findIcon(config, id, source).catch(() => null)
    if (icon) for (const platform of source.platforms) found[platform] = artUrl(icon)
  }
  return found
}
