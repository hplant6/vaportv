import { readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, relative } from 'node:path'
import type { MusicTrack, MusicVolume } from '../shared/types'
import type { Config } from './config'
import { artUrl } from './library/art'

const AUDIO = /\.(mp3|ogg|oga|flac|wav|m4a|aac|opus)$/i

/** Volume levels for background music: quiet enough to sit under menu sounds. */
export const MUSIC_VOLUME: Record<MusicVolume, number> = { low: 0.12, medium: 0.25, high: 0.45 }

/**
 * Tracks that ship with steamtv, listed before the music folder's. `file` is what's
 * saved in config; `url` is relative to the page.
 */
const BUILT_IN: (MusicTrack & { url: string })[] = [
  // From the rain backdrop's demo (github.com/Faraz-Portfolio/demo-2023-rain-puddle), light-rain-109591.
  { file: 'builtin:rain', name: 'Rain (built in)', url: 'music/rain.mp3' }
]

export function musicFolder(config: Config): string {
  return config.musicFolder ?? join(homedir(), 'Music')
}

/** The built-in tracks, then audio files in the music folder and one level of subfolders, by name. */
export async function musicTracks(config: Config): Promise<MusicTrack[]> {
  return [...BUILT_IN.map(({ file, name }) => ({ file, name })), ...(await folderTracks(config))]
}

async function folderTracks(config: Config): Promise<MusicTrack[]> {
  const root = musicFolder(config)
  const found: string[] = []
  const walk = async (dir: string, level: number): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const path = join(dir, entry.name)
      if (entry.isDirectory() && level < 1) await walk(path, level + 1)
      else if (entry.isFile() && AUDIO.test(entry.name)) found.push(path)
    }
  }
  await walk(root, 0)
  return found
    .map((path) => {
      const file = relative(root, path)
      return { file, name: file.replace(AUDIO, '').replace(/[/\\\\]/g, ' · ') }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** What the page should play: a URL for the chosen track (if it still exists) and a volume. */
export async function currentMusic(config: Config): Promise<{ url: string | null; volume: number }> {
  const volume = MUSIC_VOLUME[config.musicVolume ?? 'medium']
  if (!config.music) return { url: null, volume }
  const builtIn = BUILT_IN.find((t) => t.file === config.music)
  if (builtIn) return { url: builtIn.url, volume }
  const exists = (await folderTracks(config)).some((t) => t.file === config.music)
  return { url: exists ? artUrl(join(musicFolder(config), config.music)) : null, volume }
}
