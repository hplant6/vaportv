import { existsSync } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { childObject, childString, parseBinaryVdf, parseTextVdf, type VdfObject } from './vdf'

export interface Played {
  /** `steam:<appid>` or `shortcut:<appid>` */
  id: string
  title: string
  /** Platform key for the card's footer logo. */
  platform: string
  /** Unix seconds. */
  lastPlayed: number
  /** Absolute paths to local art, when Steam has any. */
  art: { portrait?: string; wide?: string }
}

// Installed "apps" that are really runtimes and tools; Steam records play times for them too.
const TOOLS = /^(Proton|Steam Linux Runtime|Steamworks Common Redistributables|SteamVR)\b/i

/** The Steam user whose localconfig.vdf was written most recently. */
export async function activeUserDir(steamRoot: string): Promise<string | null> {
  const root = join(steamRoot, 'userdata')
  let best: { dir: string; mtime: number } | null = null
  for (const id of await readdir(root).catch(() => [])) {
    if (!/^\d+$/.test(id) || id === '0') continue
    const mtime = await stat(join(root, id, 'config', 'localconfig.vdf')).then((s) => s.mtimeMs, () => 0)
    if (mtime && (!best || mtime > best.mtime)) best = { dir: join(root, id), mtime }
  }
  return best?.dir ?? null
}

async function libraryFolders(steamRoot: string): Promise<string[]> {
  const folders = new Set([join(steamRoot, 'steamapps')])
  try {
    const vdf = parseTextVdf(await readFile(join(steamRoot, 'steamapps', 'libraryfolders.vdf'), 'utf8'))
    for (const entry of Object.values(childObject(vdf, 'libraryfolders') ?? {})) {
      const path = typeof entry === 'object' ? childString(entry, 'path') : undefined
      if (path && existsSync(join(path, 'steamapps'))) folders.add(join(path, 'steamapps'))
    }
  } catch {
    // Only the default library, then.
  }
  return [...folders]
}

/** Installed games by app id, with their names, from every library folder. */
async function installedGames(steamRoot: string): Promise<Map<string, string>> {
  const games = new Map<string, string>()
  for (const folder of await libraryFolders(steamRoot)) {
    for (const file of await readdir(folder).catch(() => [])) {
      const match = /^appmanifest_(\d+)\.acf$/.exec(file)
      if (!match) continue
      const manifest = parseTextVdf(await readFile(join(folder, file), 'utf8').catch(() => ''))
      const name = childString(manifest, 'AppState', 'name')
      if (name && !TOOLS.test(name)) games.set(match[1], name)
    }
  }
  return games
}

const PORTRAIT = ['library_600x900.jpg', 'library_capsule.jpg']
const WIDE = ['library_header.jpg', 'header.jpg', 'library_hero.jpg']

/**
 * Finds a librarycache image. Older games keep it at the top of the app's folder;
 * newer ones keep each image in a hashed subfolder.
 */
export async function findCached(dir: string, names: string[]): Promise<string | undefined> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const name of names) {
    if (entries.some((e) => e.isFile() && e.name === name)) return join(dir, name)
    for (const sub of entries.filter((e) => e.isDirectory())) {
      const path = join(dir, sub.name, name)
      if (existsSync(path)) return path
    }
  }
  return undefined
}

/** Custom art set in Steam's library (grid folder): `<id>p` portrait, `<id>` wide. */
function gridArt(gridDir: string, id: string): { portrait?: string; wide?: string } {
  const find = (base: string): string | undefined =>
    ['.png', '.jpg', '.jpeg', '.webp'].map((ext) => join(gridDir, base + ext)).find((p) => existsSync(p))
  return { portrait: find(`${id}p`), wide: find(id) }
}

export interface SteamGame {
  appid: string
  title: string
  /** Unix seconds, or 0 if never played. */
  lastPlayed: number
}

/** Installed Steam games (tools excluded), with when each was last played. */
export async function steamGames(steamRoot: string, userDir: string): Promise<SteamGame[]> {
  const config = parseTextVdf(await readFile(join(userDir, 'config', 'localconfig.vdf'), 'utf8').catch(() => ''))
  const apps = childObject(config, 'UserLocalConfigStore', 'Software', 'Valve', 'Steam', 'apps') ?? {}
  const games: SteamGame[] = []
  for (const [appid, title] of await installedGames(steamRoot)) {
    const entry = apps[appid]
    const lastPlayed = Number(typeof entry === 'object' ? childString(entry, 'LastPlayed') : undefined) || 0
    games.push({ appid, title, lastPlayed })
  }
  return games
}

