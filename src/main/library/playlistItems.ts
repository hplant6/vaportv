import { byKeys } from '../media/servers'
import type { GamePlaylist, PlaylistRow, RecentItem } from '../../shared/types'
import type { Config } from '../config'
import { readFavorites, readHistory, readPlaytime } from '../history'
import { placesOf } from '../playlists'
import { emulatedItem } from './emulated'
import { emulatedGames, steamRoot } from './recents'
import { activeUserDir, steamGames } from './steam'
import { shortcutId, shortcutItem, shortcutTabGames, steamId, steamItem } from './steamTab'

/**
 * Each playlist's games as cards, in the order they were added. Games vaporTV can't find
 * now (uninstalled, or on a drive that isn't plugged in) are left off the row, not the playlist.
 */
export async function playlistRows(config: Config, playlists: GamePlaylist[]): Promise<PlaylistRow[]> {
  const wanted = new Set(playlists.flatMap((p) => p.items))
  if (!wanted.size) return playlists.map((p) => ({ id: p.id, name: p.name, items: [], showOn: placesOf(p) }))
  const favorites = await readFavorites()
  const cards = new Map<string, Promise<RecentItem>>()

  const root = steamRoot(config)
  const fromSteam = (id: string): boolean => id.startsWith('steam:') || id.startsWith('shortcut:')
  const userDir = [...wanted].some(fromSteam) ? await activeUserDir(root) : null
  if (userDir) {
    for (const game of await steamGames(root, userDir)) {
      if (wanted.has(steamId(game.appid))) cards.set(steamId(game.appid), steamItem(root, userDir, game, favorites))
    }
    // Non-Steam games added to Steam (Heroic's, Lutris's...).
    for (const game of await shortcutTabGames(config, userDir)) {
      if (wanted.has(shortcutId(game.appid))) cards.set(shortcutId(game.appid), shortcutItem(game, favorites))
    }
  }
  if ([...wanted].some((id) => !fromSteam(id) && !id.startsWith('media:'))) {
    const [history, playtime] = await Promise.all([readHistory(), readPlaytime()])
    for (const game of await emulatedGames(config)) {
      if (wanted.has(game.id)) cards.set(game.id, emulatedItem(game, history[game.id], favorites.includes(game.id), playtime[game.id]))
    }
  }
  // Films, shows and episodes: as cards that play (or open) as they do on the Media tab.
  const media = await byKeys([...wanted].filter((id) => id.startsWith('media:')))
  for (const [key, item] of media) {
    cards.set(key, Promise.resolve({ id: key, title: item.title, platform: 'media', cover: item.cover, wide: item.wide, lastPlayed: item.lastPlayed, media: item }))
  }
  return Promise.all(
    playlists.map(async (p) => ({
      id: p.id,
      name: p.name,
      items: await Promise.all(p.items.flatMap((id) => cards.get(id) ?? [])),
      showOn: placesOf(p)
    }))
  )
}
