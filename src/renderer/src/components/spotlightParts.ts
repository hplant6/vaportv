import type { RecentItem, SpotlightDetails } from '../../../shared/types'
import { formatDate, formatPlaytime } from './cardText'

// The Spotlight layout's choices that don't need the screen: which picture, and which facts.

/** The picture behind it all, and whether it's a small one stretched (softened so it doesn't look it). */
export function backdropOf(item: RecentItem, d: SpotlightDetails): { url: string; soft: boolean } | null {
  if (d.backdrop) return { url: d.backdrop, soft: false }
  if (item.hero) return { url: item.hero, soft: false }
  if (item.wide) return { url: item.wide, soft: true }
  if (item.cover) return { url: item.cover, soft: true }
  return null
}

/** The facts under the name: year and genre, when it was last played, and for how long. */
export function factsOf(item: RecentItem): string[] {
  const facts: string[] = []
  if (item.year) facts.push(String(item.year))
  if (item.genre) facts.push(item.genre)
  facts.push(item.lastPlayed ? `Played ${formatDate(item.lastPlayed)}` : 'Unplayed')
  if (item.playtime) facts.push(formatPlaytime(item.playtime))
  return facts
}
