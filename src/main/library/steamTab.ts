import type { LibraryTab, RecentItem } from '../../shared/types'
import { recentsLayout, type Config } from '../config'
import { artUrl } from './art'
import { collectionGames, isSupported, readCollections } from './collections'
import { isoDate } from './dates'
import { steamRoot } from './recents'
import { activeUserDir, steamGameArt, steamGames, type SteamGame } from './steam'

export const DEFAULT_STEAM_COLLECTIONS = ['favorite']
/** How many games the Recently played row shows. */
const RECENT_LIMIT = 20

async function steamItem(root: string, userDir: string, game: SteamGame): Promise<RecentItem> {
  const art = await steamGameArt(root, userDir, game.appid)
  return {
    id: `steam:${game.appid}`,
    title: game.title,
    platform: 'steam',
    lastPlayed: game.lastPlayed ? isoDate(game.lastPlayed) : undefined,
    playtime: game.playtime || undefined,
    cover: art.portrait && artUrl(art.portrait),
    wide: art.wide && artUrl(art.wide)
  }
}

/**
 * Recently played first, then one row per collection chosen in Settings, in the
 * Settings order. Collection rows hold its installed games, most recently played
 * first, then by name.
 */
export async function loadSteamTab(config: Config): Promise<LibraryTab> {
  const layout = config.steamLayout ?? 'rows'
  const recents = recentsLayout(config, 'steam')
  const root = steamRoot(config)
  const userDir = await activeUserDir(root)
  if (!userDir) return { layout, recentsLayout: recents, rows: [] }
  const chosen = new Set(config.steamCollections ?? DEFAULT_STEAM_COLLECTIONS)
  const collections = (await readCollections(userDir)).filter((c) => chosen.has(c.id) && isSupported(c))

  const games = await steamGames(root, userDir)
  const played = games
    .filter((g) => g.lastPlayed)
    .sort((a, b) => b.lastPlayed - a.lastPlayed)
    .slice(0, RECENT_LIMIT)
  const recentRow = played.length
    ? [
        {
          id: 'recent',
          name: 'Recently played',
          notInstalled: 0,
          items: await Promise.all(played.map((game) => steamItem(root, userDir, game)))
        }
      ]
    : []
  const collectionRows = await Promise.all(
    collections.map(async (collection) => {
      const installed = collectionGames(collection, games).sort(
        (a, b) => b.lastPlayed - a.lastPlayed || a.title.localeCompare(b.title)
      )
      return {
        id: collection.id,
        name: collection.name,
        // Dynamic collections only ever cover installed games here.
        notInstalled: collection.dynamic ? 0 : collection.appids.length - installed.length,
        items: await Promise.all(installed.map((game) => steamItem(root, userDir, game)))
      }
    })
  )
  return { layout, recentsLayout: recents, rows: [...recentRow, ...collectionRows] }
}
