import { createSocket } from 'node:dgram'
import { randomUUID } from 'node:crypto'
import { app, net, protocol } from 'electron'
import { loadConfig, saveConfig, type Config } from './config'
import type { EmbyItem, EmbyPlayback, EmbyServer, EmbyStatus } from '../shared/types'

// Emby: the Continue watching row on Home, and playing what's in it. vaporTV finds the server
// on the network (Emby answers a broadcast on UDP 7359), signs in as a user with their name
// and password (keeping only the access token it's given), asks for the user's part-watched
// videos, and for each one it plays, how to play it: straight from the file when Chromium can
// (an MP4 or WebM in H.264, VP9 or AV1), otherwise as HLS that Emby converts as it goes. It
// tells Emby where playback is, so the row (and Emby's own apps) pick up where it stopped.

const TIMEOUT_MS = 8000

/**
 * The page reaches Emby (pictures, the video) through this scheme: steamtv-emby://server/<path>
 * is the signed-in server's /emby/<path>, the access token added here, so it never sits in the
 * page and the page's content policy needn't allow the network at large.
 */
const SCHEME = 'steamtv-emby'
const BASE = `${SCHEME}://server`

/** For registerArtScheme (before app ready): streamable for the video, fetchable for hls.js. */
export const EMBY_SCHEME: Electron.CustomScheme = {
  scheme: SCHEME,
  privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true }
}

/** Call after app ready. Byte ranges go through, so the video can seek. */
export function handleEmbyScheme(): void {
  protocol.handle(SCHEME, async (request) => {
    const { emby } = await loadConfig()
    if (!emby) return new Response('not signed in', { status: 404 })
    const from = new URL(request.url)
    const target = new URL(`${emby.url}/emby${from.pathname}${from.search}`)
    target.searchParams.set('api_key', emby.token)
    const range = request.headers.get('range')
    return net.fetch(target.toString(), { method: request.method, headers: range ? { Range: range } : {} })
  })
}
/** Emby's ticks: 10,000,000 a second. */
const TICKS = 10_000_000

/** Who's asking, on every request: Emby lists vaporTV as a device under this id. */
async function authHeader(config: Config, token?: string): Promise<Record<string, string>> {
  let device = config.embyDeviceId
  if (!device) {
    device = randomUUID()
    await saveConfig({ embyDeviceId: device })
  }
  return {
    'X-Emby-Authorization': `MediaBrowser Client="vaporTV", Device="vaporTV", DeviceId="${device}", Version="${app.getVersion()}"`,
    ...(token ? { 'X-Emby-Token': token } : {})
  }
}

async function request<T>(url: string, init: RequestInit & { headers: Record<string, string> }): Promise<T> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (response.status === 401) throw new Error('signed out')
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  const text = await response.text()
  return (text ? JSON.parse(text) : undefined) as T
}

/** An address as typed or found: with http://, Emby's port (8096) if none is given, without a trailing slash or /emby. */
export function serverUrl(address: string): string {
  let url = address.trim().replace(/\/+$/, '').replace(/\/emby$/i, '')
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`
  const parsed = new URL(url)
  if (!parsed.port && parsed.protocol === 'http:') parsed.port = '8096'
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`
}

/** Emby servers on the network: the ones that answer "who is EmbyServer?" within a couple of seconds. */
export function discoverEmby(waitMs = 2000): Promise<EmbyServer[]> {
  return new Promise((resolve) => {
    const found = new Map<string, EmbyServer>()
    const socket = createSocket('udp4')
    const done = (): void => {
      try {
        socket.close()
      } catch {
        // Already closed.
      }
      resolve([...found.values()])
    }
    socket.on('error', done)
    socket.on('message', (message) => {
      try {
        const reply = JSON.parse(message.toString()) as { Address?: string; Id?: string; Name?: string }
        if (reply.Address && reply.Id) found.set(reply.Id, { url: serverUrl(reply.Address), id: reply.Id, name: reply.Name ?? 'Emby' })
      } catch {
        // Not Emby's.
      }
    })
    socket.bind(() => {
      socket.setBroadcast(true)
      socket.send('who is EmbyServer?', 7359, '255.255.255.255')
      setTimeout(done, waitMs)
    })
  })
}

/** The server at an address typed in: its name and id, or an error if nothing Emby answers there. */
export async function checkEmbyServer(address: string): Promise<EmbyServer> {
  const url = serverUrl(address)
  const info = await request<{ ServerName?: string; Id: string }>(`${url}/emby/System/Info/Public`, { headers: {} })
  return { url, id: info.Id, name: info.ServerName ?? 'Emby' }
}

