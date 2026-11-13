import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getVersion: () => '0.0.0' }, net: {}, protocol: {} }))
vi.mock('./config', () => ({ loadConfig: async () => ({}), saveConfig: async () => {} }))

const { embyCard, serverUrl } = await import('./emby')

describe('Emby', () => {
  it('tidies a server address as typed or found', () => {
    expect(serverUrl('192.168.1.38')).toBe('http://192.168.1.38:8096')
    expect(serverUrl('http://192.168.1.38:8096/emby/')).toBe('http://192.168.1.38:8096')
    expect(serverUrl('https://emby.example.com')).toBe('https://emby.example.com')
    expect(serverUrl('largebox:9000')).toBe('http://largebox:9000')
  })

  it('makes an episode a card: the show, its number and name, its still, how far in', () => {
    const card = embyCard(
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
      }
    )
    expect(card.title).toBe('Severance')
    expect(card.subtitle).toBe('S2 · E5 · Pilot')
    expect(card.wide).toMatch(/^steamtv-emby:\/\/server\/Items\/e1\/Images\/Primary/)
    expect(card.wide).not.toContain('api_key')
    expect(card.cover).toContain('/Items/s1/Images/Primary')
    expect(card.progress).toBe(0.25)
    expect(card.remainingMinutes).toBe(38)
  })

  it('makes a film a card: its year and poster, a backdrop when it has no thumb', () => {
    const card = embyCard(
      { Id: 'f1', Name: 'Heat', Type: 'Movie', ProductionYear: 1995, ImageTags: { Primary: 'p' }, BackdropImageTags: ['b'], RunTimeTicks: 100, UserData: { PlaybackPositionTicks: 50 } }
    )
    expect(card.subtitle).toBe('1995')
    expect(card.wide).toContain('/Items/f1/Images/Backdrop')
    expect(card.cover).toContain('/Items/f1/Images/Primary')
  })
})
