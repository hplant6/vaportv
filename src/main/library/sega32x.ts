import { scanDiscImages, type DiscGame } from './discs'

export type Sega32xGame = DiscGame

/**
 * 32X games for PicoDrive: No-Intro cartridge dumps (.32x), loose or zipped, a file per game.
 */
export function scanSega32x(root: string, titles: Record<string, string> = {}): Promise<Sega32xGame[]> {
  return scanDiscImages(root, { platform: 'sega32x', images: /\.(32x|bin|zip|7z)$/i, playlists: false, titles })
}
