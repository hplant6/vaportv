import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { RecentItem } from '../../shared/types'
import type { Config } from '../config'
import { artUrl } from './art'
import { isoDate } from './dates'
import { dreamcastGames } from './dreamcastTab'
import { playedEmulated, type EmulatedGame } from './emulated'
import { gamecubeGames } from './gamecubeTab'
import { activeUserDir, playedShortcuts, playedSteamGames, type Played } from './steam'
import { cachedArt } from './steamgriddb'
import { ps3Games } from './ps3Tab'
import { switchGames } from './switchTab'
import { xbox360Games } from './xbox360Tab'

const DEFAULT_RECENT_DAYS = 30
const DEFAULT_RECENT_LIMIT = 12

// Streaming apps without a SteamGridDB poster fall back to their Favorite Apps
// tile (16:9), shown centred on a poster-shaped card.
const SERVICE_TILES: Record<string, string> = {
  netflix: 'fixtures/tiles/netflix.webp',
  disney: 'fixtures/tiles/disney.webp',
  youtube: 'fixtures/tiles/youtube.webp',
  emby: 'fixtures/tiles/emby.webp',
  prime: 'fixtures/tiles/prime.webp',
  doki: 'fixtures/tiles/doki.webp',
  jme: 'fixtures/tiles/jme.webp',
  max: 'fixtures/tiles/max.webp',
  hulu: 'fixtures/tiles/hulu.webp',
  paramount: 'fixtures/tiles/paramount.webp',
  peacock: 'fixtures/tiles/peacock.webp',
  tubi: 'fixtures/tiles/tubi.webp',
  jellyfin: 'fixtures/tiles/jellyfin.webp'
}

// Streaming apps' posters come from SteamGridDB, where websites and programs are
// listed under names like these (searched as exact names).
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
  jellyfin: 'Jellyfin'
}

const serviceArtKey = (platform: string): string => `service:${platform}`

/** The streaming services, as "games" for the background art fill. */
export function serviceArtGames(): EmulatedGame[] {
  return Object.entries(SERVICE_ART).map(([platform, name]) => ({
    id: `service:${platform}`,
    title: name,
    platform,
    artKey: serviceArtKey(platform)
  }))
}

export function steamRoot(config: Config): string {
  return config.steamRoot ?? process.env.STEAMTV_STEAM_ROOT ?? join(homedir(), '.local', 'share', 'Steam')
}

export function hasSteam(config: Config): boolean {
  return existsSync(join(steamRoot(config), 'userdata'))
}


export function toRecentItem(played: Played): RecentItem {
  const tile = SERVICE_TILES[played.platform]
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
    userDir ? playedShortcuts(userDir) : [],
    playedEmulated([
      ...(await switchGames(config)),
      ...(await ps3Games(config)),
      ...(await xbox360Games(config)),
      ...(await gamecubeGames(config)),
      ...(await dreamcastGames(config))
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
  return recent.map(toRecentItem)
}
