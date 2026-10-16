import { scanDiscImages, type DiscGame } from './discs'

export type GameCubeGame = DiscGame

/** GameCube games: disc images Dolphin opens, multi-disc games by their .m3u list. */
export function scanGameCube(root: string, titles: Record<string, string> = {}): Promise<GameCubeGame[]> {
  return scanDiscImages(root, { platform: 'gamecube', images: /\.(rvz|iso|gcm|gcz|ciso|wia)$/i, playlists: true, titles })
}
