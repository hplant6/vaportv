import { scanDiscImages, type DiscGame } from './discs'

export type PsxGame = DiscGame

/**
 * PlayStation games for DuckStation: a .cue (with its .bin tracks), .ccd, .chd, .pbp or
 * .ecm per disc, loose or a folder per game; a multi-disc game's discs can sit a folder deeper
 * ("Metal Gear Solid/Metal Gear Solid (Disc 1)/…"), or be listed in a .m3u.
 */
export function scanPsx(root: string, titles: Record<string, string> = {}): Promise<PsxGame[]> {
  return scanDiscImages(root, { platform: 'psx', images: /\.(cue|ccd|chd|pbp|ecm)$/i, playlists: true, titles, depth: 2 })
}