/** Signs in to `server` as `user`; keeps the token (never the password). */
export async function embySignIn(server: EmbyServer, user: string, password: string): Promise<EmbyStatus> {
  const config = await loadConfig()
  const reply = await request<{ AccessToken: string; User: { Id: string; Name: string } }>(`${server.url}/emby/Users/AuthenticateByName`, {
    method: 'POST',
    headers: { ...(await authHeader(config)), 'Content-Type': 'application/json' },
    body: JSON.stringify({ Username: user, Pw: password })
  })
  await saveConfig({ emby: { url: server.url, serverName: server.name, userId: reply.User.Id, userName: reply.User.Name, token: reply.AccessToken } })
  return embyStatus()
}

export async function embySignOut(): Promise<void> {
  const config = await loadConfig()
  if (config.emby) {
    // Tells Emby to forget the token too; signed out here either way.
    await request(`${config.emby.url}/emby/Sessions/Logout`, { method: 'POST', headers: await authHeader(config, config.emby.token) }).catch(() => {})
  }
  await saveConfig({ emby: undefined })
}

export async function embyStatus(): Promise<EmbyStatus> {
  const { emby } = await loadConfig()
  return emby ? { signedIn: true, serverName: emby.serverName, userName: emby.userName, url: emby.url } : { signedIn: false }
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
  UserData?: { PlaybackPositionTicks?: number; PlayedPercentage?: number; LastPlayedDate?: string }
}

/** An image of an item, as wide as `width`, for the card (through the scheme). */
function image(itemId: string, type: string, tag: string, width: number): string {
  return `${BASE}/Items/${itemId}/Images/${type}?maxWidth=${width}&tag=${tag}&quality=90`
}

/** What Continue watching shows of an item: its name (an episode's show, "S2 · E5 · Name"), art and how far in. */
export function embyCard(item: Item): EmbyItem {
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
    (!episode && item.ImageTags?.Primary && image(item.Id, 'Primary', item.ImageTags.Primary, 480)) ||
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
    remainingMinutes: item.RunTimeTicks ? Math.max(1, Math.round((item.RunTimeTicks - position) / TICKS / 60)) : undefined,
    lastPlayed: item.UserData?.LastPlayedDate
  }
}

/** The signed-in user's part-watched films and episodes, latest first. Empty when signed out or the server's away. */
export async function embyResume(limit = 20): Promise<EmbyItem[]> {
  const config = await loadConfig()
  const emby = config.emby
  if (!emby) return []
  const query = new URLSearchParams({
    Limit: String(limit),
    Recursive: 'true',
    MediaTypes: 'Video',
    Fields: 'ProductionYear,BasicSyncInfo',
    ImageTypeLimit: '1',
    EnableImageTypes: 'Primary,Backdrop,Thumb'
  })
  const reply = await request<{ Items: Item[] }>(`${emby.url}/emby/Users/${emby.userId}/Items/Resume?${query}`, {
    headers: await authHeader(config, emby.token)
  })
  return reply.Items.map((item) => embyCard(item))
}

/**
 * What Chromium (vaporTV's player) can play as it is, and how Emby should convert the rest:
 * HLS of H.264 and AAC, which hls.js plays. Emby picks per file, copying what already fits.
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
  // DVB) can't be drawn by Chromium, so Emby burns them into the picture.
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
  Channels?: number
  IsDefault?: boolean
  IsForced?: boolean
  IsTextSubtitleStream?: boolean
  DeliveryMethod?: string
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

/** A track as the Audio & subtitles menu lists it: Emby's own name for it ("English · 5.1 DTS", "Spanish (Forced)"). */
function trackName(stream: Stream, fallback: string): string {
  return stream.DisplayTitle || [stream.Title, stream.Language].filter(Boolean).join(' · ') || fallback
}

/**
 * How to play `itemId`: the address, whether it's HLS, where to start, and its audio and
 * subtitle tracks. `choice` picks a track (subtitle -1: none); unset, Emby's defaults (the
 * user's language preferences). Another audio track than the file's own default can't be
 * switched to in Chromium, so Emby sends the video again with it (converting, or just
 * repackaging); a picture subtitle is burned in the same way. A text subtitle comes beside it.
 */
