import { readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ScreensaverData, ScreensaverPhoto, ScreensaverSources, ScreensaverStyle } from '../shared/types'
import type { Config } from './config'
import { artUrl } from './library/art'
import { dreamcastGames } from './library/dreamcastTab'
import { gamecubeGames } from './library/gamecubeTab'
import { ps3Games } from './library/ps3Tab'
import { hasSteam, steamRoot } from './library/recents'
import { activeUserDir, steamGameHero, steamGames } from './library/steam'
import { cachedArt } from './library/steamgriddb'
import { switchGames } from './library/switchTab'
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
  const loaders = [switchGames, ps3Games, xbox360Games, gamecubeGames, dreamcastGames]
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

async function yourPhotos(config: Config): Promise<ScreensaverPhoto[]> {
  const paths = (await Promise.all(screensaverFolders(config).map((dir) => images(dir)))).flat()
  return paths.map((path) => ({ url: artUrl(path), kind: 'photo' as const }))
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
  return { delayMinutes: config.screensaverDelay ?? DEFAULT_SCREENSAVER_DELAY, style, photos }
}
