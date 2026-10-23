import { scanDiscImages, type DiscGame } from './discs'

export type GenesisGame = DiscGame

/**
 * Genesis games for Genesis Plus GX: No-Intro cartridge dumps (.md, .gen, .bin), loose or zipped, a file per game.
 */
export function scanGenesis(root: string, titles: Record<string, string> = {}): Promise<GenesisGame[]> {
  return scanDiscImages(root, { platform: 'genesis', images: /\.(md|gen|smd|bin|zip|7z)$/i, playlists: false, titles })
}
