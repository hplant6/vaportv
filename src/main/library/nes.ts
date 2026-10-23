import { scanDiscImages, type DiscGame } from './discs'

export type NesGame = DiscGame

/**
 * NES games for Mesen: No-Intro cartridge dumps (.nes, .fds), loose or zipped, a file per game.
 */
export function scanNes(root: string, titles: Record<string, string> = {}): Promise<NesGame[]> {
  return scanDiscImages(root, { platform: 'nes', images: /\.(nes|fds|unf|unif|zip|7z)$/i, playlists: false, titles })
}
