import { describe, expect, it, vi } from 'vitest'
import { authHeaders, card, kindOf, playback, serverUrl } from './mediaBrowser'

const BASE = 'steamtv-media://abc123'

describe('Emby and Jellyfin', () => {
  it('tidies a server address as typed or found', () => {
    expect(serverUrl('192.168.1.38')).toBe('http://192.168.1.38:8096')
    expect(serverUrl('http://192.168.1.38:8096/emby/')).toBe('http://192.168.1.38:8096')
    expect(serverUrl('https://emby.example.com')).toBe('https://emby.example.com')
    expect(serverUrl('largebox:9000')).toBe('http://largebox:9000')
  })

  it('tells Jellyfin from Emby by its public info', () => {
    expect(kindOf({ ProductName: 'Jellyfin Server' })).toBe('jellyfin')
    expect(kindOf({})).toBe('emby')
  })

  it("signs requests each one's way", () => {
    expect(authHeaders('emby', 'dev', '1.0', 'tok')).toEqual({
      'X-Emby-Authorization': 'MediaBrowser Client="vaporTV", Device="vaporTV", DeviceId="dev", Version="1.0"',
      'X-Emby-Token': 'tok'
    })
    expect(authHeaders('jellyfin', 'dev', '1.0', 'tok')).toEqual({
      Authorization: 'MediaBrowser Client="vaporTV", Device="vaporTV", DeviceId="dev", Version="1.0", Token="tok"'
    })
  })

  it('makes an episode a card: the show, its number and name, its still, how far in', () => {
    const shown = card(
      {
        Id: 'e1',
        Name: 'Pilot',
        Type: 'Episode',
        SeriesName: 'Severance',
        SeriesId: 's1',
        ParentIndexNumber: 2,
        IndexNumber: 5,
        RunTimeTicks: 3000 * 10_000_000,
        ImageTags: { Primary: 'p' },
        SeriesPrimaryImageTag: 'sp',
        UserData: { PlaybackPositionTicks: 750 * 10_000_000 }
      },
      BASE
    )
    expect(shown.title).toBe('Severance')
    expect(shown.subtitle).toBe('S2 · E5 · Pilot')
    expect(shown.wide).toMatch(/^steamtv-media:\/\/abc123\/Items\/e1\/Images\/Primary/)
    expect(shown.wide).not.toContain('api_key')
    expect(shown.cover).toContain('/Items/s1/Images/Primary')
    expect(shown.progress).toBe(0.25)
    expect(shown.remainingMinutes).toBe(38)
  })

  it('makes a film a card: its year and poster, a backdrop when it has no thumb', () => {
    const shown = card(
      { Id: 'f1', Name: 'Heat', Type: 'Movie', ProductionYear: 1995, ImageTags: { Primary: 'p' }, BackdropImageTags: ['b'], RunTimeTicks: 100, UserData: { PlaybackPositionTicks: 50 } },
      BASE
    )
    expect(shown.subtitle).toBe('1995')
    expect(shown.wide).toContain('/Items/f1/Images/Backdrop')
    expect(shown.cover).toContain('/Items/f1/Images/Primary')
  })
})

describe('playback subtitles', () => {
  // An MKV (so always streamed by the server, repackaged), with a text subtitle (2) and a picture one (3).
  const account = { key: 'abc123', kind: 'emby' as const, url: 'http://server:8096', serverId: 's', userId: 'u', userName: 'n', token: 't' }
  const source = {
    Id: 'ms1',
    Container: 'mkv',
    SupportsDirectPlay: false,
    SupportsDirectStream: true,
    TranscodingUrl: '/emby/videos/33/master.m3u8?MediaSourceId=ms1&api_key=secret&VideoCodec=h264&TranscodeReasons=ContainerNotSupported',
    MediaStreams: [
      { Type: 'Video', Index: 0 },
      { Type: 'Audio', Index: 1, IsDefault: true },
      { Type: 'Subtitle', Index: 2, Codec: 'subrip', IsTextSubtitleStream: true },
      { Type: 'Subtitle', Index: 3, Codec: 'PGSSUB', IsTextSubtitleStream: false }
    ]
  }
  const asked: string[] = []
  const fakeFetch = vi.fn(async (url: string) => {
    asked.push(String(url))
    const body = String(url).includes('/PlaybackInfo') ? { PlaySessionId: 'ps', MediaSources: [source] } : String(url).endsWith('.vtt') ? 'WEBVTT' : { Id: '33', Name: 'Film', Type: 'Movie' }
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200 })
  })

  it('has a picture subtitle drawn into the stream, which the server left out of its address', async () => {
    vi.stubGlobal('fetch', fakeFetch)
    const p = await playback(account, BASE, '33', { subtitle: 3 }, 'dev', '1.0')
    const url = new URL(p.url)
    expect(p.hls).toBe(true)
    expect(url.searchParams.get('SubtitleStreamIndex')).toBe('3')
    expect(url.searchParams.get('SubtitleMethod')).toBe('Encode')
    expect(url.searchParams.get('AllowVideoStreamCopy')).toBe('false')
    expect(url.searchParams.get('api_key')).toBeNull()
    expect(p.subtitleUrl).toBeUndefined()
    vi.unstubAllGlobals()
  })

  it('draws nothing in for a text subtitle: it comes beside the video, and is asked for early', async () => {
    asked.length = 0
    vi.stubGlobal('fetch', fakeFetch)
    const p = await playback(account, BASE, '34', { subtitle: 2 }, 'dev', '1.0')
    const url = new URL(p.url)
    expect(url.searchParams.get('SubtitleMethod')).toBeNull()
    expect(p.subtitleUrl).toBe(`${BASE}/Videos/34/ms1/Subtitles/2/Stream.vtt`)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(asked).toContain('http://server:8096/emby/Videos/34/ms1/Subtitles/2/Stream.vtt')
    expect(asked.some((u) => u.includes('/Subtitles/3/'))).toBe(false)
    vi.unstubAllGlobals()
  })
})
