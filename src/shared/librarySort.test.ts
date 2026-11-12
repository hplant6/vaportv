import { describe, expect, it } from 'vitest'
import { mainGenre } from './genres'
import { genreGroups, nextSort, sortItems, yearGroups } from './librarySort'
import type { RecentItem } from './types'

const game = (title: string, more: Partial<RecentItem> = {}): RecentItem => ({ id: title, title, platform: 'snes', ...more })
const titles = (items: RecentItem[]): string[] => items.map((item) => item.title)

describe('left bar sort', () => {
  const games = [
    game('Zelda', { lastPlayed: '2026-11-01', playtime: 30, added: 3 }),
    game('Contra 3', { added: 1 }),
    game('Contra 10'),
    game('actraiser', { lastPlayed: '2026-11-10', playtime: 600, added: 2 })
  ]

  it('sorts by title, numbers as numbers, ignoring case', () => {
    expect(titles(sortItems(games, 'title'))).toEqual(['actraiser', 'Contra 3', 'Contra 10', 'Zelda'])
  })

  it('puts the latest, most played or newest first, the rest after A–Z', () => {
    expect(titles(sortItems(games, 'lastPlayed'))).toEqual(['actraiser', 'Zelda', 'Contra 3', 'Contra 10'])
    expect(titles(sortItems(games, 'mostPlayed'))).toEqual(['actraiser', 'Zelda', 'Contra 3', 'Contra 10'])
    expect(titles(sortItems(games, 'added'))).toEqual(['Zelda', 'actraiser', 'Contra 3', 'Contra 10'])
  })

  it('cycles Title, Last played, Most played, Recently added', () => {
    expect([nextSort('title'), nextSort('lastPlayed'), nextSort('mostPlayed'), nextSort('added')]).toEqual(['lastPlayed', 'mostPlayed', 'added', 'title'])
  })
})

describe('genres and years', () => {
  it('lists each game under its main genre, named plainly', () => {
    expect(mainGenre('Shooter / FPV')).toBe('Shooter')
    expect(mainGenre('Racing, Driving')).toBe('Racing')
    expect(mainGenre('Role Playing Game')).toBe('Role-Playing')
    expect(mainGenre("Shoot'em Up / Vertical")).toBe("Shoot 'em Up")
    expect(mainGenre('')).toBeUndefined()
    const groups = genreGroups([game('A', { genre: 'Shooter' }), game('B', { genre: 'Platform' }), game('C', { genre: 'Shooter' }), game('D')])
    expect(groups.map((g) => [g.name, titles(g.items)])).toEqual([
      ['Platform', ['B']],
      ['Shooter', ['A', 'C']]
    ])
  })

  it('lists years oldest first, or decades when there are too many years', () => {
    expect(yearGroups([game('A', { year: 1994 }), game('B', { year: 1991 }), game('C')]).map((g) => g.name)).toEqual(['1991', '1994'])
    const spread = Array.from({ length: 20 }, (_, i) => game(String(i), { year: 1985 + i }))
    expect(yearGroups(spread).map((g) => [g.name, g.items.length])).toEqual([
      ['1980s', 5],
      ['1990s', 10],
      ['2000s', 5]
    ])
  })
})
