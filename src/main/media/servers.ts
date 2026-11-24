import { createHash, randomUUID } from 'node:crypto'
import { app, net, protocol } from 'electron'
import { loadConfig, saveConfig, type Config, type MediaAccount } from '../config'
import type { MediaCoverChoice, MusicTags, MediaAccountInfo, MediaChoice, MediaItem, MediaLibrary, MediaLists, MediaPage, MediaPlayback, MediaServer, MediaShow, MediaSort } from '../../shared/types'
import * as mediaBrowser from './mediaBrowser'
import { previewOf, webCover } from '../library/webImages'
import { playInMpv, type PlayerHooks } from './externalPlayer'
import { loadTrackMemory, recall, remember, saveTrackMemory } from './trackMemory'
import { mediaKey, parseMediaKey } from '../../shared/mediaKey'

// Media servers for Home's Continue watching: every server signed in to (Emby and Jellyfin
// today, through mediaBrowser.ts; Plex would be another module beside it), their part-watched
// films and episodes merged into one row, newest first, and each played from its own server.
// A server that's off or refuses just drops out of the row; the others still show.
//
// The page reaches them (pictures, video, subtitles) through steamtv-media://<account>/<path>:
// the account's real address and its token are added here, so the token never sits in the
// page and its content policy needn't allow the network at large.

const SCHEME = 'steamtv-media'

/** For registerArtScheme (before app ready): streamable for the video, fetchable for hls.js. */
export const MEDIA_SCHEME: Electron.CustomScheme = {
  scheme: SCHEME,
  privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true }
}

const base = (account: MediaAccount): string => `${SCHEME}://${account.key}`

/** A short, address-safe name for an account: the same server and user always get the same one. */
export function accountKey(kind: string, serverId: string, userId: string): string {
  return createHash('sha1').update(`${kind}/${serverId}/${userId}`).digest('hex').slice(0, 12)
}

/**
 * The accounts signed in to. One signed in before servers could be several (`emby`) comes
 * across as the first; saved that way from then on.
 */
export async function accounts(config?: Config): Promise<MediaAccount[]> {
  const c = config ?? (await loadConfig())
  if (c.mediaServers) return c.mediaServers
  if (!c.emby) return []
  const { emby } = c
  const migrated: MediaAccount[] = [
    { key: accountKey('emby', emby.url, emby.userId), kind: 'emby', url: emby.url, serverId: emby.url, serverName: emby.serverName, userId: emby.userId, userName: emby.userName, token: emby.token }
  ]
  await saveConfig({ mediaServers: migrated, emby: undefined, ...(c.embyDeviceId && !c.mediaDeviceId ? { mediaDeviceId: c.embyDeviceId } : {}) })
  return migrated
}

/** vaporTV's id as a device on the servers, made the first time it's needed (Emby's from before, kept). */
async function device(): Promise<string> {
  const config = await loadConfig()
  const id = config.mediaDeviceId ?? config.embyDeviceId
  if (id) return id
  const made = randomUUID()
  await saveConfig({ mediaDeviceId: made })
  return made
}

const version = (): string => app.getVersion()

function info(account: MediaAccount): MediaAccountInfo {
  return { key: account.key, kind: account.kind, serverName: account.serverName ?? account.url, userName: account.userName, url: account.url }
}

export async function listAccounts(): Promise<MediaAccountInfo[]> {
  return (await accounts()).map(info)
}

export const discover = (): Promise<MediaServer[]> => mediaBrowser.discover()
export const checkServer = (address: string): Promise<MediaServer> => mediaBrowser.checkServer(address)

/** Signs in to `server` as `user`: added to the accounts, or replacing that user's sign-in there. */
export async function signIn(server: MediaServer, user: string, password: string): Promise<MediaAccountInfo[]> {
  const signed = await mediaBrowser.signIn(server, user, password, await device(), version())
  const account: MediaAccount = { ...signed, key: accountKey(signed.kind, signed.serverId, signed.userId) }
  const others = (await accounts()).filter((a) => a.key !== account.key)
  await saveConfig({ mediaServers: [...others, account] })
  return listAccounts()
}

