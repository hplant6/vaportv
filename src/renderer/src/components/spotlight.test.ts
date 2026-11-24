import { describe, expect, it } from 'vitest'
import { backdropOf, factsOf } from './spotlightParts'

const game = { id: 'snes:1', title: 'Chrono Trigger', platform: 'snes' }

describe('Spotlight', () => {
  it('prefers a hero banner, then the card’s own art softened', () => {
    expect(backdropOf({ ...game, hero: 'h', wide: 'w', cover: 'c' }, { backdrop: 'b' })).toEqual({ url: 'b', soft: false })
    expect(backdropOf({ ...game, hero: 'h', wide: 'w' }, {})).toEqual({ url: 'h', soft: false })
    expect(backdropOf({ ...game, wide: 'w', cover: 'c' }, {})).toEqual({ url: 'w', soft: true })
    expect(backdropOf({ ...game, cover: 'c' }, {})).toEqual({ url: 'c', soft: true })
    expect(backdropOf(game, {})).toBeNull()
  })

  it('lists year, genre, when it was played and for how long', () => {
    expect(factsOf({ ...game, year: 1995, genre: 'RPG' })).toEqual(['1995', 'RPG', 'Unplayed'])
    expect(factsOf({ ...game, lastPlayed: '2026-11-01', playtime: 90 }).slice(1)).toHaveLength(1)
  })
})
