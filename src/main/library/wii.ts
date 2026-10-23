import { scanDiscImages, type DiscGame } from './discs'

export type WiiGame = DiscGame

/** Wii games: disc images Dolphin opens (RVZ mostly, some WBFS). */
export function scanWii(root: string, titles: Record<string, string> = {}): Promise<WiiGame[]> {
  return scanDiscImages(root, { platform: 'wii', images: /\.(rvz|wbfs|iso|wia|gcz|ciso)$/i, playlists: true, titles })
}