export async function signOut(key: string): Promise<MediaAccountInfo[]> {
  const all = await accounts()
  const account = all.find((a) => a.key === key)
  // Tells the server to forget the token too; signed out here either way.
  if (account) await mediaBrowser.signOut(account, await device(), version()).catch(() => {})
  await saveConfig({ mediaServers: all.filter((a) => a.key !== key) })
  return listAccounts()
}

async function account(key: string): Promise<MediaAccount> {
  const found = (await accounts()).find((a) => a.key === key)
  if (!found) throw new Error('Not signed in to that server any more')
  return found
}

/** Newest first; one with no date (never reported) after those that have one. */
export function merged(lists: MediaItem[][]): MediaItem[] {
  return lists.flat().sort((a, b) => (b.lastPlayed ?? '').localeCompare(a.lastPlayed ?? ''))
}

/** Continue watching from every server, merged. Throws only if every one signed in to failed. */
export async function resume(limit = 20): Promise<MediaItem[]> {
  const all = await accounts()
  const id = await device()
  const results = await Promise.allSettled(
    all.map(async (a) => (await mediaBrowser.resume(a, base(a), id, version(), limit)).map((item) => ({ ...item, source: a.key })))
  )
  const got = results.filter((r): r is PromiseFulfilledResult<MediaItem[]> => r.status === 'fulfilled').map((r) => r.value)
  if (all.length && !got.length) throw (results[0] as PromiseRejectedResult).reason
  return merged(got).slice(0, limit)
}

/** Each server's part of a list (marked with its account), those that failed left out. */
async function fromEvery(get: (a: MediaAccount, base: string, device: string, version: string) => Promise<Omit<MediaItem, 'source'>[]>): Promise<MediaItem[][]> {
  const all = await accounts()
  const id = await device()
  const results = await Promise.allSettled(all.map(async (a) => (await get(a, base(a), id, version())).map((item) => ({ ...item, source: a.key }))))
  return results.filter((r): r is PromiseFulfilledResult<MediaItem[]> => r.status === 'fulfilled').map((r) => r.value)
}

const newestFirst = (key: 'lastPlayed' | 'added') => (a: MediaItem, b: MediaItem): number => (b[key] ?? '').localeCompare(a[key] ?? '')

/** The Media tab's top lists, every server's merged: what's watched most lately or newest first, Favorites by name. */
export async function lists(): Promise<MediaLists> {
  const [continueWatching, nextUp, recentlyAdded, favorites] = await Promise.all([
    fromEvery((a, b, d, v) => mediaBrowser.resume(a, b, d, v, 40)),
    fromEvery(mediaBrowser.nextUp),
    fromEvery(mediaBrowser.latest),
    fromEvery(mediaBrowser.favorites)
  ])
  return {
    continueWatching: merged(continueWatching),
    // Each server already orders its own by the shows watched most lately.
    nextUp: nextUp.flat(),
    recentlyAdded: recentlyAdded.flat().sort(newestFirst('added')),
    favorites: favorites.flat().sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }))
  }
}

/**
 * Every server's libraries, each server's in its own order, servers in the order signed in to.
 * With more than one server, each name says which it's on ("Movies · LargeBox").
 */
export async function libraries(): Promise<MediaLibrary[]> {
  const all = await accounts()
  const id = await device()
  const results = await Promise.allSettled(all.map((a) => mediaBrowser.libraries(a, id, version())))
  const several = all.length > 1
  return results.flatMap((r, i) =>
    r.status === 'fulfilled'
      ? r.value.map((lib) => ({ source: all.at(i)!.key, id: lib.id, type: lib.type, name: several ? `${lib.name} · ${all.at(i)!.serverName ?? 'server'}` : lib.name }))
      : []
  )
}

