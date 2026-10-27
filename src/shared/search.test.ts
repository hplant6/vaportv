import { describe, expect, it } from 'vitest'
import { clearWinner, matchScore, parseQuery, search, searchWords } from './search'

describe('search', () => {
  it('evens out numbers, numerals and symbols', () => {
    expect(searchWords('Final Fantasy VII')).toEqual(['final', 'fantasy', '7'])
    expect(searchWords('halo two')).toEqual(['halo', '2'])
    expect(searchWords('Ratchet & Clank')).toEqual(['ratchet', 'and', 'clank'])
    expect(searchWords('Pokémon')).toEqual(['pokemon'])
    expect(searchWords("Assassin's Creed")).toEqual(['assassins', 'creed'])
  })

  it('reads "play" and "open" as asking to start', () => {
    expect(parseQuery('Play Halo 2')).toEqual({ query: 'Halo 2', start: true })
    expect(parseQuery('open netflix')).toEqual({ query: 'netflix', start: true })
    expect(parseQuery('Mario Kart')).toEqual({ query: 'Mario Kart', start: false })
  })

  it('scores spoken names against titles', () => {
    expect(matchScore('final fantasy seven', 'Final Fantasy VII')).toBe(100)
    expect(matchScore('streetfighter', 'Street Fighter')).toBe(100)
    expect(matchScore('zel', 'The Legend of Zelda')).toBeGreaterThan(30)
    expect(matchScore('metroid prim', 'Metroid Prime')).toBeGreaterThan(75)
    expect(matchScore('mario', 'Halo 2')).toBe(0)
  })

  it('ranks the closest name first and knows a clear winner', () => {
    const titles = ['Halo 3', 'Halo 2', 'Halo: Combat Evolved', 'Hades']
    const results = search('halo two', titles, (t) => t)
    expect(results[0].thing).toBe('Halo 2')
    expect(clearWinner(results)).toBe(true)
    expect(clearWinner(search('halo', titles, (t) => t))).toBe(false)
  })
})
