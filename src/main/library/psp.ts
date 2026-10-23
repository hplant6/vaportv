import { scanDiscImages, type DiscGame } from './discs'

export type PspGame = DiscGame

/** PSP games for PPSSPP: UMD dumps as .iso, .cso, .chd or .pbp, loose or a folder per game (one entry each). */
export function scanPsp(root: string, titles: Record<string, string> = {}): Promise<PspGame[]> {
  return scanDiscImages(root, { platform: 'psp', images: /\.(iso|cso|chd|pbp)$/i, playlists: false, titles })
}
