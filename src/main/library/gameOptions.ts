import { existsSync } from 'node:fs'
import { readdir, readFile, rm, stat } from 'node:fs/promises'
import { basename, dirname, join, resolve, sep } from 'node:path'
import type { EmulatorChoice, GameOptions } from '../../shared/types'
import type { Config } from '../config'
import { amigaRoot, loadAmigaGames } from './amigaTab'
import { arcadeCoreChoices, arcadeGames } from './arcade'
import { cleanNoIntroTitle, discContent, dumpName, type DiscGame } from './discs'
import { dreamcastRoot, loadDreamcastGames } from './dreamcastTab'
import { romRoot } from './emudeck'
import { CORES } from './emulators'
import { gamecubeRoot, loadGameCubeGames } from './gamecubeTab'
import { genesisRoot, loadGenesisGames } from './genesisTab'
import { libretroSystems } from './libretroThumbnails'
import { loadN64Games, n64Root } from './n64Tab'
import { loadNesGames, nesRoot } from './nesTab'
import { loadPs2Games, ps2Root } from './ps2Tab'
import { loadPs3Games, ps3Folders } from './ps3Tab'
import { loadPspGames, pspRoot } from './pspTab'
import { loadPsxGames, psxRoot } from './psxTab'
import { loadSaturnGames, saturnRoot } from './saturnTab'
import { loadSega32xGames, sega32xRoot } from './sega32xTab'
import { loadSnesGames, snesRoot } from './snesTab'
import { loadSwitchGames, switchRoot } from './switchTab'
import { loadWiiGames, wiiRoot } from './wiiTab'
import { loadWiiUGames, wiiURoot } from './wiiuTab'
import { loadXbox360Games, xbox360Root } from './xbox360Tab'
import { loadXboxGames, xboxRoot } from './xboxTab'

// Select on a console game: its name, which emulator opens it, and deleting it from the drive.

type Loader = (config: Config) => Promise<DiscGame[]>

/** Consoles whose games are files under one folder (a disc, a cartridge dump, a set of discs). */
const DISC_PLATFORMS: Record<string, { load: Loader; root: (config: Config) => string }> = {
  ps2: { load: loadPs2Games, root: ps2Root },
  psx: { load: loadPsxGames, root: psxRoot },
  psp: { load: loadPspGames, root: pspRoot },
  xbox: { load: loadXboxGames, root: xboxRoot },
  xbox360: { load: loadXbox360Games, root: xbox360Root },
  gamecube: { load: loadGameCubeGames, root: gamecubeRoot },
  wii: { load: loadWiiGames, root: wiiRoot },
  dreamcast: { load: loadDreamcastGames, root: dreamcastRoot },
  saturn: { load: loadSaturnGames, root: saturnRoot },
  n64: { load: loadN64Games, root: n64Root },
  nes: { load: loadNesGames, root: nesRoot },
  snes: { load: loadSnesGames, root: snesRoot },
  genesis: { load: loadGenesisGames, root: genesisRoot },
  sega32x: { load: loadSega32xGames, root: sega32xRoot },
  amiga: { load: loadAmigaGames, root: amigaRoot }
}

/** What each console opens in unless a game is moved, and the RetroArch core that is, if it's one. */
const DEFAULT_EMULATORS: Record<string, { name: string; core?: string }> = {
  switch: { name: 'Ryujinx' },
  ps3: { name: 'RPCS3' },
  xbox: { name: 'xemu' },
  xbox360: { name: 'Xenia' },
  ps2: { name: 'PCSX2' },
  psx: { name: 'DuckStation' },
  psp: { name: 'PPSSPP' },
  gamecube: { name: 'Dolphin' },
  wii: { name: 'Dolphin' },
  wiiu: { name: 'Cemu' },
  dreamcast: { name: 'Flycast', core: 'flycast' },
  saturn: { name: 'Kronos', core: 'kronos' },
  n64: { name: 'Mupen64Plus-Next', core: 'mupen64plus_next' },
  nes: { name: 'Mesen', core: 'mesen' },
  snes: { name: 'Snes9x', core: 'snes9x' },
  genesis: { name: 'Genesis Plus GX', core: 'genesis_plus_gx' },
  sega32x: { name: 'PicoDrive', core: 'picodrive' },
  amiga: { name: 'PUAE', core: 'puae' }
}

const platformOf = (id: string): string => id.slice(0, id.indexOf(':'))

