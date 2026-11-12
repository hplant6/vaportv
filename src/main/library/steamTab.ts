import { stat } from 'node:fs/promises'
import type { CollectionRow, LibraryTab, RecentItem } from '../../shared/types'
import { addFavorites, readFavorites } from '../history'
import { recentsLayout, saveConfig, type Config } from '../config'
import { customAppFor } from '../customApps'
import { artUrl } from './art'
import { collectionGames, isSupported, readCollections } from './collections'
import { isoDate } from './dates'
import { steamRoot } from './recents'
import { activeUserDir, shortcutGames, steamGameArt, steamGames, type ShortcutGame, type SteamGame } from './steam'
import { cachedArt, fetchArt } from './steamgriddb'
import { storeFacts } from './steamStore'

/** Steam's own collections shown by default: none, vaporTV's Favorites row takes the place of Steam's. */
export const DEFAULT_STEAM_COLLECTIONS: string[] = []
/** Steam's built-in Favorites collection. */
const STEAM_FAVORITES = 'favorite'
/** How many games the Recently played row shows. */
const RECENT_LIMIT = 20

export const steamId = (appid: string | number): string => `steam:${appid}`
export const shortcutId = (appid: number): string => `shortcut:${appid}`
/** SteamGridDB cache key for a shortcut game's art: by name, so it survives the shortcut being re-added. */
export const shortcutArtKey = (title: string): string => `shortcut:${title}`

export async function steamItem(root: string, userDir: string, game: SteamGame, favorites: string[]): Promise<RecentItem> {
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

export async function shortcutItem(game: ShortcutGame, favorites: string[]): Promise<RecentItem> {
  const fetched = game.art.portrait && game.art.wide ? {} : await cachedArt(shortcutArtKey(game.title))
  const portrait = game.art.portrait ?? fetched.portrait
  const wide = game.art.wide ?? fetched.wide
  return {
    id: shortcutId(game.appid),
    title: game.title,
    platform: 'steam',
    favorite: favorites.includes(shortcutId(game.appid)),
    lastPlayed: game.lastPlayed ? isoDate(game.lastPlayed) : undefined,
    playtime: game.playtime || undefined,
    cover: portrait && artUrl(portrait),
    wide: wide && artUrl(wide)
  }
}

/** Non-Steam games on the Steam tab: shortcuts that aren't one of vaporTV's apps (Emby, a web app). */
export async function shortcutTabGames(config: Config, userDir: string): Promise<ShortcutGame[]> {
  return (await shortcutGames(userDir)).filter((game) => !customAppFor(config, game.title))
}

/** Downloads SteamGridDB art for non-Steam games Steam has none for, then calls `onUpdate`. */
let fillingShortcuts = false
export function fillShortcutArt(config: Config, onUpdate: () => void): void {
  const key = config.steamGridDbKey
  if (!key || fillingShortcuts) return
  fillingShortcuts = true
  ;(async () => {
    const userDir = await activeUserDir(steamRoot(config))
    if (!userDir) return
    let saved = false
    for (const game of await shortcutTabGames(config, userDir)) {
      if (game.art.portrait && game.art.wide) continue
      const got = await fetchArt(key, shortcutArtKey(game.title), game.title).catch((err: Error) => {
        console.error(`steamtv: art for ${game.title}:`, err.message)
        return false
      })
      saved ||= got
    }
    if (saved) onUpdate()
  })().finally(() => (fillingShortcuts = false))
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
 * Steam collection chosen in Settings, in the Settings order, then the non-Steam games
 * added to Steam (Heroic's, Lutris's...), then every installed game A–Z. Collection rows hold their installed games, most recently played first,
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
  const shortcuts = await shortcutTabGames(config, userDir)
  const favs = favorites ?? (await readFavorites())
  // Steam games and non-Steam shortcuts side by side, each made into a card its own way.
  type Entry = { id: string; title: string; lastPlayed: number; card: () => Promise<RecentItem> }
  const steamEntries: Entry[] = games.map((game) => ({ id: steamId(game.appid), title: game.title, lastPlayed: game.lastPlayed, card: () => steamItem(root, userDir, game, favs) }))
  const shortcutEntries: Entry[] = shortcuts.map((game) => ({ id: shortcutId(game.appid), title: game.title, lastPlayed: game.lastPlayed, card: () => shortcutItem(game, favs) }))
  const everything = [...steamEntries, ...shortcutEntries]
  const cards = (entries: Entry[]): Promise<RecentItem[]> => Promise.all(entries.map((entry) => entry.card()))
  const byId = new Map(everything.map((entry) => [entry.id, entry]))
  const favoriteGames = favs.map((id) => byId.get(id)).filter((entry) => entry !== undefined)
  const favoriteRow = favoriteGames.length ? [{ id: 'favorites', name: 'Favorites', notInstalled: 0, items: await cards(favoriteGames) }] : []
  const played = everything
    .filter((entry) => entry.lastPlayed)
    .sort((a, b) => b.lastPlayed - a.lastPlayed)
    .slice(0, RECENT_LIMIT)
  const recentRow = played.length ? [{ id: 'recent', name: 'Recently played', notInstalled: 0, items: await cards(played) }] : []
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
        items: await Promise.all(installed.map((game) => steamItem(root, userDir, game, favs)))
      }
    })
  )
  // Games added to Steam from elsewhere (Heroic, Lutris...), A–Z, so they're easy to find.
  const byTitle = (a: Entry, b: Entry): number => a.title.localeCompare(b.title)
  const nonSteamRow = shortcutEntries.length
    ? [{ id: 'non-steam', name: 'Non-Steam games', notInstalled: 0, items: await cards([...shortcutEntries].sort(byTitle)) }]
    : []
  const all = [...everything].sort(byTitle)
  const allRow = all.length
    ? [{ id: 'all', name: 'All games', notInstalled: 0, hint: 'Y to favourite', items: await cards(all) }]
    : []
  const rows: CollectionRow[] = [...favoriteRow, ...recentRow, ...collectionRows, ...nonSteamRow, ...allRow]
  // For the left bar's Genres, Years and sort: what Steam's store said of each (steamStore.ts fills it in the
  // background), and when its install folder was made.
  const facts = await storeFacts(games.map((game) => game.appid))
  const added = new Map(
    await Promise.all(
      games.map(async (game) => {
        const info = game.installDir ? await stat(game.installDir).catch(() => null) : null
        return [steamId(game.appid), info ? info.birthtimeMs || info.mtimeMs : undefined] as const
      })
    )
  )
  const withFacts = (item: RecentItem): RecentItem =>
    item.id.startsWith('steam:') ? { ...item, ...facts.get(item.id.slice('steam:'.length)), added: added.get(item.id) } : item
  return { layout, recentsLayout: recents, rows: rows.map((row) => ({ ...row, items: row.items.map(withFacts) })) }
}

/** The installed Steam games' app ids, for steamStore.ts to fill in. */
export async function steamAppIds(config: Config): Promise<string[]> {
  const root = steamRoot(config)
  const userDir = await activeUserDir(root)
  return userDir ? (await steamGames(root, userDir)).map((game) => game.appid) : []
}
