import { scanDiscImages, type DiscGame } from './discs'

export type Ps2Game = DiscGame

/**
 * PS2 games: disc images PCSX2 opens (a .cue over its .bin when there's both). PCSX2 takes
 * no disc lists, so a multi-disc game opens its first disc and changes discs in-game.
 */
export function scanPs2(root: string, titles: Record<string, string> = {}): Promise<Ps2Game[]> {
  return scanDiscImages(root, { platform: 'ps2', images: /\.(iso|chd|cso|zso|gz|cue|bin)$/i, playlists: false, titles })
}
