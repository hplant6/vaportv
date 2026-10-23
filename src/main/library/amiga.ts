import { scanDiscImages, type DiscGame } from './discs'

export type AmigaGame = DiscGame

/**
 * Amiga games for PUAE: floppy images (.adf, .ipf) or WHDLoad archives (.lha), loose or zipped. PUAE
 * puts every disk of a zipped multi-disk game in its own disk list.
 */
export function scanAmiga(root: string, titles: Record<string, string> = {}): Promise<AmigaGame[]> {
  return scanDiscImages(root, { platform: 'amiga', images: /\.(adf|ipf|lha|hdf|zip|7z)$/i, playlists: false, titles })
}
