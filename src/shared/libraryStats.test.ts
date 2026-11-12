import { describe, expect, it } from 'vitest'
import { formatTotalPlaytime, libraryStats } from './libraryStats'
import { hasSideBar } from './tabs'

describe('left bar', () => {
  it('goes on the consoles’ tabs, not yet Steam’s or Arcade’s', () => {
    expect(hasSideBar('switch')).toBe(true)
    expect(hasSideBar('neogeo')).toBe(true)
    expect(hasSideBar('steam')).toBe(false)
    expect(hasSideBar('arcade')).toBe(false)
    expect(hasSideBar('home')).toBe(false)
    expect(hasSideBar('apps')).toBe(false)
  })

  it('counts games, unplayed ones and time played', () => {
    const game = (id: string, lastPlayed?: string, playtime?: number) => ({ id, title: id, platform: 'snes', lastPlayed, playtime })
    expect(libraryStats([game('a', '2026-11-01', 90), game('b'), game('c', '2026-10-01')])).toEqual({ games: 3, unplayed: 1, playtime: 90 })
  })

  it('says playtime in minutes, hours, then thousands of hours', () => {
    expect(formatTotalPlaytime(0)).toBe('0 minutes')
    expect(formatTotalPlaytime(1)).toBe('1 minute')
    expect(formatTotalPlaytime(90)).toBe('2 hours')
    expect(formatTotalPlaytime(312 * 60)).toBe('312 hours')
    expect(formatTotalPlaytime(2000 * 60)).toBe('2K hours')
    expect(formatTotalPlaytime(2140 * 60)).toBe('2.1K hours')
    expect(formatTotalPlaytime(12400 * 60)).toBe('12K hours')
  })
})
