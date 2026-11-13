import { createSocket } from 'node:dgram'
import type { MediaChoice, MediaItem, MediaKind, MediaPlayback, MediaServer } from '../../shared/types'
import type { MediaAccount } from '../config'

// Emby and Jellyfin: one API ("MediaBrowser"), as Jellyfin began as a copy of Emby. vaporTV finds
// servers on the network (both answer a broadcast on UDP 7359), signs in as a user with their
// name and password (keeping only the access token), asks for the user's part-watched videos,
// and for one it plays, how: straight from the file when Chromium can (an MP4 or WebM in H.264,
// VP9 or AV1), otherwise as HLS the server converts as it goes. It tells the server where
// playback is, so Continue watching (and the server's own apps) pick up where it stopped.
//
// The differences: Emby's paths start /emby (Jellyfin's don't), the client and token go in
// X-Emby-Authorization / X-Emby-Token for Emby and in one Authorization header for Jellyfin, and
// each answers discovery only to its own name. Newer Jellyfin also moved two per-user paths.

const TIMEOUT_MS = 8000
/** Their ticks: 10,000,000 a second. */
const TICKS = 10_000_000

const prefix = (kind: MediaKind): string => (kind === 'emby' ? '/emby' : '')

/** Who's asking (and, signed in, as whom): the server lists vaporTV as a device under `device`. */
export function authHeaders(kind: MediaKind, device: string, version: string, token?: string): Record<string, string> {
  const client = `MediaBrowser Client="vaporTV", Device="vaporTV", DeviceId="${device}", Version="${version}"`
  if (kind === 'jellyfin') return { Authorization: token ? `${client}, Token="${token}"` : client }
  return { 'X-Emby-Authorization': client, ...(token ? { 'X-Emby-Token': token } : {}) }
}

async function request<T>(url: string, init: RequestInit & { headers: Record<string, string> }): Promise<T> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (response.status === 401) throw new Error('signed out')
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  const text = await response.text()
  return (text ? JSON.parse(text) : undefined) as T
}

/** An address as typed or found: with http://, their port (8096) if none is given, without a trailing slash or /emby. */
export function serverUrl(address: string): string {
  let url = address.trim().replace(/\/+$/, '').replace(/\/emby$/i, '')
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`
  const parsed = new URL(url)
  if (!parsed.port && parsed.protocol === 'http:') parsed.port = '8096'
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`
}

/** Which a server is, from its public info: Jellyfin names itself; Emby doesn't. */
export function kindOf(info: { ProductName?: string }): MediaKind {
  return /jellyfin/i.test(info.ProductName ?? '') ? 'jellyfin' : 'emby'
}

/** The server at an address: its kind, name and id, or an error if neither answers there. */
export async function checkServer(address: string): Promise<MediaServer> {
  const url = serverUrl(address)
  // Both answer at /System/Info/Public (Emby at /emby/… too).
  const info = await request<{ ServerName?: string; Id: string; ProductName?: string }>(`${url}/System/Info/Public`, { headers: {} })
  const kind = kindOf(info)
  return { kind, url, id: info.Id, name: info.ServerName ?? (kind === 'jellyfin' ? 'Jellyfin' : 'Emby') }
}

/** Emby and Jellyfin servers on the network: those answering within a couple of seconds, each checked for which it is. */
export function discover(waitMs = 2000): Promise<MediaServer[]> {
  return new Promise((resolve) => {
    const answers = new Map<string, string>()
    const socket = createSocket('udp4')
    const done = (): void => {
      try {
        socket.close()
      } catch {
        // Already closed.
      }
      // A server with several addresses answers on each: once per server, the first address that works.
      Promise.all([...answers.values()].map((address) => checkServer(address).catch(() => null))).then((servers) => {
        const byId = new Map<string, MediaServer>()
        for (const server of servers) if (server && !byId.has(server.id)) byId.set(server.id, server)
        resolve([...byId.values()])
      })
    }
    socket.on('error', done)
    socket.on('message', (message) => {
      try {
        const reply = JSON.parse(message.toString()) as { Address?: string; Id?: string }
        if (reply.Address && reply.Id && !answers.has(reply.Id)) answers.set(reply.Id, reply.Address)
      } catch {
        // Not one of theirs.
      }
    })
    socket.bind(() => {
      socket.setBroadcast(true)
      for (const ask of ['who is EmbyServer?', 'who is JellyfinServer?']) socket.send(ask, 7359, '255.255.255.255')
      setTimeout(done, waitMs)
    })
  })
}