/** A page of one library, from its own server. */
export async function libraryPage(library: Pick<MediaLibrary, 'source' | 'id' | 'type'>, sort: MediaSort, unwatched: boolean, start: number, limit: number): Promise<MediaPage> {
  const a = await account(library.source)
  // Its type picks what the grid lists (films, or shows rather than every episode).
  const page = await mediaBrowser.libraryPage(a, base(a), library, sort, unwatched, start, limit, await device(), version())
  return { items: page.items.map((item) => ({ ...item, source: library.source })), total: page.total }
}

/**
 * The posters its server's metadata sources have for an item, each with a preview the page can
 * show (their sites are outside what it may load). A preview that can't be had leaves its poster out.
 */
export async function coverChoices(source: string, id: string): Promise<MediaCoverChoice[]> {
  const a = await account(source)
  const found = (await mediaBrowser.remoteCovers(a, id, await device(), version())).slice(0, 30)
  const shown = await Promise.all(
    found.map((c): Promise<MediaCoverChoice | null> =>
      previewOf(c.thumb).then(
        (preview) => ({ url: c.url, thumb: preview, provider: c.provider, width: c.width, height: c.height }),
        () => null
      )
    )
  )
  return shown.filter((c) => c !== null)
}

/**
 * Makes a picture an item's poster on its server: one of coverChoices' (`provider`: the server
 * fetches it), or any picture from the web (cropped to a poster here and sent up).
 */
export async function setCover(source: string, id: string, pick: { url: string; thumb?: string; provider?: string }): Promise<void> {
  const a = await account(source)
  if (pick.provider) return mediaBrowser.chooseRemoteCover(a, id, { url: pick.url, provider: pick.provider }, await device(), version())
  // Some sites refuse to hand pictures to anything but their own pages: the search's preview will do.
  const png = await webCover(pick.url).catch((err) => (pick.thumb && pick.thumb !== pick.url ? webCover(pick.thumb) : Promise.reject(err)))
  await mediaBrowser.uploadCover(a, id, png, await device(), version())
}

/** A show's page, from its own server. */
export async function show(source: string, seriesId: string): Promise<MediaShow> {
  const a = await account(source)
  const page = await mediaBrowser.show(a, base(a), seriesId, await device(), version())
  return { ...page, source, next: page.next && { ...page.next, source } }
}

/**
 * Playlists' films, shows and episodes (media:<account>:<item>), by that key: each server asked
 * once for its own. One that's off, or an item it no longer has, is just missing.
 */
export async function byKeys(keys: string[]): Promise<Map<string, MediaItem>> {
  const bySource = new Map<string, string[]>()
  for (const key of keys) {
    const at = parseMediaKey(key)
    if (at) bySource.set(at.source, [...(bySource.get(at.source) ?? []), at.id])
  }
  const all = await accounts()
  const id = await device()
  const found = new Map<string, MediaItem>()
  await Promise.all(
    [...bySource].map(async ([source, ids]) => {
      const a = all.find((x) => x.key === source)
      if (!a) return
      const items = await mediaBrowser.byIds(a, base(a), ids, id, version()).catch(() => [])
      for (const item of items) found.set(mediaKey(source, item.id), { ...item, source })
    })
  )
  return found
}

export async function details(source: string, id: string): Promise<MediaItem> {
  const a = await account(source)
  return { ...(await mediaBrowser.details(a, base(a), id, await device(), version())), source }
}

export async function setFavorite(source: string, id: string, on: boolean): Promise<boolean> {
  return mediaBrowser.setFavorite(await account(source), id, on, await device(), version())
}

export async function setWatched(source: string, id: string, on: boolean): Promise<void> {
  await mediaBrowser.setWatched(await account(source), id, on, await device(), version())
}

export async function episodes(source: string, seriesId: string, seasonId: string): Promise<MediaItem[]> {
  const a = await account(source)
  return (await mediaBrowser.episodes(a, base(a), seriesId, seasonId, await device(), version())).map((item) => ({ ...item, source }))
}

export async function playback(source: string, itemId: string, choice: MediaChoice = {}, codecs: string[] = []): Promise<MediaPlayback> {
  const a = await account(source)
  return { ...(await mediaBrowser.playback(a, base(a), itemId, choice, await device(), version(), codecs)), source }
}

