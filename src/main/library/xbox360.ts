import { cleanNoIntroTitle, scanDiscImages, type DiscGame } from './discs'

export type Xbox360Game = DiscGame

export const cleanXbox360Title = cleanNoIntroTitle

/** Xbox 360 games: disc images Xenia opens (it doesn't take .m3u lists). */
export function scanXbox360(root: string, titles: Record<string, string> = {}): Promise<Xbox360Game[]> {
  return scanDiscImages(root, { platform: 'xbox360', images: /\.(iso|xex|zar)$/i, playlists: false, titles })
}
