import { readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, relative, sep } from 'node:path'
import type { MusicKind, MusicLayer, MusicTrack, MusicVolume, Playlist } from '../shared/types'
import { AUDIO, copyInto } from './browse'
import type { Config } from './config'
import { artUrl } from './library/art'

/** Volume levels for background music: quiet enough to sit under menu sounds. */
export const MUSIC_VOLUME: Record<MusicVolume, number> = { low: 0.12, medium: 0.25, high: 0.45 }

/** A saved choice that plays every track of its kind in random order. */
export const SHUFFLE = 'shuffle'

/** A saved music choice that plays a playlist: `playlist:<id>`. */
export const PLAYLIST = 'playlist:'

/** Where each kind lives inside the music folder; files anywhere else count as music. */
const KIND_FOLDER: Record<MusicKind, string> = { music: 'Music', ambience: 'Ambience' }

/**
 * Tracks that ship with steamtv, listed before the music folder's. `file` is what's
 * saved in config; `url` is relative to the page.
 */
const BUILT_IN: (MusicTrack & { url: string; kind: MusicKind })[] = [
  // From the rain backdrop's demo (github.com/Faraz-Portfolio/demo-2023-rain-puddle), light-rain-109591.
  { file: 'builtin:rain', name: 'Rain (built in)', url: 'music/rain.mp3', kind: 'ambience' },
  // CC0, from freesound.org (credited in NOTICE.md): kkenny101 #852484, SamsterBirdies #578524, maarten91 #468449.
  { file: 'builtin:crickets', name: 'Crickets (built in)', url: 'music/crickets.ogg', kind: 'ambience' },
  { file: 'builtin:ocean-waves', name: 'Ocean waves (built in)', url: 'music/ocean-waves.ogg', kind: 'ambience' },
  { file: 'builtin:birdsong', name: 'Birdsong (built in)', url: 'music/birdsong.ogg', kind: 'ambience' },
  // Chris Zabriskie, CC BY 4.0 (chriszabriskie.com/use): Bandcamp FLACs re-encoded to Opus, credited here, in
  // Settings beside each track, and in NOTICE.md.
  { file: 'builtin:zabriskie-any-kind-of-black-magic-darkness-will-be-removed', name: 'Any Kind of Black Magic Darkness Will Be Removed', credit: 'Chris Zabriskie · Mayor Feedback · CC BY 4.0', url: 'music/zabriskie-any-kind-of-black-magic-darkness-will-be-removed.ogg', kind: 'music' },
  { file: 'builtin:zabriskie-cut-to-rip-torn', name: 'Cut to Rip Torn', credit: 'Chris Zabriskie · Mayor Feedback · CC BY 4.0', url: 'music/zabriskie-cut-to-rip-torn.ogg', kind: 'music' },
  { file: 'builtin:zabriskie-hitchcock-would-have-fucked-up-charade', name: 'Hitchcock Would Have Fucked Up Charade', credit: 'Chris Zabriskie · Angie\'s Sunday Service · CC BY 4.0', url: 'music/zabriskie-hitchcock-would-have-fucked-up-charade.ogg', kind: 'music' },
  { file: 'builtin:zabriskie-i-fuck-you-not', name: 'I Fuck You Not', credit: 'Chris Zabriskie · Mayor Feedback · CC BY 4.0', url: 'music/zabriskie-i-fuck-you-not.ogg', kind: 'music' },
  { file: 'builtin:zabriskie-i-hope-to-be-able-to-live', name: 'I Hope to Be Able to Live the Rest of My Life Without Ever Having to Make That Choice', credit: 'Chris Zabriskie · I Want You to Think About Me · CC BY 4.0', url: 'music/zabriskie-i-hope-to-be-able-to-live.ogg', kind: 'music' },
  { file: 'builtin:zabriskie-what-if-she-doesnt-need-a-scarf', name: 'What If She Doesn’t Need a Scarf?', credit: 'Chris Zabriskie · I Want You to Think About Me · CC BY 4.0', url: 'music/zabriskie-what-if-she-doesnt-need-a-scarf.ogg', kind: 'music' },
  { file: 'builtin:zabriskie-your-journey-is-resuming-now', name: 'Your Journey Is Resuming Now', credit: 'Chris Zabriskie · Abandon Babylon · CC BY 4.0', url: 'music/zabriskie-your-journey-is-resuming-now.ogg', kind: 'music' }
]

/** The playlist there is until any are made or changed: the built-in Chris Zabriskie tracks, in order. */
const DEFAULT_PLAYLISTS: Playlist[] = [
  { id: 'zabriskie', name: 'Chris Zabriskie', files: BUILT_IN.filter((t) => t.file.startsWith('builtin:zabriskie-')).map((t) => t.file), shuffle: false }
]

/** Music's playlists: the saved ones, or the built-in one until any are saved. */
export function playlists(config: Config): Playlist[] {
  return config.playlists ?? DEFAULT_PLAYLISTS
}

export function musicFolder(config: Config): string {
  return config.musicFolder ?? join(homedir(), 'Music')
}

/** The built-in tracks, then audio files in the music folder and one level of subfolders, by name, split by kind. */
export async function musicTracks(config: Config): Promise<Record<MusicKind, MusicTrack[]>> {
  const found = await folderTracks(config)
  const of = (kind: MusicKind): MusicTrack[] => [
    ...BUILT_IN.filter((t) => t.kind === kind).map(({ file, name, credit }) => ({ file, name, credit })),
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

/** What the page should play on each layer: the chosen track, a playlist's tracks, or every one shuffled, and a volume. */
export async function currentMusic(config: Config): Promise<Record<MusicKind, MusicLayer>> {
  const tracks = await musicTracks(config)
  const choices = musicChoices(config)
  const root = musicFolder(config)
  const url = (file: string): string => BUILT_IN.find((t) => t.file === file)?.url ?? artUrl(join(root, file))
  const layer = (kind: MusicKind, volume: MusicVolume | undefined): MusicLayer => {
    const choice = choices[kind]
    const files = tracks[kind].map((t) => t.file)
    // A playlist's tracks in its order, less any no longer there.
    const list = kind === 'music' && choice?.startsWith(PLAYLIST) ? playlists(config).find((p) => PLAYLIST + p.id === choice) : undefined
    const chosen = list ? list.files.filter((f) => files.includes(f)) : choice === SHUFFLE ? files : files.filter((f) => f === choice)
    return { urls: chosen.map(url), shuffle: choice === SHUFFLE || !!list?.shuffle, volume: MUSIC_VOLUME[volume ?? 'medium'] }
  }
  return { music: layer('music', config.musicVolume), ambience: layer('ambience', config.ambienceVolume) }
}

/** Copies an audio file into the music folder's Music or Ambience folder; returns its saved name (relative). */
export async function importMusic(config: Config, source: string, kind: MusicKind): Promise<string> {
  if (!AUDIO.test(source)) throw new Error("That isn't an audio file vaporTV can add")
  const target = await copyInto(source, join(musicFolder(config), KIND_FOLDER[kind]))
  return relative(musicFolder(config), target)
}
