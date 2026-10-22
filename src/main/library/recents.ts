import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { RecentItem } from '../../shared/types'
import type { Config } from '../config'
import { artUrl } from './art'
import { isoDate } from './dates'
import { arcadeGames } from './arcade'
import { dreamcastGames } from './dreamcastTab'
import { playedEmulated, type EmulatedGame } from './emulated'
import { gamecubeGames } from './gamecubeTab'
import { activeUserDir, playedShortcuts, playedSteamGames, type Played } from './steam'
import { cachedArt, GAME_ART } from './steamgriddb'
import { ps3Games } from './ps3Tab'
import { switchGames } from './switchTab'
import home from '../../../fixtures/home.json'
import { customAppFor, customApps } from '../customApps'
import { readHistory } from '../history'
import { xbox360Games } from './xbox360Tab'

const DEFAULT_RECENT_DAYS = 30
const DEFAULT_RECENT_LIMIT = 12

// App art (tiles, Recents cards, footer icons) comes from SteamGridDB, never from
// files shipped with vaporTV: those logos belong to the services. Websites and
// programs are listed there under names like these (searched as exact names).
const SERVICE_ART: Record<string, string> = {
  netflix: 'Netflix (Website)',
  disney: 'Disney+ (Website)',
  youtube: 'YouTube (Website)',
  emby: 'Emby Theater (Program)',
  prime: 'Amazon Prime Video (Website)',
  max: 'HBO Max (Website)',
  hulu: 'Hulu',
  paramount: 'Paramount+',
  peacock: 'Peacock TV',
  tubi: 'Tubi (Website)',
  jellyfin: 'Jellyfin',
  plex: 'Plex',
  kodi: 'Kodi'
}

/** Every app with art: the services, and Steam's own tile (kept apart: Steam's games share its platform name). */
const APP_ART: Record<string, string> = { ...SERVICE_ART, steam: 'Steam' }

const serviceArtKey = (platform: string): string => `service:${platform}`

/** The apps, as "games" for the background art fill: their art, and an icon for card footers. */
export function serviceArtGames(): EmulatedGame[] {
  return Object.entries(APP_ART).map(([platform, name]) => ({
    id: `service:${platform}`,
    title: name,
    platform,
    artKey: serviceArtKey(platform),
    artKinds: [...GAME_ART, 'icon']
  }))
}

/** The apps' cached art, as page URLs: wide (tiles) and icon (card footers), by app id. */
export async function appArt(): Promise<Record<string, { wide?: string; icon?: string }>> {
  const entries = await Promise.all(
    Object.keys(APP_ART).map(async (id) => {
      const art = await cachedArt(serviceArtKey(id))
      return [id, { wide: art.wide && artUrl(art.wide), icon: art.icon && artUrl(art.icon) }] as const
    })
  )
  return Object.fromEntries(entries)
}

export function steamRoot(config: Config): string {
  return config.steamRoot ?? process.env.STEAMTV_STEAM_ROOT ?? join(homedir(), '.local', 'share', 'Steam')
}

export function hasSteam(config: Config): boolean {
  return existsSync(join(steamRoot(config), 'userdata'))
}


/** `tiles`: wide art for apps (by platform), for a card with no poster to fall back on. */
export function toRecentItem(played: Played, tiles: Record<string, string> = {}): RecentItem {
  const tile = tiles[played.platform]
  // Streaming apps without a poster (from Steam or SteamGridDB) fall back to their tile.
  if (tile && !played.art.portrait) {
    return { id: played.id, title: played.title, platform: played.platform, lastPlayed: isoDate(played.lastPlayed), wide: tile }
  }
  return {
    id: played.id,
    title: played.title,
    platform: played.platform,
    lastPlayed: isoDate(played.lastPlayed),
    cover: played.art.portrait && artUrl(played.art.portrait)
  }
}

/** Newest first, inside the recent window, capped. */
export function pickRecent(played: Played[], now: number, days: number, limit: number): Played[] {
  const cutoff = now / 1000 - days * 86400
  return played
    .filter((p) => p.lastPlayed >= cutoff)
    .sort((a, b) => b.lastPlayed - a.lastPlayed)
    .slice(0, limit)
}

/** Apps vaporTV opened directly (no Steam shortcut, so Steam has no play time for them). */
async function playedApps(config: Config): Promise<Played[]> {
  const names = new Map<string, string>([...home.apps, ...home.moreApps, ...customApps(config)].map((app) => [app.id, app.name]))
  return Object.entries(await readHistory()).flatMap(([id, at]) => {
    const app = id.startsWith('app:') ? id.slice(4) : null
    const name = app && names.get(app)
    return name ? [{ id, title: name, platform: app, lastPlayed: at, art: {} }] : []
  })
}

export async function loadRecents(config: Config, now = Date.now()): Promise<RecentItem[]> {
  const root = steamRoot(config)
  const userDir = await activeUserDir(root)
  const [games, shortcuts, emulated] = await Promise.all([
    userDir
      ? playedSteamGames(root, userDir).catch((err) => {
          console.error('steamtv: reading Steam games failed:', err)
          return []
        })
      : [],
    userDir ? playedShortcuts(userDir).then(async (s) => [...s, ...(await playedApps(config))]) : playedApps(config),
    playedEmulated([
      ...(await switchGames(config)),
      ...(await ps3Games(config)),
      ...(await xbox360Games(config)),
      ...(await gamecubeGames(config)),
      ...(await dreamcastGames(config)),
      ...(await arcadeGames(config))
    ])
  ])
  const days = config.recentDays ?? DEFAULT_RECENT_DAYS
  const limit = config.recentLimit ?? DEFAULT_RECENT_LIMIT
  const recent = pickRecent([...games, ...shortcuts, ...emulated], now, days, limit)
  // Streaming apps: their SteamGridDB poster, unless Steam already has one.
  for (const played of recent) {
    if (SERVICE_ART[played.platform] && !played.art.portrait) {
      played.art.portrait = (await cachedArt(serviceArtKey(played.platform))).portrait
    }
  }
  // The services' wide art, and your own app tiles (their shortcuts get the tile too).
  const art = await appArt()
  const tiles: Record<string, string> = {}
  for (const id of Object.keys(SERVICE_ART)) if (art[id]?.wide) tiles[id] = art[id].wide!
  for (const played of recent) {
    const app = played.id.startsWith('shortcut:') ? customAppFor(config, played.title) : undefined
    if (!app) continue
    played.platform = app.id
    if (app.tile) tiles[app.id] = app.tile
  }
  return recent.map((played) => toRecentItem(played, tiles))
}