/** Signs in to `server` as `user`: the account to keep (with the token, never the password). */
export async function signIn(server: MediaServer, user: string, password: string, device: string, version: string): Promise<Omit<MediaAccount, 'key'>> {
  const reply = await request<{ AccessToken: string; User: { Id: string; Name: string } }>(`${server.url}${prefix(server.kind)}/Users/AuthenticateByName`, {
    method: 'POST',
    headers: { ...authHeaders(server.kind, device, version), 'Content-Type': 'application/json' },
    body: JSON.stringify({ Username: user, Pw: password })
  })
  return { kind: server.kind, url: server.url, serverId: server.id, serverName: server.name, userId: reply.User.Id, userName: reply.User.Name, token: reply.AccessToken }
}

/** Tells the server to forget the token. */
export async function signOut(account: MediaAccount, device: string, version: string): Promise<void> {
  await request(`${account.url}${prefix(account.kind)}/Sessions/Logout`, { method: 'POST', headers: authHeaders(account.kind, device, version, account.token) })
}

/** Where a path through steamtv-media:// really goes, and how to sign the request. */
export function proxied(account: MediaAccount, pathAndQuery: string, device: string, version: string): { url: string; headers: Record<string, string> } {
  return { url: `${account.url}${prefix(account.kind)}${pathAndQuery}`, headers: authHeaders(account.kind, device, version, account.token) }
}

interface Item {
  Id: string
  Name: string
  Type: string
  SeriesName?: string
  SeriesId?: string
  ParentIndexNumber?: number
  IndexNumber?: number
  ProductionYear?: number
  RunTimeTicks?: number
  ImageTags?: Record<string, string>
  BackdropImageTags?: string[]
  SeriesPrimaryImageTag?: string
  ParentThumbItemId?: string
  ParentThumbImageTag?: string
  ParentBackdropItemId?: string
  ParentBackdropImageTags?: string[]
  DateCreated?: string
  PremiereDate?: string
  CommunityRating?: number
  UserData?: { PlaybackPositionTicks?: number; PlayedPercentage?: number; LastPlayedDate?: string; Played?: boolean; UnplayedItemCount?: number }
}

const KINDS: Record<string, MediaItem['kind']> = { Movie: 'movie', Episode: 'episode', Series: 'series' }

/**
 * What Continue watching shows of an item: its name (an episode's show, "S2 · E5 · Name"), art
 * and how far in. `base` is the account's steamtv-media:// address, for its pictures.
 */
export function card(item: Item, base: string): Omit<MediaItem, 'source'> {
  const image = (itemId: string, type: string, tag: string, width: number): string => `${base}/Items/${itemId}/Images/${type}?maxWidth=${width}&tag=${tag}&quality=90`
  const episode = item.Type === 'Episode'
  const position = item.UserData?.PlaybackPositionTicks ?? 0
  // A wide picture: the episode's own still, else the show's thumb or backdrop; a film's thumb or backdrop.
  const wide =
    (item.ImageTags?.Thumb && image(item.Id, 'Thumb', item.ImageTags.Thumb, 640)) ||
    (episode && item.ImageTags?.Primary && image(item.Id, 'Primary', item.ImageTags.Primary, 640)) ||
    (item.ParentThumbItemId && item.ParentThumbImageTag && image(item.ParentThumbItemId, 'Thumb', item.ParentThumbImageTag, 640)) ||
    (item.BackdropImageTags?.[0] && image(item.Id, 'Backdrop', item.BackdropImageTags[0], 640)) ||
    (item.ParentBackdropItemId && item.ParentBackdropImageTags?.[0] && image(item.ParentBackdropItemId, 'Backdrop', item.ParentBackdropImageTags[0], 640)) ||
    undefined
  // A poster: the film's, or the show's.
  const cover =
    (!episode && item.ImageTags?.Primary && image(item.Id, 'Primary', item.ImageTags.Primary, 400)) ||
    (episode && item.SeriesId && item.SeriesPrimaryImageTag && image(item.SeriesId, 'Primary', item.SeriesPrimaryImageTag, 480)) ||
    undefined
  const numbered = episode && item.IndexNumber !== undefined
  return {
    id: item.Id,
    title: episode ? (item.SeriesName ?? item.Name) : item.Name,
    subtitle: episode ? [numbered ? `S${item.ParentIndexNumber ?? 1} · E${item.IndexNumber}` : '', item.Name].filter(Boolean).join(' · ') : item.ProductionYear ? String(item.ProductionYear) : '',
    wide,
    cover,
    progress: item.RunTimeTicks ? Math.min(1, position / item.RunTimeTicks) : (item.UserData?.PlayedPercentage ?? 0) / 100,
    remainingMinutes: item.RunTimeTicks && position ? Math.max(1, Math.round((item.RunTimeTicks - position) / TICKS / 60)) : undefined,
    lastPlayed: item.UserData?.LastPlayedDate,
    kind: KINDS[item.Type] ?? 'video',
    watched: item.UserData?.Played || undefined,
    unwatched: item.Type === 'Series' ? item.UserData?.UnplayedItemCount : undefined,
    added: item.DateCreated,
    released: item.PremiereDate,
    rating: item.CommunityRating
  }
}

