// A console tab's totals, for its left bar (SideBar.tsx).

import type { RecentItem } from './types'

/** e.g. "45 minutes", "312 hours", "2.1K hours". */
export function formatTotalPlaytime(minutes: number): string {
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
  const hours = Math.round(minutes / 60)
  if (hours < 1000) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
  return `${(hours / 1000).toFixed(hours < 10000 ? 1 : 0).replace(/\.0$/, '')}K hours`
}

/** The console's totals: games, games never played, and time played (what vaporTV has counted). */
export function libraryStats(items: RecentItem[]): { games: number; unplayed: number; playtime: number } {
  return {
    games: items.length,
    unplayed: items.filter((item) => !item.lastPlayed).length,
    playtime: items.reduce((sum, item) => sum + (item.playtime ?? 0), 0)
  }
}
