import { open, readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import type { ScreensaverData, ScreensaverPhoto, ScreensaverSources, ScreensaverStyle } from '../shared/types'
import type { Config } from './config'
import { artUrl } from './library/art'
import { dreamcastGames } from './library/dreamcastTab'
import { gamecubeGames } from './library/gamecubeTab'
import { ps2Games } from './library/ps2Tab'
import { xboxGames } from './library/xboxTab'
import { wiiGames } from './library/wiiTab'
import { ps3Games } from './library/ps3Tab'
import { hasSteam, steamRoot } from './library/recents'
import { activeUserDir, steamGameHero, steamGames } from './library/steam'
import { cachedArt } from './library/steamgriddb'
import { switchGames } from './library/switchTab'
import { arcadeGames } from './library/arcade'
import { xbox360Games } from './library/xbox360Tab'

// Chromium can show these; HEIC (the iPhone default) it can't.
const IMAGE = /\.(jpe?g|png|webp|gif|avif)$/i

/** Minutes of no input before the screensaver starts, when not chosen in Settings. */
export const DEFAULT_SCREENSAVER_DELAY = 10

export const DEFAULT_SOURCES: ScreensaverSources = { gameArt: true, screenshots: true, photos: true }

/** Game lists are slow to gather (ROM folders, Steam manifests); reuse them for a while. */
const GAME_ART_TTL = 30 * 60 * 1000
let gameArtCache: { at: number; photos: ScreensaverPhoto[] } | null = null

/** Where you put photos for the screensaver yourself. */
export function screensaverFolder(config: Config): string {
  return config.screensaverFolder ?? join(homedir(), 'Pictures', 'Screensaver')
}

/** Photos add-ons have fetched (e.g. Google Photos), one subfolder each. */
export const ADDON_PHOTOS = join(homedir(), '.local', 'share', 'steamtv', 'screensaver')

/** Every folder the screensaver shows your photos from (also roots the page may load them from). */
export function screensaverFolders(config: Config): string[] {
  return [screensaverFolder(config), ADDON_PHOTOS]
}

/** Image files in a folder and its subfolders (`depth` levels down), skipping `skip` folders. */
async function images(dir: string, depth = 2, skip?: RegExp): Promise<string[]> {
  const found: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const path = join(dir, entry.name)
    if (entry.isDirectory() && depth > 0 && !skip?.test(entry.name)) found.push(...(await images(path, depth - 1, skip)))
    else if (entry.isFile() && IMAGE.test(entry.name)) found.push(path)
  }
  return found
}

/** Heroes of installed Steam games (with their logos) and of emulated games, from SteamGridDB. */
async function gameArt(config: Config): Promise<ScreensaverPhoto[]> {
  if (gameArtCache && Date.now() - gameArtCache.at < GAME_ART_TTL) return gameArtCache.photos
  const photos: ScreensaverPhoto[] = []
  if (hasSteam(config)) {
    const root = steamRoot(config)
    const userDir = await activeUserDir(root)
    if (userDir) {
      for (const game of await steamGames(root, userDir)) {
        const { hero, logo } = await steamGameHero(root, userDir, game.appid)
        if (hero) photos.push({ url: artUrl(hero), kind: 'art', caption: game.title, logo: logo && artUrl(logo) })
      }
    }
  }
  const loaders = [switchGames, ps2Games, ps3Games, xboxGames, xbox360Games, gamecubeGames, wiiGames, dreamcastGames, arcadeGames]
  const emulated = (await Promise.all(loaders.map((load) => load(config).catch(() => [])))).flat()
  for (const game of emulated) {
    const { hero } = await cachedArt(game.artKey)
    if (hero) photos.push({ url: artUrl(hero), kind: 'art', caption: game.title })
  }
  gameArtCache = { at: Date.now(), photos }
  return photos
}