/** The user's own item paths: Jellyfin 10.9 moved them out from under /Users/<id>. */
function userItems(account: MediaAccount, rest: string): string {
  return account.kind === 'jellyfin' ? `/UserItems${rest}?userId=${account.userId}` : `/Users/${account.userId}/Items${rest}`
}
function userItem(account: MediaAccount, itemId: string): string {
  return account.kind === 'jellyfin' ? `/Items/${itemId}?userId=${account.userId}` : `/Users/${account.userId}/Items/${itemId}`
}

/** The user's part-watched films and episodes, latest first. */
export async function resume(account: MediaAccount, base: string, device: string, version: string, limit = 20): Promise<Omit<MediaItem, 'source'>[]> {
  const query = new URLSearchParams({
    Limit: String(limit),
    Recursive: 'true',
    MediaTypes: 'Video',
    Fields: 'ProductionYear,BasicSyncInfo',
    ImageTypeLimit: '1',
    EnableImageTypes: 'Primary,Backdrop,Thumb'
  })
  const path = userItems(account, '/Resume')
  const reply = await request<{ Items: Item[] }>(`${account.url}${prefix(account.kind)}${path}${path.includes('?') ? '&' : '?'}${query}`, {
    headers: authHeaders(account.kind, device, version, account.token)
  })
  return reply.Items.map((item) => card(item, base))
}

const LIST_FIELDS = {
  Fields: 'ProductionYear,DateCreated,PremiereDate,CommunityRating,BasicSyncInfo',
  ImageTypeLimit: '1',
  EnableImageTypes: 'Primary,Backdrop,Thumb'
}

/** One list's items from the server: `path` (with its own query, if any) plus `query`. */
async function list(account: MediaAccount, base: string, path: string, query: Record<string, string>, device: string, version: string): Promise<Omit<MediaItem, 'source'>[]> {
  const params = new URLSearchParams({ ...LIST_FIELDS, ...query })
  const reply = await request<{ Items: Item[] } | Item[]>(`${account.url}${prefix(account.kind)}${path}${path.includes('?') ? '&' : '?'}${params}`, {
    headers: authHeaders(account.kind, device, version, account.token)
  })
  return (Array.isArray(reply) ? reply : reply.Items).map((item) => card(item, base))
}

/** Each show's next unwatched episode, the shows watched most lately first. */
export function nextUp(account: MediaAccount, base: string, device: string, version: string, limit = 40): Promise<Omit<MediaItem, 'source'>[]> {
  return list(account, base, '/Shows/NextUp', { UserId: account.userId, Limit: String(limit) }, device, version)
}

/** The newest films and shows (a show's new episodes as the show), newest first. */
export function latest(account: MediaAccount, base: string, device: string, version: string, limit = 40): Promise<Omit<MediaItem, 'source'>[]> {
  const path = account.kind === 'jellyfin' ? `/Items/Latest?userId=${account.userId}` : `/Users/${account.userId}/Items/Latest`
  return list(account, base, path, { Limit: String(limit), IncludeItemTypes: 'Movie,Series,Episode' }, device, version)
}

/** Films, shows and episodes marked favourite, by name. */
export function favorites(account: MediaAccount, base: string, device: string, version: string, limit = 300): Promise<Omit<MediaItem, 'source'>[]> {
  const path = account.kind === 'jellyfin' ? `/Items?userId=${account.userId}` : `/Users/${account.userId}/Items`
  return list(account, base, path, { Recursive: 'true', Filters: 'IsFavorite', IncludeItemTypes: 'Movie,Series,Episode', SortBy: 'SortName', Limit: String(limit) }, device, version)
}

