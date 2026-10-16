import type { LibraryTab } from '../../shared/types'
import type { Config } from '../config'
import { artUrl } from './art'
import { collectionGames, isSupported, readCollections } from './collections'
import { isoDate } from './dates'
import { steamRoot } from './recents'
import { activeUserDir, steamGameArt, steamGames } from './steam'

export const DEFAULT_STEAM_COLLECTIONS = ['favorite']

/**
 * One row per collection chosen in Settings, in the Settings order. Rows hold the
 * collection's installed games, most recently played first, then by name.
 */
export async function loadSteamTab(config: Config): Promise<LibraryTab> {
  const layout = config.steamLayout ?? 'rows'
  const root = steamRoot(config)
  const userDir = await activeUserDir(root)
  if (!userDir) return { layout, recentsLayout: layout, rows: [] }
  const chosen = new Set(config.steamCollections ?? DEFAULT_STEAM_COLLECTIONS)
  const collections = (await readCollections(userDir)).filter((c) => chosen.has(c.id) && isSupported(c))
  if (!collections.length) return { layout, recentsLayout: layout, rows: [] }

  const games = await steamGames(root, userDir)
  const rows = await Promise.all(
    collections.map(async (collection) => {
      const installed = collectionGames(collection, games).sort(
        (a, b) => b.lastPlayed - a.lastPlayed || a.title.localeCompare(b.title)
      )
      return {
        id: collection.id,
        name: collection.name,
        // Dynamic collections only ever cover installed games here.
        notInstalled: collection.dynamic ? 0 : collection.appids.length - installed.length,
        items: await Promise.all(
          installed.map(async (game) => {
            const art = await steamGameArt(root, userDir, game.appid)
            return {
              id: `steam:${game.appid}`,
              title: game.title,
              platform: 'steam',
              lastPlayed: game.lastPlayed ? isoDate(game.lastPlayed) : undefined,
              cover: art.portrait && artUrl(art.portrait),
              wide: art.wide && artUrl(art.wide)
            }
          })
        )
      }
    })
  )
  return { layout, recentsLayout: layout, rows }
}
