import { scanDiscImages, type DiscGame } from './discs'

export type SnesGame = DiscGame

/**
 * SNES games for Snes9x: No-Intro cartridge dumps (.sfc, .smc), loose or zipped, a file per game.
 */
export function scanSnes(root: string, titles: Record<string, string> = {}): Promise<SnesGame[]> {
  return scanDiscImages(root, { platform: 'snes', images: /\.(sfc|smc|fig|swc|bs|zip|7z)$/i, playlists: false, titles })
}