/** A disc platform's game, found by its card id. */
async function discGame(config: Config, id: string): Promise<{ game: DiscGame; root: string; all: DiscGame[] } | undefined> {
  const platform = DISC_PLATFORMS[platformOf(id)]
  if (!platform) return undefined
  const all = await platform.load(config)
  const game = all.find((g) => g.id === id)
  return game && { game, root: platform.root(config), all }
}

/** A core's name from its info file: "Sony - PlayStation (SwanStation)" → "SwanStation". */
async function installedCores(): Promise<{ id: string; name: string; systems: string[]; extensions: string[] }[]> {
  const info = join(dirname(CORES), 'info')
  const cores = await readdir(CORES).catch(() => [] as string[])
  const found = []
  for (const file of cores.filter((f) => f.endsWith('_libretro.so'))) {
    const id = file.replace(/_libretro\.so$/, '')
    const text = await readFile(join(info, `${id}_libretro.info`), 'utf8').catch(() => '')
    const field = (key: string): string => new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, 'm').exec(text)?.[1] ?? ''
    const display = field('display_name')
    found.push({
      id,
      name: /\(([^)]+)\)\s*$/.exec(display)?.[1] ?? (display || id),
      systems: field('database').split('|'),
      extensions: field('supported_extensions').split('|')
    })
  }
  return found
}

/**
 * Where a console game can open: its console's default, then the other installed RetroArch
 * cores made for that console. Only games that are plain files can move to a core.
 */
async function emulatorChoices(platform: string): Promise<EmulatorChoice[]> {
  const fallback = DEFAULT_EMULATORS[platform]
  const choices: EmulatorChoice[] = [{ id: '', name: fallback?.name ?? 'Default' }]
  if (!DISC_PLATFORMS[platform]) return choices
  const system = libretroSystems(platform)[0]
  if (!system) return choices
  for (const core of await installedCores())
    if (core.systems.includes(system) && core.id !== fallback?.core) choices.push({ id: core.id, name: core.name })
  return choices.sort((a, b) => (a.id === '' ? -1 : b.id === '' ? 1 : a.name.localeCompare(b.name)))
}

/** Every track a .cue, .gdi or .m3u names, beside it. */
async function referencedFiles(file: string): Promise<string[]> {
  const ext = file.split('.').pop()!.toLowerCase()
  if (!['cue', 'gdi', 'm3u'].includes(ext)) return []
  const text = await readFile(file, 'utf8').catch(() => '')
  const names =
    ext === 'cue'
      ? [...text.matchAll(/^\s*FILE\s+"?(.+?)"?\s+\S+\s*$/gim)].map((m) => m[1])
      : ext === 'gdi'
        ? text
            .split('\n')
            .slice(1)
            .map((line) => /^\s*\d+\s+\d+\s+\d+\s+\d+\s+("([^"]+)"|(\S+))/.exec(line))
            .flatMap((m) => (m ? [m[2] ?? m[3]] : []))
        : text.split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#'))
  return names.map((name) => resolve(dirname(file), name))
}

/**
 * A disc game's own folder, when it has one: the highest folder below the root named after
 * the game ("DecAthlete (Japan) (1M)/", "Resident Evil 2/… (Disc 1)/") that holds no other
 * game. Folders that group several games ("PAL/", a "Resident Evil" folder with 2 and 3 in
 * it too) stay, and only the game's own files go.
 */
function gameFolder(root: string, game: DiscGame, all: DiscGame[]): string | undefined {
  const title = cleanNoIntroTitle(dumpName(game))
  const others = all.filter((g) => g.id !== game.id).flatMap((g) => [g.path, ...g.discs])
  let folder: string | undefined
  for (let dir = dirname(game.discs[0] ?? game.path); dir.startsWith(root + sep); dir = dirname(dir)) {
    if (others.some((file) => file.startsWith(dir + sep))) break
    if (cleanNoIntroTitle(basename(dir)) === title) folder = dir
  }
  return folder
}

