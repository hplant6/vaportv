import { scanDiscImages, type DiscGame } from './discs'

export type SaturnGame = DiscGame

/**
 * Saturn games for Kronos: Redump dumps as .cue (with their track files), .chd, .ccd, or
 * zipped cue/bin, which Kronos opens itself. Multi-disc games sit in a folder of their own.
 */
export function scanSaturn(root: string, titles: Record<string, string> = {}): Promise<SaturnGame[]> {
  return scanDiscImages(root, { platform: 'saturn', images: /\.(cue|chd|ccd|zip)$/i, playlists: true, titles })
}
