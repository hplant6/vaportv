import { scanDiscImages, type DiscGame } from './discs'

export type DreamcastGame = DiscGame

/**
 * Dreamcast games for Flycast: GD-ROM dumps as .gdi or .cue (with their track
 * files), .chd or .cdi. Multi-disc games sit a level deeper, a folder per disc.
 */
export function scanDreamcast(root: string, titles: Record<string, string> = {}): Promise<DreamcastGame[]> {
  return scanDiscImages(root, { platform: 'dreamcast', images: /\.(gdi|cue|chd|cdi)$/i, playlists: true, titles, depth: 2 })
}
