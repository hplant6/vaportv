import { describe, expect, it, vi } from 'vitest'
vi.mock('./claude', () => ({ claudeBin: () => null, toolEnv: () => ({}) }))
vi.mock('./helpers', () => ({ ownHelper: () => undefined }))

vi.mock('./library/art', () => ({ artUrl: (f: string) => f }))

const { groupAlbums } = await import('./musicIndex')
const { albumLine } = await import('./claudeMusic')

const song = (path: string, tags: Record<string, unknown> = {}) => ({ path, title: path, size: 1, mtime: 1, ...tags })

describe('groupAlbums', () => {
  it('joins an album artist’s album across disc folders', () => {
    const albums = groupAlbums([
      song('/m/Box/CD1/01.flac', { album: 'Box', albumArtist: 'A', artist: 'A', disc: 1, track: 1 }),
      song('/m/Box/CD2/01.flac', { album: 'Box', albumArtist: 'A', artist: 'A', disc: 2, track: 1 })
    ])
    expect(albums).toHaveLength(1)
    expect(albums[0]).toMatchObject({ title: 'Box', artist: 'A', songs: 2 })
  })
  it('keeps two same-named albums apart without an album artist', () => {
    expect(groupAlbums([song('/m/X/Hits/1.mp3', { album: 'Greatest Hits', artist: 'X' }), song('/m/Y/Hits/1.mp3', { album: 'Greatest Hits', artist: 'Y' })])).toHaveLength(2)
  })
  it('calls an album of several artists Various Artists, and names an untagged folder after itself', () => {
    const [comp, loose] = groupAlbums([
      song('/m/Comp/1.mp3', { album: 'Comp', artist: 'P' }),
      song('/m/Comp/2.mp3', { album: 'Comp', artist: 'Q' }),
      song('/m/Loose/a.mp3')
    ])
    expect(comp.artist).toBe('Various Artists')
    expect(loose.title).toBe('Loose')
  })
  it('takes the year and genre most songs give', () => {
    const [a] = groupAlbums([
      song('/m/A/1.mp3', { album: 'A', year: 1982, genre: 'City Pop' }),
      song('/m/A/2.mp3', { album: 'A', year: 1982, genre: 'City Pop' }),
      song('/m/A/3.mp3', { album: 'A', year: 1990, genre: 'Pop' })
    ])
    expect(a).toMatchObject({ year: 1982, genre: 'City Pop' })
  })
})

describe('albumLine', () => {
  it('names artist, album, year and genre for Claude', () => {
    expect(albumLine({ id: '', title: 'For You', artist: 'Tatsuro Yamashita', year: 1982, genre: 'City Pop', folder: '', added: 0, duration: 0, songs: 9 })).toBe(
      'Tatsuro Yamashita — For You (1982, City Pop)'
    )
  })
})