/** What deleting a game removes: whole folders or single files, all inside `roots`. */
async function deleteTargets(config: Config, id: string): Promise<{ paths: string[]; roots: string[] }> {
  const platform = platformOf(id)
  const key = id.slice(platform.length + 1)
  const found = await discGame(config, id)
  if (found) {
    const { game, root, all } = found
    // An Xbox game is its folder (image, default.xbe, artwork).
    if (platform === 'xbox') return { paths: [join(root, key)], roots: [root] }
    const folder = gameFolder(root, game, all)
    if (folder) return { paths: [folder], roots: [root] }
    const files = new Set([...game.discs, game.path])
    for (const file of [...files]) for (const ref of await referencedFiles(file)) files.add(ref)
    return { paths: [...files].filter((f) => existsSync(f)), roots: [root] }
  }
  if (platform === 'wiiu') {
    const root = wiiURoot(config)
    if (!(await loadWiiUGames(config)).some((g) => g.id === id)) throw new Error('Game not found')
    return { paths: [join(root, key)], roots: [root] }
  }
  if (platform === 'switch') {
    const root = switchRoot(config)
    const game = (await loadSwitchGames(config)).find((g) => g.id === id)
    if (!game) throw new Error('Game not found')
    // A release folder, or a loose file with its updates and DLC (same title id) beside it.
    if ((await stat(join(root, key)).catch(() => null))?.isDirectory()) return { paths: [join(root, key)], roots: [root] }
    const loose = game.titleId ? (await readdir(root)).filter((f) => f.toUpperCase().includes(`[${game.titleId!.toUpperCase()}]`)) : []
    return { paths: [...new Set([game.path, ...loose.map((f) => join(root, f))])], roots: [root] }
  }
  if (platform === 'ps3') {
    const game = (await loadPs3Games(config)).find((g) => g.id === id)
    if (!game) throw new Error('Game not found')
    const { hdd0, discs } = await ps3Folders(config)
    return { paths: [game.path], roots: [join(hdd0, 'game'), discs] }
  }
  const arcade = (await arcadeGames(config)).find((g) => g.id === id)
  if (arcade) {
    // A set's CHDs sit in a folder named after it.
    const chds = arcade.path.replace(/\.(zip|7z)$/i, '')
    return { paths: [arcade.path, ...(existsSync(chds) ? [chds] : [])], roots: [process.env.STEAMTV_ARCADE_ROMS ?? romRoot(config)] }
  }
  throw new Error('Only console games can be deleted from here')
}

async function sizeOf(path: string): Promise<{ count: number; bytes: number }> {
  const info = await stat(path).catch(() => null)
  if (!info) return { count: 0, bytes: 0 }
  if (!info.isDirectory()) return { count: 1, bytes: info.size }
  let total = { count: 0, bytes: 0 }
  for (const entry of await readdir(path)) {
    const inner = await sizeOf(join(path, entry))
    total = { count: total.count + inner.count, bytes: total.bytes + inner.bytes }
  }
  return total
}

export async function gameOptions(config: Config, id: string, originalTitle: string): Promise<GameOptions> {
  const platform = platformOf(id)
  const renamedTo = config.gameTitles?.[id]
  let emulators: EmulatorChoice[]
  let emulator: string
  if (platform === 'arcade') {
    const game = (await arcadeGames(config)).find((g) => g.id === id)
    emulators = game ? arcadeCoreChoices(config, game).map((c) => ({ id: c.id === game.defaultCore ? '' : c.id, name: c.name })) : []
    emulator = game && game.core !== game.defaultCore ? game.core : ''
  } else {
    emulators = await emulatorChoices(platform)
    emulator = config.gameEmulators?.[id] ?? ''
  }
  const { paths } = await deleteTargets(config, id)
  let files = { count: 0, bytes: 0 }
  for (const path of paths) {
    const size = await sizeOf(path)
    files = { count: files.count + size.count, bytes: files.bytes + size.bytes }
  }
  return { title: renamedTo ?? originalTitle, originalTitle, renamed: !!renamedTo, emulators, emulator, files }
}

/** Deletes a game's files for good. Every path must sit strictly inside one of its roots. */
export async function deleteGame(config: Config, id: string): Promise<void> {
  const { paths, roots } = await deleteTargets(config, id)
  if (!paths.length) throw new Error('No files found for this game')
  const inside = (path: string): boolean => roots.some((root) => resolve(path).startsWith(resolve(root) + sep))
  const outside = paths.find((path) => !inside(path))
  if (outside) throw new Error(`Refusing to delete ${outside}: it isn't inside the game's folder`)
  for (const path of paths) {
    await rm(path, { recursive: true, force: true })
    console.log(`steamtv: deleted ${path}`)
  }
}

/** A game moved to a RetroArch core: its core file and what to open (a disc list for several discs). */
export async function coreLaunch(config: Config, id: string, core: string): Promise<{ title: string; core: string; content: string } | undefined> {
  const found = await discGame(config, id)
  if (!found) return undefined
  const coreFile = join(CORES, `${core}_libretro.so`)
  if (!existsSync(coreFile)) return undefined
  const { game } = found
  return { title: game.title, core: coreFile, content: game.discs.length > 1 ? await discContent(game) : game.path }
}
