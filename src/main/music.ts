import { copyFile, mkdir, readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import type { BrowseEntry, MusicKind, MusicLayer, MusicTrack, MusicVolume } from '../shared/types'
import type { Config } from './config'
import { artUrl } from './library/art'

const AUDIO = /\.(mp3|ogg|oga|flac|wav|m4a|aac|opus)$/i

/** Volume levels for background music: quiet enough to sit under menu sounds. */
export const MUSIC_VOLUME: Record<MusicVolume, number> = { low: 0.12, medium: 0.25, high: 0.45 }

/** A saved choice that plays every track of its kind in random order. */
export const SHUFFLE = 'shuffle'

/** Where each kind lives inside the music folder; files anywhere else count as music. */
const KIND_FOLDER: Record<MusicKind, string> = { music: 'Music', ambience: 'Ambience' }

/**
 * Tracks that ship with steamtv, listed before the music folder's. `file` is what's
 * saved in config; `url` is relative to the page.
 */
const BUILT_IN: (MusicTrack & { url: string; kind: MusicKind })[] = [
  // From the rain backdrop's demo (github.com/Faraz-Portfolio/demo-2023-rain-puddle), light-rain-109591.
  { file: 'builtin:rain', name: 'Rain (built in)', url: 'music/rain.mp3', kind: 'ambience' }
]

export function musicFolder(config: Config): string {
  return config.musicFolder ?? join(homedir(), 'Music')
}

/** The built-in tracks, then audio files in the music folder and one level of subfolders, by name, split by kind. */
export async function musicTracks(config: Config): Promise<Record<MusicKind, MusicTrack[]>> {
  const found = await folderTracks(config)
  const of = (kind: MusicKind): MusicTrack[] => [
    ...BUILT_IN.filter((t) => t.kind === kind).map(({ file, name }) => ({ file, name })),
    ...found.filter((t) => t.kind === kind).map(({ file, name }) => ({ file, name }))
  ]
  return { music: of('music'), ambience: of('ambience') }
}

async function folderTracks(config: Config): Promise<(MusicTrack & { kind: MusicKind })[]> {
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
      const [top, ...rest] = file.split(sep)
      const kind: MusicKind = rest.length > 0 && top === KIND_FOLDER.ambience ? 'ambience' : 'music'
      // The kind's own folder isn't part of the name; other subfolders are ("Album · Track").
      const shown = rest.length > 0 && (top === KIND_FOLDER.music || top === KIND_FOLDER.ambience) ? rest.join(sep) : file
      return { file, kind, name: shown.replace(AUDIO, '').trim().replace(/[/\\]/g, ' · ') }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * The saved choices for each layer: a track's file, SHUFFLE, or null for none. Before
 * ambience was its own layer, the built-in rain was a music choice; it moves across.
 */
export function musicChoices(config: Config): Record<MusicKind, string | null> {
  if (config.ambience === undefined && config.music === 'builtin:rain') return { music: null, ambience: 'builtin:rain' }
  // Ambience saved as '' is none, chosen (so the rain doesn't move across again).
  return { music: config.music ?? null, ambience: config.ambience || null }
}

/** What the page should play on each layer: the chosen track (or every one, shuffled) and a volume. */
export async function currentMusic(config: Config): Promise<Record<MusicKind, MusicLayer>> {
  const tracks = await musicTracks(config)
  const choices = musicChoices(config)
  const root = musicFolder(config)
  const url = (file: string): string => BUILT_IN.find((t) => t.file === file)?.url ?? artUrl(join(root, file))
  const layer = (kind: MusicKind, volume: MusicVolume | undefined): MusicLayer => {
    const choice = choices[kind]
    const files = tracks[kind].map((t) => t.file)
    const chosen = choice === SHUFFLE ? files : files.filter((f) => f === choice)
    return { urls: chosen.map(url), shuffle: choice === SHUFFLE, volume: MUSIC_VOLUME[volume ?? 'medium'] }
  }
  return { music: layer('music', config.musicVolume), ambience: layer('ambience', config.ambienceVolume) }
}

// ── Adding your own: a browser over this machine's folders and removable drives ──

/** Where SteamOS (and most desktops) mount USB drives and SD cards. */
function driveParents(): string[] {
  const user = userInfo().username
  return [join('/run/media', user), '/run/media', '/media', join('/media', user)]
}

/** The browser may only look inside home and the drive mounts. */
function allowed(path: string): boolean {
  const full = resolve(path)
  return [homedir(), '/run/media', '/media'].some((root) => full === root || full.startsWith(root + sep))
}

/** The places to start from: home folders that exist, then each mounted drive. */
async function browseRoots(config: Config): Promise<BrowseEntry[]> {
  const home = homedir()
  const music = resolve(musicFolder(config))
  const places = [
    { name: 'Downloads', path: join(home, 'Downloads') },
    { name: 'Desktop', path: join(home, 'Desktop') },
    { name: 'Home', path: home }
  ].filter((p) => existsSync(p.path) && resolve(p.path) !== music)
  const drives: BrowseEntry[] = []
  const seen = new Set<string>()
  for (const parent of driveParents()) {
    for (const entry of await readdir(parent, { withFileTypes: true }).catch(() => [])) {
      const path = join(parent, entry.name)
      // /run/media holds the user's folder too; only drives themselves.
      if (!entry.isDirectory() || entry.name.startsWith('.') || seen.has(path) || driveParents().includes(path)) continue
      seen.add(path)
      drives.push({ name: entry.name, path, kind: 'drive' })
    }
  }
  return [...places.map((p) => ({ ...p, kind: 'folder' as const })), ...drives]
}

/** A folder's subfolders, then its audio files (hidden ones left out); with no folder, the places to start. */
export async function browseMusic(config: Config, dir: string | null): Promise<BrowseEntry[]> {
  if (!dir) return browseRoots(config)
  if (!allowed(dir)) throw new Error('That folder is outside home and the drives')
  const entries = await readdir(dir, { withFileTypes: true })
  const visible = entries.filter((e) => !e.name.startsWith('.'))
  const byName = (a: BrowseEntry, b: BrowseEntry): number => a.name.localeCompare(b.name, undefined, { numeric: true })
  const folders = visible.filter((e) => e.isDirectory()).map((e) => ({ name: e.name, path: join(dir, e.name), kind: 'folder' as const }))
  const files = visible.filter((e) => e.isFile() && AUDIO.test(e.name)).map((e) => ({ name: e.name, path: join(dir, e.name), kind: 'audio' as const }))
  return [...folders.sort(byName), ...files.sort(byName)]
}

/** Copies an audio file into the music folder's Music or Ambience folder; returns its saved name (relative). */
export async function importMusic(config: Config, source: string, kind: MusicKind): Promise<string> {
  if (!allowed(source) || !AUDIO.test(source) || !(await stat(source)).isFile()) throw new Error("That isn't an audio file vaporTV can add")
  const folder = join(musicFolder(config), KIND_FOLDER[kind])
  await mkdir(folder, { recursive: true })
  const ext = extname(source)
  const stem = basename(source, ext)
  let target = join(folder, basename(source))
  for (let n = 2; existsSync(target); n++) target = join(folder, `${stem} (${n})${ext}`)
  // Already in place (picked from the music folder itself): nothing to copy.
  if (resolve(dirname(source)) !== resolve(folder)) await copyFile(source, target)
  else target = source
  return relative(musicFolder(config), target)
}
