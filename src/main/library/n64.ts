import { scanDiscImages, type DiscGame } from './discs'

export type N64Game = DiscGame

/**
 * Nintendo 64 games for Mupen64Plus-Next: No-Intro cartridge dumps (.z64, .n64, .v64),
 * loose or zipped, a game's file per game. A beta beside its released game is dropped.
 */
export function scanN64(root: string, titles: Record<string, string> = {}): Promise<N64Game[]> {
  return scanDiscImages(root, { platform: 'n64', images: /\.(z64|n64|v64|zip|7z)$/i, playlists: false, titles })
}