/**
 * What Chromium (vaporTV's player) can play as it is, and how the server should convert the
 * rest: HLS of H.264 and AAC, which hls.js plays. It picks per file, copying what already fits.
 */
const DEVICE_PROFILE = {
  Name: 'vaporTV',
  MaxStreamingBitrate: 80_000_000,
  MaxStaticBitrate: 120_000_000,
  MusicStreamingTranscodingBitrate: 192_000,
  DirectPlayProfiles: [
    { Container: 'mp4,m4v', Type: 'Video', VideoCodec: 'h264,vp9,av1', AudioCodec: 'aac,mp3,opus,flac' },
    { Container: 'webm', Type: 'Video', VideoCodec: 'vp8,vp9,av1', AudioCodec: 'vorbis,opus' }
  ],
  TranscodingProfiles: [
    { Container: 'ts', Type: 'Video', VideoCodec: 'h264', AudioCodec: 'aac', Context: 'Streaming', Protocol: 'hls', MaxAudioChannels: '2', MinSegments: '1', BreakOnNonKeyFrames: true }
  ],
  ContainerProfiles: [],
  CodecProfiles: [],
  // Text subtitles come as WebVTT beside the video (the player draws them); picture ones (Blu-ray, DVD,
  // DVB) can't be drawn by Chromium, so the server burns them into the picture.
  SubtitleProfiles: [
    ...['vtt', 'srt', 'subrip', 'ass', 'ssa', 'sub', 'smi', 'ttml', 'mov_text'].map((Format) => ({ Format, Method: 'External' })),
    ...['pgssub', 'pgs', 'dvdsub', 'vobsub', 'dvbsub', 'sup'].map((Format) => ({ Format, Method: 'Encode' }))
  ]
}

interface Stream {
  Index: number
  Type: string
  Codec?: string
  Language?: string
  DisplayTitle?: string
  Title?: string
  IsDefault?: boolean
  IsTextSubtitleStream?: boolean
}

interface Source {
  Id: string
  Container?: string
  SupportsDirectPlay?: boolean
  SupportsDirectStream?: boolean
  TranscodingUrl?: string
  MediaStreams?: Stream[]
  DefaultAudioStreamIndex?: number
  DefaultSubtitleStreamIndex?: number
}

/** A track as the Audio & subtitles menu lists it: the server's own name for it ("English · 5.1 DTS"). */
function trackName(stream: Stream, fallback: string): string {
  return stream.DisplayTitle || [stream.Title, stream.Language].filter(Boolean).join(' · ') || fallback
}

/**
 * How to play `itemId`: the address, whether it's HLS, where to start, and its audio and
 * subtitle tracks. `choice` picks a track (subtitle -1: none); unset, the server's defaults
 * (the user's language preferences). Another audio track than the file's own default can't be
 * switched to in Chromium, so the server sends the video again with it (converting, or just
 * repackaging); a picture subtitle is burned in the same way. A text subtitle comes beside it.
 */
