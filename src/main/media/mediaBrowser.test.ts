import { describe, expect, it } from 'vitest'
import { authHeaders, card, kindOf, serverUrl } from './mediaBrowser'

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