/**
 * Plays it in mpv, reporting to the server as it goes. Resolves true when it played and was closed,
 * false when mpv couldn't be run (the page's own player is then used).
 */
export async function playExternal(
  source: string,
  itemId: string,
  fromStart: boolean,
  hooks: Pick<PlayerHooks, 'controls' | 'combos' | 'log'>
): Promise<boolean> {
  const a = await account(source)
  const dev = await device()
  const info = await mediaBrowser.nativePlayback(a, base(a), itemId, dev, version())
  // The audio and subtitles picked last time (for this film, or this show), over the server's picks.
  const memoryKey = `${source}:${info.seriesId ?? itemId}`
  let memory = await loadTrackMemory()
  const recalled = recall(memory, memoryKey, info.audioStreams, info.subtitleStreams)
  if (recalled.audio !== undefined || recalled.subtitle !== undefined) hooks.log(`player: remembered tracks: audio ${recalled.audio ?? '-'}, subtitles ${recalled.subtitle ?? '-'}`)
  const onTracks = (audio: number | undefined, subtitle: number | undefined): void => {
    memory = remember(memory, memoryKey, info.audioStreams, info.subtitleStreams, audio, subtitle, Date.now())
    saveTrackMemory(memory).catch((err) => hooks.log(`player: couldn't save the tracks picked: ${err}`))
  }
  const send = (event: 'start' | 'progress' | 'stop', at: number, paused: boolean): void => {
    mediaBrowser.report(a, event, info, at, paused, dev, version()).catch((err) => hooks.log(`player: media report ${event} failed: ${err}`))
  }
  const stoppedAt = await playInMpv(
    {
      title: info.title,
      subtitle: info.subtitle,
      url: info.url,
      startSeconds: fromStart ? 0 : info.startSeconds,
      durationSeconds: info.durationSeconds,
      audioStreams: info.audioStreams,
      subtitleStreams: info.subtitleStreams,
      audio: recalled.audio ?? info.audio,
      subtitleTrack: recalled.subtitle ?? info.subtitleIndex
    },
    { ...hooks, onPosition: send, onTracks }
  )
  return stoppedAt !== null
}

export async function report(event: 'start' | 'progress' | 'stop', play: MediaPlayback, positionSeconds: number, paused: boolean): Promise<void> {
  const a = await account(play.source)
  await mediaBrowser.report(a, event, play, positionSeconds, paused, await device(), version())
}

/** Call after app ready. Byte ranges go through, so the video can seek. */
export function handleMediaScheme(): void {
  protocol.handle(SCHEME, async (request) => {
    const from = new URL(request.url)
    const a = (await accounts()).find((x) => x.key === from.host)
    if (!a) return new Response('not signed in', { status: 404 })
    const { url, headers } = mediaBrowser.proxied(a, `${from.pathname}${from.search}`, await device(), version())
    const range = request.headers.get('range')
    const reply = await net.fetch(url, { method: request.method, headers: { ...headers, ...(range ? { Range: range } : {}) } })
    // The Music player reads songs through Web Audio (its visualizer), which needs the page allowed to.
    const allowed = new Headers(reply.headers)
    allowed.set('Access-Control-Allow-Origin', '*')
    return new Response(reply.body, { status: reply.status, statusText: reply.statusText, headers: allowed })
  })
}

/** Each signed-in server's music (its music libraries' songs), for the Music tab's library; a server that fails gives none. */
export async function musicFromServers(): Promise<{ key: string; name: string; ok: boolean; libraries: number; songs: MusicTags[] }[]> {
  const all = await accounts()
  const id = await device()
  return Promise.all(
    all.map(async (a) => {
      const got = await mediaBrowser.musicSongs(a, base(a), id, version()).then(
        (r) => ({ ...r, ok: true }),
        () => ({ songs: [] as MusicTags[], libraries: 0, ok: false })
      )
      return { key: a.key, name: a.serverName ?? a.url, ok: got.ok, libraries: got.libraries, songs: got.songs }
    })
  )
}
