import type { LibraryTab, RecentItem } from '../../shared/types'
import { addFavorites, readFavorites } from '../history'
import { recentsLayout, saveConfig, type Config } from '../config'
import { artUrl } from './art'
import { collectionGames, isSupported, readCollections } from './collections'
import { isoDate } from './dates'
import { steamRoot } from './recents'
import { activeUserDir, steamGameArt, steamGames, type SteamGame } from './steam'

/** Steam's own collections shown by default: none, vaporTV's Favorites row takes the place of Steam's. */
export const DEFAULT_STEAM_COLLECTIONS: string[] = []
/** Steam's built-in Favorites collection. */
const STEAM_FAVORITES = 'favorite'
/** How many games the Recently played row shows. */
const RECENT_LIMIT = 20

const steamId = (appid: string | number): string => `steam:${appid}`

async function steamItem(root: string, userDir: string, game: SteamGame, favorites: string[]): Promise<RecentItem> {
  const art = await steamGameArt(root, userDir, game.appid)
  return {
    id: steamId(game.appid),
    title: game.title,
    platform: 'steam',
    favorite: favorites.includes(steamId(game.appid)),
    lastPlayed: game.lastPlayed ? isoDate(game.lastPlayed) : undefined,
    playtime: game.playtime || undefined,
    cover: art.portrait && artUrl(art.portrait),
    wide: art.wide && artUrl(art.wide)
  }
}

/**
 * Once: the games in Steam's Favorites collection become vaporTV favourites, and that
 * collection comes off the tab (it would be a second Favorites row). It stays in
 * Settings for anyone who wants Steam's row back.
 */
export async function adoptSteamFavorites(config: Config): Promise<void> {
  if (config.steamFavoritesAdopted) return
  const userDir = await activeUserDir(steamRoot(config))
  if (!userDir) return
  const steam = (await readCollections(userDir)).find((c) => c.id === STEAM_FAVORITES)
  if (steam) await addFavorites(steam.appids.map(steamId))
  await saveConfig((current) => ({
    steamFavoritesAdopted: true,
    ...(current.steamCollections && { steamCollections: current.steamCollections.filter((id) => id !== STEAM_FAVORITES) })
  }))
}

/**
 * Favorites (vaporTV's own, Y on a game) and Recently played first, then one row per
 * Steam collection chosen in Settings, in the Settings order, then every installed
 * game A–Z. Collection rows hold their installed games, most recently played first,
 * then by name. `favorites` is for tests; it's read from disk otherwise.
 */
export async function loadSteamTab(config: Config, favorites?: string[]): Promise<LibraryTab> {
  const layout = config.steamLayout ?? 'rows'
  const recents = recentsLayout(config, 'steam')
  const root = steamRoot(config)
  const userDir = await activeUserDir(root)
  if (!userDir) return { layout, recentsLayout: recents, rows: [] }
  const chosen = new Set(config.steamCollections ?? DEFAULT_STEAM_COLLECTIONS)
  const collections = (await readCollections(userDir)).filter((c) => chosen.has(c.id) && isSupported(c))

  const games = await steamGames(root, userDir)
  const favs = favorites ?? (await readFavorites())
  const item = (game: SteamGame): Promise<RecentItem> => steamItem(root, userDir, game, favs)
  const byId = new Map(games.map((game) => [steamId(game.appid), game]))
  const favoriteGames = favs.map((id) => byId.get(id)).filter((game) => game !== undefined)
  const favoriteRow = favoriteGames.length
    ? [{ id: 'favorites', name: 'Favorites', notInstalled: 0, items: await Promise.all(favoriteGames.map(item)) }]
    : []
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
          items: await Promise.all(played.map(item))
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
        items: await Promise.all(installed.map(item))
      }
    })
  )
  const all = [...games].sort((a, b) => a.title.localeCompare(b.title))
  const allRow = all.length
    ? [{ id: 'all', name: 'All games', notInstalled: 0, hint: 'Y to favourite', items: await Promise.all(all.map(item)) }]
    : []
  return { layout, recentsLayout: recents, rows: [...favoriteRow, ...recentRow, ...collectionRows, ...allRow] }
}