/** Portrait and wide art for a Steam game: custom grid art first, then Steam's library cache. */
export async function steamGameArt(steamRoot: string, userDir: string, appid: string): Promise<Played['art']> {
  const cache = join(steamRoot, 'appcache', 'librarycache', appid)
  const custom = gridArt(join(userDir, 'config', 'grid'), appid)
  return {
    portrait: custom.portrait ?? (await findCached(cache, PORTRAIT)),
    wide: custom.wide ?? (await findCached(cache, WIDE))
  }
}

export async function playedSteamGames(steamRoot: string, userDir: string): Promise<Played[]> {
  // Uninstalled games can't be launched from here, so they don't belong in Recents.
  const played = (await steamGames(steamRoot, userDir)).filter((game) => game.lastPlayed > 0)
  return Promise.all(
    played.map(async (game) => ({
      id: `steam:${game.appid}`,
      title: game.title,
      platform: 'steam',
      lastPlayed: game.lastPlayed,
      art: await steamGameArt(steamRoot, userDir, game.appid)
    }))
  )
}

// Non-Steam shortcuts that are streaming apps get that service's logo; anything
// else added to Steam (GOG games, etc.) counts as a Steam-launched game.
const SERVICES: [RegExp, string][] = [
  [/netflix/i, 'netflix'],
  [/disney/i, 'disney'],
  [/youtube|vacuumtube|smarttube/i, 'youtube'],
  [/emby/i, 'emby'],
  [/prime video|amazon/i, 'prime'],
  // Short names: matched against the whole shortcut name, so "Max Payne" isn't Max.
  [/^(hbo )?max$/i, 'max'],
  [/^hulu$/i, 'hulu'],
  [/^paramount\+?$/i, 'paramount'],
  [/^peacock$/i, 'peacock'],
  [/^tubi$/i, 'tubi'],
  [/^jellyfin$/i, 'jellyfin'],
  [/^plex( htpc)?$/i, 'plex'],
  [/^kodi$/i, 'kodi']
]

/** Whether a shortcut's name is a streaming service's (an app, not a game). */
export function isServiceName(name: string): boolean {
  return SERVICES.some(([pattern]) => pattern.test(name))
}

// Shortcuts that are launchers rather than things you play.
const LAUNCHERS = /vaportv|steamtv|emulationstation|es-de/i

export async function playedShortcuts(userDir: string): Promise<Played[]> {
  let vdf: VdfObject
  try {
    vdf = parseBinaryVdf(await readFile(join(userDir, 'config', 'shortcuts.vdf')))
  } catch {
    return []
  }
  const gridDir = join(userDir, 'config', 'grid')

  const played: Played[] = []
  for (const entry of Object.values(childObject(vdf, 'shortcuts') ?? {})) {
    if (typeof entry !== 'object') continue
    const title = childString(entry, 'AppName') ?? ''
    const exe = childString(entry, 'Exe') ?? ''
    const appid = Number(childString(entry, 'appid'))
    const lastPlayed = Number(childString(entry, 'LastPlayTime'))
    if (!title || !appid || !lastPlayed || LAUNCHERS.test(`${title} ${exe}`)) continue
    played.push({
      id: `shortcut:${appid}`,
      title,
      platform: SERVICES.find(([pattern]) => pattern.test(title) || pattern.test(`${title} ${exe}`))?.[1] ?? 'steam',
      lastPlayed,
      art: gridArt(gridDir, String(appid))
    })
  }
  return played
}

/**
 * A Steam game's hero (the wide, logo-free banner on its library page) and logo:
 * custom ones from the grid folder first, then Steam's library cache.
 */
export async function steamGameHero(steamRoot: string, userDir: string, appid: string): Promise<{ hero?: string; logo?: string }> {
  const cache = join(steamRoot, 'appcache', 'librarycache', appid)
  const grid = join(userDir, 'config', 'grid')
  const custom = (suffix: string): string | undefined =>
    ['.png', '.jpg', '.jpeg', '.webp'].map((ext) => join(grid, `${appid}_${suffix}${ext}`)).find((p) => existsSync(p))
  return {
    hero: custom('hero') ?? (await findCached(cache, ['library_hero.jpg'])),
    logo: custom('logo') ?? (await findCached(cache, ['logo.png']))
  }
}