export async function embyPlayback(itemId: string, choice: { audio?: number; subtitle?: number } = {}): Promise<EmbyPlayback> {
  const config = await loadConfig()
  const emby = config.emby
  if (!emby) throw new Error('Not signed in to Emby')
  const headers = await authHeader(config, emby.token)
  const item = await request<Item>(`${emby.url}/emby/Users/${emby.userId}/Items/${itemId}`, { headers })
  const ask = async (extra: Record<string, unknown>): Promise<{ PlaySessionId: string; MediaSources: Source[] }> => {
    const query = new URLSearchParams({ UserId: emby.userId, IsPlayback: 'true', AutoOpenLiveStream: 'true', MaxStreamingBitrate: String(DEVICE_PROFILE.MaxStreamingBitrate) })
    if (choice.audio !== undefined) query.set('AudioStreamIndex', String(choice.audio))
    if (choice.subtitle !== undefined) query.set('SubtitleStreamIndex', String(choice.subtitle))
    return request(`${emby.url}/emby/Items/${itemId}/PlaybackInfo?${query}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ DeviceProfile: DEVICE_PROFILE, ...extra })
    })
  }
  let info = await ask({})
  let source = info.MediaSources[0]
  if (!source) throw new Error('Emby has nothing to play for this')
  const streams = source.MediaStreams ?? []
  const audio = choice.audio ?? source.DefaultAudioStreamIndex ?? streams.find((s) => s.Type === 'Audio' && s.IsDefault)?.Index
  const subtitle = choice.subtitle ?? source.DefaultSubtitleStreamIndex ?? -1
  const chosenSubtitle = streams.find((s) => s.Type === 'Subtitle' && s.Index === subtitle)
  const burned = !!chosenSubtitle && !chosenSubtitle.IsTextSubtitleStream
  // Straight from the file plays its default audio and no burned-in subtitle: for anything else, Emby's stream.
  const fileAudio = streams.find((s) => s.Type === 'Audio' && s.IsDefault)?.Index ?? streams.find((s) => s.Type === 'Audio')?.Index
  if (source.SupportsDirectPlay && ((audio !== undefined && audio !== fileAudio) || burned)) {
    info = await ask({ EnableDirectPlay: false, EnableDirectStream: false })
    source = info.MediaSources[0] ?? source
  }
  const card = embyCard(item)
  const common = {
    itemId,
    mediaSourceId: source.Id,
    playSessionId: info.PlaySessionId,
    title: card.title,
    subtitle: card.subtitle,
    backdrop: card.wide,
    startSeconds: (item.UserData?.PlaybackPositionTicks ?? 0) / TICKS,
    durationSeconds: item.RunTimeTicks ? item.RunTimeTicks / TICKS : undefined,
    audioTracks: streams.filter((s) => s.Type === 'Audio').map((s, i) => ({ index: s.Index, name: trackName(s, `Track ${i + 1}`) })),
    subtitleTracks: streams.filter((s) => s.Type === 'Subtitle').map((s, i) => ({ index: s.Index, name: trackName(s, `Subtitles ${i + 1}`) })),
    audio,
    subtitleIndex: chosenSubtitle ? subtitle : -1,
    // A text subtitle, as WebVTT, for the player to draw.
    subtitleUrl: chosenSubtitle && !burned ? `${BASE}/Videos/${itemId}/${source.Id}/Subtitles/${subtitle}/Stream.vtt` : undefined
  }
  if (source.SupportsDirectPlay || (source.SupportsDirectStream && !source.TranscodingUrl)) {
    const query = new URLSearchParams({ Static: 'true', MediaSourceId: source.Id, PlaySessionId: info.PlaySessionId })
    return { ...common, url: `${BASE}/Videos/${itemId}/stream.${source.Container ?? 'mp4'}?${query}`, hls: false, method: 'DirectPlay' }
  }
  if (!source.TranscodingUrl) throw new Error("Emby can't convert this for vaporTV")
  // The player seeks to the start itself, so the stream begins at 0 and can go back before it.
  const url = new URL(`${BASE}${source.TranscodingUrl.replace(/^\/emby(?=\/)/i, '')}`)
  url.searchParams.delete('StartTimeTicks')
  url.searchParams.delete('api_key')
  return { ...common, url: url.toString(), hls: true, method: 'Transcode' }
}

/** Tells Emby where playback is (started, every few seconds, stopped), so it can resume there. */
export async function embyReport(
  event: 'start' | 'progress' | 'stop',
  playback: Pick<EmbyPlayback, 'itemId' | 'mediaSourceId' | 'playSessionId' | 'method'>,
  positionSeconds: number,
  paused = false
): Promise<void> {
  const config = await loadConfig()
  const emby = config.emby
  if (!emby) return
  const path = { start: 'Sessions/Playing', progress: 'Sessions/Playing/Progress', stop: 'Sessions/Playing/Stopped' }[event]
  const body = {
    ItemId: playback.itemId,
    MediaSourceId: playback.mediaSourceId,
    PlaySessionId: playback.playSessionId,
    PlayMethod: playback.method,
    PositionTicks: Math.round(positionSeconds * TICKS),
    IsPaused: paused,
    CanSeek: true,
    ...(event === 'progress' ? { EventName: 'timeupdate' } : {})
  }
  const headers = await authHeader(config, emby.token)
  await request(`${emby.url}/emby/${path}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  // Stopped: the conversion it was running for this can stop too.
  if (event === 'stop' && playback.method === 'Transcode') {
    await request(`${emby.url}/emby/Videos/ActiveEncodings?DeviceId=${config.embyDeviceId}&PlaySessionId=${playback.playSessionId}`, { method: 'DELETE', headers }).catch(() => {})
  }
}
