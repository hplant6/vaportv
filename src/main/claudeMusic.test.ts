import type { MusicAlbum } from '../shared/types'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./claude', () => ({ claudeBin: () => null, toolEnv: () => ({}) }))
vi.mock('./helpers', () => ({ ownHelper: () => undefined }))
vi.mock('./library/art', () => ({ artUrl: (f: string) => f }))

const { readAnswer, radioAlbums } = await import('./claudeMusic')
const { fold } = await import('./musicLibrary')

describe('readAnswer', () => {
  it('reads picks and the action, fenced or not', () => {
    expect(readAnswer('```json\n{"picks":[2,0,2],"action":"shuffle"}\n```', 3)).toEqual({ picks: [2, 0], action: 'shuffle' })
  })
  it('drops lines out of range and shows when nothing is left', () => {
    expect(readAnswer('{"picks":[9],"action":"play"}', 3)).toEqual({ picks: [], action: 'show' })
  })
  it('treats an unknown action as show', () => {
    expect(readAnswer('{"picks":[1],"action":"dance"}', 3)).toEqual({ picks: [1], action: 'show' })
  })
  it('gives up on no JSON', () => {
    expect(readAnswer('sorry', 3)).toBeNull()
  })
})

describe('fold', () => {
  it('matches without case or accents', () => {
    expect(fold('Beyoncé – RENAISSANCE')).toBe('beyonce – renaissance')
  })
})

describe('radioAlbums', () => {
  const album = (id: string, genre: string | undefined, year: number | undefined, title = id, artist = 'Someone'): MusicAlbum => ({ id, title, artist, genre, year, folder: `/m/${id}`, added: 0, duration: 0, songs: 1 })
  const ids = (seed: Parameters<typeof radioAlbums>[0], albums: MusicAlbum[]): string[] => radioAlbums(seed, albums).map((a) => `${a.album.id}${a.same ? '*' : ''}`)

  it('puts the song’s genre family first, nearest years first', () => {
    const albums = [album('cumbia', 'Cumbia', 1975), album('funk', 'Funk', 1974), album('jazzfunk70s', 'Jazz-Funk', 1976), album('jazz60s', 'Jazz', 1961), album('none', undefined, 1976)]
    expect(ids({ title: 'Song', genre: 'Jazz-Funk', year: 1975 }, albums)).toEqual(['jazzfunk70s*', 'funk*', 'jazz60s*', 'cumbia', 'none'])
  })

  it('goes Japanese with Japanese, whatever the genre tag says', () => {
    const albums = [album('citypop', 'City Pop', 1984), album('kana', undefined, 1990, 'はじめてのずかん'), album('synth', 'Synthpop', 1984)]
    expect(ids({ title: '真夜中のドア', artist: '松原みき', genre: 'Pop', year: 1979 }, albums)).toEqual(['citypop*', 'kana*', 'synth'])
  })

  it('leaves out the albums vaporTV includes', () => {
    expect(ids({ title: 'Song', genre: 'Ambient' }, [{ ...album('ambient', 'Ambient', 2020), included: true }])).toEqual([])
  })
})
