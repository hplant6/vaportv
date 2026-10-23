import { existsSync } from 'node:fs'
import type { LibraryTab, RecentItem, SteamLayout } from '../../shared/types'
import type { Config } from '../config'
import { readFavorites, readHistory } from '../history'
import { artUrl } from './art'
import { isoDate } from './dates'
import type { Played } from './steam'
import { hasLibretroThumbnails, libretroCover } from './libretroThumbnails'
import { cachedArt, fetchArt, savePortrait, type ArtKind } from './steamgriddb'

// What the Switch and PS3 tabs share: games steamtv launches in an emulator,
// with art from SteamGridDB, and its own play history and favourites.

export interface EmulatedGame {
  /** `<platform>:<stable key>`, used for history, favourites and launching. */
  id: string
  title: string
  /** Platform key for the card's footer logo. */
  platform: string
  /** SteamGridDB cache key. */
  artKey: string
  /** What to search SteamGridDB for, when not the title (an arcade clone: its parent's). */
  artTitle?: string
  /** Exact names to look for in the libretro thumbnails (the dump's or MAME's), best first. */
  thumbnailNames?: string[]
  /** Local 16:9-ish art to fall back on when SteamGridDB has none (a file path). */
  localWide?: string
  /** SteamGridDB art to fetch, when more than a game's (an app's icon too). */
  artKinds?: ArtKind[]
}

/** Games with the names they were given in Select's game options, A–Z again. Art stays keyed by the old name. */
export function withNames<T extends EmulatedGame>(config: Config, games: T[]): T[] {
  const names = config.gameTitles ?? {}
  if (!games.some((game) => names[game.id])) return games
  return games.map((game) => (names[game.id] ? { ...game, title: names[game.id] } : game)).sort((a, b) => a.title.localeCompare(b.title))
}

async function art(game: EmulatedGame): Promise<Played['art']> {
  const cached = await cachedArt(game.artKey)
  const local = game.localWide && existsSync(game.localWide) ? game.localWide : undefined
  return { portrait: cached.portrait, wide: cached.wide ?? local }
}

export async function emulatedItem(game: EmulatedGame, lastPlayed?: number, favorite = false): Promise<RecentItem> {
  const { portrait, wide } = await art(game)
  return {
    id: game.id,
    title: game.title,
    platform: game.platform,
    favorite,
    lastPlayed: lastPlayed ? isoDate(lastPlayed) : undefined,
    cover: portrait && artUrl(portrait),
    wide: wide && artUrl(wide)
  }
}

/** A tab: favourites and recently played (when there are any), then every game A–Z. */
export async function emulatedTab(games: EmulatedGame[], layout: SteamLayout, recentsLayout: SteamLayout): Promise<LibraryTab> {
  // No games at all: no sections, so the tab shows its own "nothing found" message.
  if (!games.length) return { layout, recentsLayout, rows: [] }
  const history = await readHistory()
  const favorites = await readFavorites()
  const items = await Promise.all(games.map((game) => emulatedItem(game, history[game.id], favorites.includes(game.id))))
  const byId = new Map(items.map((item) => [item.id, item]))
  const favorite = favorites.map((id) => byId.get(id)).filter((item) => item !== undefined)
  const recent = items.filter((item) => history[item.id]).sort((a, b) => history[b.id] - history[a.id])
  const rows = []
  if (favorite.length) rows.push({ id: 'favorites', name: 'Favorites', items: favorite, notInstalled: 0 })
  if (recent.length) rows.push({ id: 'recent', name: 'Recently played', items: recent, notInstalled: 0 })
  rows.push({ id: 'all', name: 'All games', items, notInstalled: 0, hint: 'Y to favourite' })
  return { layout, recentsLayout, rows }
}

/** Games steamtv has launched, for Recents. */
export async function playedEmulated(games: EmulatedGame[]): Promise<Played[]> {
  const history = await readHistory()
  return Promise.all(
    games
      .filter((game) => history[game.id])
      .map(async (game) => ({
        id: game.id,
        title: game.title,
        platform: game.platform,
        lastPlayed: history[game.id],
        art: await art(game)
      }))
  )
}

const filling = new Set<string>()

/** Games already looked for in the libretro thumbnails this run, found or not. */
const libretroTried = new Set<string>()

/** A cover from the libretro thumbnails, for a game SteamGridDB gave none. */
async function fillFromLibretro(game: EmulatedGame): Promise<boolean> {
  if (!hasLibretroThumbnails(game.platform)) return false
  if (libretroTried.has(game.artKey)) return false
  libretroTried.add(game.artKey)
  if ((await cachedArt(game.artKey)).portrait) return false
  const cover = await libretroCover(game)
  if (!cover) return false
  // Loaded here, not at the top: it needs Electron, which the tests run without.
  const { webCover } = await import('./webImages')
  await savePortrait(game.artKey, await webCover(cover.url), cover.url, false)
  return true
}

/**
 * Downloads missing art in the background, a few games at a time, calling
 * `onUpdate` after each batch that saved something new. SteamGridDB first (with a
 * key); a game still without a cover then tries the libretro thumbnails. One run per `name`.
 */
export function fillEmulatedArt(name: string, key: string | undefined, load: () => Promise<EmulatedGame[]>, onUpdate: () => void): void {
  if (filling.has(name)) return
  filling.add(name)
  const report = (game: EmulatedGame) => (err: Error): boolean => {
    console.error(`steamtv: art for ${game.title}:`, err.message)
    return false
  }
  ;(async () => {
    const games = await load()
    for (let i = 0; i < games.length; i += 4) {
      const results = await Promise.all(
        games.slice(i, i + 4).map(async (game) => {
          const fromGrid = key ? await fetchArt(key, game.artKey, game.artTitle ?? game.title, game.artKinds).catch(report(game)) : false
          const fromLibretro = await fillFromLibretro(game).catch(report(game))
          return fromGrid || fromLibretro
        })
      )
      if (results.some(Boolean)) onUpdate()
    }
  })().finally(() => filling.delete(name))
}
