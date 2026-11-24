import type { MediaItem } from '../../../shared/types'

/**
 * What to search the web for: its title as a person would type it (a file's name, "Dark.City.Theatrical.Cut"
 * or "Sincerely-Louis-CK-HD", made words, without its picture quality), its year, and "poster".
 */
export function coverQuery(item: Pick<MediaItem, 'title' | 'released' | 'subtitle'>): string {
  let title = item.title
  if (!/\s/.test(title)) title = title.replace(/[._-]+/g, ' ')
  title = title
    .replace(/\b(2160p|1080p?|720p|480p|4k|uhd|hd|sd|sml|bluray|blu ray|brrip|webrip|web dl|x26[45]|h26[45]|hevc|dd\s?5\s?1|aac)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const year = item.released?.slice(0, 4) || (/^\d{4}$/.test(item.subtitle) ? item.subtitle : '')
  return [title, year, 'poster'].filter(Boolean).join(' ')
}
