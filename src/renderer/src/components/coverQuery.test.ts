import { describe, expect, it } from 'vitest'
import { coverQuery } from './coverQuery'

describe('coverQuery', () => {
  const q = (title: string, released?: string): string => coverQuery({ title, released, subtitle: '' })
  it('makes words of a file-like name, without its picture quality', () => {
    expect(q('Dark.City.Theatrical.Cut')).toBe('Dark City Theatrical Cut poster')
    expect(q('Sincerely-Louis-CK-HD')).toBe('Sincerely Louis CK poster')
    expect(q('Timelapse 1080 sml')).toBe('Timelapse poster')
  })
  it('leaves a real title (and its hyphens) as it is, with its year', () => {
    expect(q('Spider-Man: Into the Spider-Verse', '2018-12-14')).toBe('Spider-Man: Into the Spider-Verse 2018 poster')
    expect(q('講談社の動く図鑑 MOVE はじめてのずかん きょうりゅう')).toBe('講談社の動く図鑑 MOVE はじめてのずかん きょうりゅう poster')
  })
})