/** Screenshots taken in Steam, captioned with their game where it's installed. */
async function screenshots(config: Config): Promise<ScreensaverPhoto[]> {
  if (!hasSteam(config)) return []
  const root = steamRoot(config)
  const userDir = await activeUserDir(root)
  if (!userDir) return []
  const names = new Map((await steamGames(root, userDir)).map((g) => [g.appid, g.title]))
  const remote = join(userDir, '760', 'remote')
  const photos: ScreensaverPhoto[] = []
  for (const appid of await readdir(remote).catch(() => [])) {
    // <appid>/screenshots/*.jpg, minus the thumbnails Steam keeps beside them.
    for (const path of await images(join(remote, appid, 'screenshots'), 0)) {
      photos.push({ url: artUrl(path), kind: 'screenshot', caption: names.get(appid) })
    }
  }
  return photos
}

/**
 * A photo folder's own record of when each photo was taken, for photos that no longer
 * carry it themselves (e.g. a Google Takeout export, whose dates are in side files):
 * `{ "photos": { "<path inside the folder, with />": { "taken": "<ISO date>" } } }`.
 */
export const PHOTO_INDEX = 'vaportv-photos.json'

async function photoIndex(folder: string): Promise<Record<string, { taken?: string }>> {
  try {
    return JSON.parse(await readFile(join(folder, PHOTO_INDEX), 'utf8')).photos ?? {}
  } catch {
    return {}
  }
}

/** Your folder's photos, each with its album (the subfolder it's in) and date if known, and the add-ons' photos. */
async function yourPhotos(config: Config): Promise<ScreensaverPhoto[]> {
  const folder = screensaverFolder(config)
  const [own, index, addons] = await Promise.all([images(folder), photoIndex(folder), images(ADDON_PHOTOS)])
  const photos = own.map((path): ScreensaverPhoto => {
    const inside = relative(folder, path).split(sep).join('/')
    const album = dirname(inside) === '.' ? undefined : basename(dirname(inside))
    return { url: artUrl(path), kind: 'photo', album, taken: index[inside]?.taken }
  })
  return [...photos, ...addons.map((path): ScreensaverPhoto => ({ url: artUrl(path), kind: 'photo' }))]
}

const EXIF_DATE = /(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/g

/**
 * When a photo was taken, from the EXIF in the start of its file: the earliest of its
 * dates (taken, digitised, last edited), as local time. Null if it has none.
 */
export function exifDate(head: Buffer): string | null {
  const dates = [...head.toString('latin1').matchAll(EXIF_DATE)]
    .filter(([, year, month, day]) => Number(year) >= 1900 && Number(month) >= 1 && Number(month) <= 12 && Number(day) >= 1 && Number(day) <= 31)
    .map(([, y, mo, d, h, mi, se]) => `${y}-${mo}-${d}T${h}:${mi}:${se}`)
    .sort()
  return dates[0] ?? null
}

/** The date a photo shown by the screensaver (by its URL) was taken, from its EXIF. */
export async function photoTaken(config: Config, url: string): Promise<string | null> {
  const path = resolve(decodeURIComponent(url.slice(url.indexOf('/local/') + '/local/'.length)))
  if (!screensaverFolders(config).some((dir) => path.startsWith(resolve(dir) + sep))) return null
  const file = await open(path).catch(() => null)
  if (!file) return null
  try {
    const head = Buffer.alloc(64 * 1024)
    const { bytesRead } = await file.read(head, 0, head.length, 0)
    return exifDate(head.subarray(0, bytesRead))
  } finally {
    await file.close()
  }
}

export function screensaverStyle(config: Config): ScreensaverStyle {
  return config.screensaverStyle ?? 'slideshow'
}

export function screensaverSources(config: Config): ScreensaverSources {
  return { ...DEFAULT_SOURCES, ...config.screensaverSources }
}

export async function screensaverData(config: Config): Promise<ScreensaverData> {
  const style = screensaverStyle(config)
  const sources = screensaverSources(config)
  const photos =
    style === 'slideshow'
      ? (
          await Promise.all([
            sources.gameArt ? gameArt(config) : [],
            sources.screenshots ? screenshots(config) : [],
            sources.photos ? yourPhotos(config) : []
          ])
        ).flat()
      : []
  return {
    delayMinutes: config.screensaverDelay ?? DEFAULT_SCREENSAVER_DELAY,
    style,
    clockSpot: config.screensaverClock ?? 'moving',
    photoDetails: config.screensaverDetails ?? true,
    photos
  }
}