export async function playback(
  account: MediaAccount,
  base: string,
  itemId: string,
  choice: MediaChoice,
  device: string,
  version: string
): Promise<Omit<MediaPlayback, 'source'>> {
  const root = `${account.url}${prefix(account.kind)}`
  const headers = authHeaders(account.kind, device, version, account.token)
  const item = await request<Item>(`${root}${userItem(account, itemId)}`, { headers })
  const ask = async (extra: Record<string, unknown>): Promise<{ PlaySessionId: string; MediaSources: Source[] }> => {
    const query = new URLSearchParams({ UserId: account.userId, IsPlayback: 'true', AutoOpenLiveStream: 'true', MaxStreamingBitrate: String(DEVICE_PROFILE.MaxStreamingBitrate) })
    if (choice.audio !== undefined) query.set('AudioStreamIndex', String(choice.audio))
    if (choice.subtitle !== undefined) query.set('SubtitleStreamIndex', String(choice.subtitle))
    return request(`${root}/Items/${itemId}/PlaybackInfo?${query}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ DeviceProfile: DEVICE_PROFILE, ...extra })
    })
  }
  let info = await ask({})
  let source = info.MediaSources[0]
  if (!source) throw new Error('The server has nothing to play for this')
  const streams = source.MediaStreams ?? []
  const audio = choice.audio ?? source.DefaultAudioStreamIndex ?? streams.find((s) => s.Type === 'Audio' && s.IsDefault)?.Index
  const subtitle = choice.subtitle ?? source.DefaultSubtitleStreamIndex ?? -1
  const chosenSubtitle = streams.find((s) => s.Type === 'Subtitle' && s.Index === subtitle)
  const burned = !!chosenSubtitle && !chosenSubtitle.IsTextSubtitleStream
  // Straight from the file plays its default audio and no burned-in subtitle: for anything else, the server's stream.
  const fileAudio = streams.find((s) => s.Type === 'Audio' && s.IsDefault)?.Index ?? streams.find((s) => s.Type === 'Audio')?.Index
  if (source.SupportsDirectPlay && ((audio !== undefined && audio !== fileAudio) || burned)) {
    info = await ask({ EnableDirectPlay: false, EnableDirectStream: false })
    source = info.MediaSources[0] ?? source
  }
  const shown = card(item, base)
  const common = {
    itemId,
    mediaSourceId: source.Id,
    playSessionId: info.PlaySessionId,
    title: shown.title,
    subtitle: shown.subtitle,
    backdrop: shown.wide,
    startSeconds: (item.UserData?.PlaybackPositionTicks ?? 0) / TICKS,
    durationSeconds: item.RunTimeTicks ? item.RunTimeTicks / TICKS : undefined,
    audioTracks: streams.filter((s) => s.Type === 'Audio').map((s, i) => ({ index: s.Index, name: trackName(s, `Track ${i + 1}`) })),
    subtitleTracks: streams.filter((s) => s.Type === 'Subtitle').map((s, i) => ({ index: s.Index, name: trackName(s, `Subtitles ${i + 1}`) })),
    audio,
    subtitleIndex: chosenSubtitle ? subtitle : -1,
    // A text subtitle, as WebVTT, for the player to draw.
    subtitleUrl: chosenSubtitle && !burned ? `${base}/Videos/${itemId}/${source.Id}/Subtitles/${subtitle}/Stream.vtt` : undefined
  }
  if (source.SupportsDirectPlay || (source.SupportsDirectStream && !source.TranscodingUrl)) {
    const query = new URLSearchParams({ Static: 'true', MediaSourceId: source.Id, PlaySessionId: info.PlaySessionId })
    return { ...common, url: `${base}/Videos/${itemId}/stream.${source.Container ?? 'mp4'}?${query}`, hls: false, method: 'DirectPlay' }
  }
  if (!source.TranscodingUrl) throw new Error("The server can't convert this for vaporTV")
  // The player seeks to the start itself, so the stream begins at 0 and can go back before it.
  // The token comes from the proxy, not the address.
  const url = new URL(`${base}${source.TranscodingUrl.replace(/^\/emby(?=\/)/i, '')}`)
  for (const param of ['StartTimeTicks', 'api_key', 'ApiKey']) url.searchParams.delete(param)
  return { ...common, url: url.toString(), hls: true, method: 'Transcode' }
}

/** Tells the server where playback is (started, every few seconds, stopped), so it can resume there. */
export async function report(
  account: MediaAccount,
  event: 'start' | 'progress' | 'stop',
  play: Pick<MediaPlayback, 'itemId' | 'mediaSourceId' | 'playSessionId' | 'method'>,
  positionSeconds: number,
  paused: boolean,
  device: string,
  version: string
): Promise<void> {
  const root = `${account.url}${prefix(account.kind)}`
  const path = { start: 'Sessions/Playing', progress: 'Sessions/Playing/Progress', stop: 'Sessions/Playing/Stopped' }[event]
  const body = {
    ItemId: play.itemId,
    MediaSourceId: play.mediaSourceId,
    PlaySessionId: play.playSessionId,
    PlayMethod: play.method,
    PositionTicks: Math.round(positionSeconds * TICKS),
    IsPaused: paused,
    CanSeek: true,
    ...(event === 'progress' ? { EventName: 'timeupdate' } : {})
  }
  const headers = authHeaders(account.kind, device, version, account.token)
  await request(`${root}/${path}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  // Stopped: the conversion it was running for this can stop too.
  if (event === 'stop' && play.method === 'Transcode') {
    await request(`${root}/Videos/ActiveEncodings?DeviceId=${device}&PlaySessionId=${play.playSessionId}`, { method: 'DELETE', headers }).catch(() => {})
  }
}
