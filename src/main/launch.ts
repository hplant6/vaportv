import { spawn } from 'node:child_process'
import { mkdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { LaunchKind } from '../shared/types'
import type { Config } from './config'
import { recordPlay } from './history'
import { steamRoot } from './library/recents'
import { activeUserDir } from './library/steam'
import { arcadeCommand, arcadeGames } from './library/arcade'
import { dreamcastContent, flycastCommand, loadDreamcastGames } from './library/dreamcastTab'
import { rpcs3Path, ryujinxPath } from './library/emulators'
import { dolphinCommand, loadGameCubeGames } from './library/gamecubeTab'
import { loadPs3Games, rpcs3Args } from './library/ps3Tab'
import { loadSwitchGames } from './library/switchTab'
import { loadXbox360Games, xeniaCommand } from './library/xbox360Tab'
import { directCommand } from './appSetup'
import { customApps } from './customApps'
import { childObject, childString, parseBinaryVdf } from './library/vdf'

// Steam games and shortcuts launch through Steam, so Steam Input, the overlay menu
// and Gaming Mode's window switching behave as they would from Steam's own library.
// Emulated games (Switch, PS3, Xbox 360, GameCube, Dreamcast, arcade) open in their emulator directly.

// Favorite Apps tile id -> the Steam shortcut it opens (matched by name, case-insensitive;
// the first of several names that exists). Override or extend with `favorites` in config.json.
const DEFAULT_FAVORITES: Record<string, string | string[]> = {
  youtube: 'VacuumTube',
  netflix: 'Netflix',
  disney: 'Disney+',
  emby: 'Emby Theater',
  prime: 'Prime Video',
  max: 'Max',
  hulu: 'Hulu',
  paramount: 'Paramount+',
  peacock: 'Peacock',
  tubi: 'Tubi',
  jellyfin: 'Jellyfin',
  // EmuDeck names its shortcut EmulationStationDE; added by hand it's usually ES-DE.
  esde: ['EmulationStationDE', 'ES-DE', 'EmulationStation-DE']
}

// Tiles that open part of Steam itself rather than a shortcut.
const STEAM_PAGES: Record<string, string> = {
  steam: 'steam://open/games'
}

/** Non-Steam shortcuts launch by a 64-bit game id built from their 32-bit app id. */
export function shortcutGameId(appid: number): string {
  return ((BigInt(appid) << 32n) | 0x02000000n).toString()
}

async function shortcutAppId(config: Config, name: string): Promise<number | null> {
  const userDir = await activeUserDir(steamRoot(config))
  if (!userDir) return null
  const vdf = parseBinaryVdf(await readFile(join(userDir, 'config', 'shortcuts.vdf')))
  for (const entry of Object.values(childObject(vdf, 'shortcuts') ?? {})) {
    if (typeof entry === 'object' && childString(entry, 'AppName')?.toLowerCase() === name.toLowerCase()) {
      return Number(childString(entry, 'appid'))
    }
  }
  return null
}

/** The steam:// URL for a Recents card or Favorite Apps tile, or null if it can't be launched. */
export async function launchUrl(config: Config, kind: LaunchKind, id: string): Promise<string | null> {
  if (kind === 'recent') {
    const [source, appid] = id.split(':')
    if (source === 'steam') return `steam://rungameid/${appid}`
    if (source === 'shortcut') return `steam://rungameid/${shortcutGameId(Number(appid))}`
    return null
  }
  if (STEAM_PAGES[id]) return STEAM_PAGES[id]
  const names = [config.favorites?.[id] ?? DEFAULT_FAVORITES[id] ?? customApps(config).find((app) => app.id === id)?.shortcuts ?? []].flat()
  for (const name of names) {
    const appid = await shortcutAppId(config, name)
    if (appid) return `steam://rungameid/${shortcutGameId(appid)}`
  }
  return null
}

// What steamtv launched, for naming it in the closing animation.
const launchedNames = new Map<number, string>()
let emulatorGame: string | undefined

/** Name of what steamtv launched for a Steam app id, or of its running emulator game. */
export function launchedName(target: number | 'emulator'): string | undefined {
  return target === 'emulator' ? emulatorGame : launchedNames.get(target)
}

/** The 32-bit app id gamescope reports for a steam://rungameid/<id> launch. */
function appIdOf(url: string): number | null {
  const id = /^steam:\/\/rungameid\/(\d+)$/.exec(url)?.[1]
  if (!id) return null
  const big = BigInt(id)
  // Steam games use their app id; shortcuts a 64-bit id with the app id on top.
  return Number(big >> 32n ? big >> 32n : big)
}

function run(command: string, args: string[], env: Record<string, string> = {}): void {
  const child = spawn(command, args, { detached: true, stdio: 'ignore', env: { ...process.env, ...env } })
  child.on('error', (err) => console.error(`steamtv: could not run ${command}:`, err))
  child.unref()
}

/**
 * Switch games open straight in Ryujinx; Steam can't hand a game file to a
 * shortcut. Ryujinx runs inside steamtv's Steam session, so the Steam button and
 * returning to steamtv work as for any game.
 */
async function launchSwitch(config: Config, id: string): Promise<boolean> {
  const game = (await loadSwitchGames(config)).find((g) => g.id === id)
  if (!game) return false
  const ryujinx = ryujinxPath(config)
  console.log(`steamtv: launching ${game.path} in ${ryujinx}`)
  run(ryujinx, ['--fullscreen', game.path])
  emulatorGame = game.title
  await recordPlay(id)
  return true
}

/** PS3 games open straight in RPCS3, like Switch games in Ryujinx. */
async function launchPs3(config: Config, id: string): Promise<boolean> {
  const game = (await loadPs3Games(config)).find((g) => g.id === id)
  if (!game) return false
  const rpcs3 = rpcs3Path(config)
  console.log(`steamtv: launching ${game.titleId} in ${rpcs3}`)
  run(rpcs3, rpcs3Args(game))
  emulatorGame = game.title
  await recordPlay(id)
  return true
}

/** Xbox 360 games open in Xenia, a Windows program, under Proton. */
async function launchXbox360(config: Config, id: string): Promise<boolean> {
  const game = (await loadXbox360Games(config)).find((g) => g.id === id)
  if (!game) return false
  const { command, args, env } = xeniaCommand(config, game)
  await mkdir(env.STEAM_COMPAT_DATA_PATH, { recursive: true })
  console.log(`steamtv: launching ${game.path} in Xenia`)
  run(command, args, env)
  emulatorGame = game.title
  await recordPlay(id)
  return true
}

/** GameCube games open in Dolphin. */
async function launchGameCube(config: Config, id: string): Promise<boolean> {
  const game = (await loadGameCubeGames(config)).find((g) => g.id === id)
  if (!game) return false
  const { command, args } = dolphinCommand(config, game)
  console.log(`steamtv: launching ${game.path} in Dolphin`)
  run(command, args)
  emulatorGame = game.title
  await recordPlay(id)
  return true
}

/** Dreamcast games open in RetroArch's Flycast core. */
async function launchDreamcast(config: Config, id: string): Promise<boolean> {
  const game = (await loadDreamcastGames(config)).find((g) => g.id === id)
  if (!game) return false
  const { command, args } = flycastCommand(config, await dreamcastContent(game))
  console.log(`steamtv: launching ${game.path} in Flycast`)
  run(command, args)
  emulatorGame = game.title
  await recordPlay(id)
  return true
}

/** Arcade games open in RetroArch with their board's core (Flycast, FBNeo or MAME). */
async function launchArcade(config: Config, id: string): Promise<boolean> {
  const game = (await arcadeGames(config)).find((g) => g.id === id)
  if (!game) return false
  const { command, args } = arcadeCommand(config, game)
  console.log(`steamtv: launching ${game.path} in RetroArch (${game.core})`)
  run(command, args)
  emulatorGame = game.title
  await recordPlay(id)
  return true
}

/** Hands the URL to the running Steam client. Returns false if there is nothing to launch. */
export async function launch(config: Config, kind: LaunchKind, id: string, name?: string): Promise<boolean> {
  if (id.startsWith('switch:')) return launchSwitch(config, id)
  if (id.startsWith('ps3:')) return launchPs3(config, id)
  if (id.startsWith('xbox360:')) return launchXbox360(config, id)
  if (id.startsWith('gamecube:')) return launchGameCube(config, id)
  if (id.startsWith('dreamcast:')) return launchDreamcast(config, id)
  if (id.startsWith('arcade:')) return launchArcade(config, id)
  // An app opened directly before (from Recents) opens the same way.
  if (id.startsWith('app:')) return launch(config, 'app', id.slice(4), name)
  const url = await launchUrl(config, kind, id)
  if (!url) {
    // A Flathub program without a Steam shortcut runs directly, like the emulators.
    const direct = kind === 'app' ? directCommand(id) : null
    if (!direct) {
      console.error(`steamtv: nothing to launch for ${kind} ${id}`)
      return false
    }
    console.log(`steamtv: launching ${direct.args.join(' ')} directly`)
    run(direct.command, direct.args)
    emulatorGame = name
    await recordPlay(`app:${id}`)
    return true
  }
  console.log(`steamtv: launching ${url}`)
  const appid = appIdOf(url)
  if (appid !== null && name) launchedNames.set(appid, name)
  // `steam <url>` forwards to the running client and exits. Steam launched us with
  // LD_PRELOAD cleared (see the shortcut's launch options), which suits it too.
  run('steam', [url])
  return true
}
