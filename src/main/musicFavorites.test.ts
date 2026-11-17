import { describe, expect, it, vi } from 'vitest'

vi.mock('./library/art', () => ({ artUrl: (f: string) => f }))

const { sameSong } = await import('./musicFavorites')

describe('sameSong', () => {
  it('matches by title and artist, ignoring case and accents', () => {
    expect(sameSong({ title: 'Plastic Love', artist: 'Mariya Takeuchi' }, { title: 'plastic love', artist: 'MARIYA TAKEUCHI', duration: 474 })).toBe(true)
    expect(sameSong({ title: 'Café', artist: 'X' }, { title: 'Cafe', artist: 'x' })).toBe(true)
  })
  it('tells apart lengths more than two seconds out (a live take)', () => {
    expect(sameSong({ title: 'A', artist: 'B', duration: 200 }, { title: 'A', artist: 'B', duration: 260 })).toBe(false)
  })
  it('tells apart other artists', () => {
    expect(sameSong({ title: 'Intro', artist: 'B' }, { title: 'Intro', artist: 'C' })).toBe(false)
  })
})
