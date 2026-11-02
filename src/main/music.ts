import { readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, relative, sep } from 'node:path'
import type { MusicKind, MusicLayer, MusicTrack, MusicVolume, Playlist } from '../shared/types'
import { AUDIO, copyInto } from './browse'
import type { Config } from './config'
import { artUrl } from './library/art'

/** Volume levels for background music: quiet enough to sit under menu sounds. */
export const MUSIC_VOLUME: Record<MusicVolume, number> = { low: 0.12, medium: 0.25, high: 0.45 }

/**
 * The built-in music is loudness-matched to -16 LUFS (EBU R128), as much as 9 dB under how most of it was mastered;
 * the music layer plays twice as loud (+6 dB) to make that up, so each volume level sounds about as it did before.
 */
const MUSIC_GAIN = 2

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
  { file: 'builtin:zabriskie-your-journey-is-resuming-now', name: 'Your Journey Is Resuming Now', credit: 'Chris Zabriskie · Abandon Babylon · CC BY 4.0', url: 'music/zabriskie-your-journey-is-resuming-now.ogg', kind: 'music' },
  // Retro: chiptunes from opengameart.org (credited here, in Settings beside each track, and in NOTICE.md), re-encoded
  // to Opus. Juhani Junkala's Retro Game Music Pack and Aron Ben Elal's Chiploop are CC0; Shiru's are CC BY 3.0;
  // Oblidivm asks for "Music by Oblidivm" with a link to oblidivmmusic.blogspot.com.
  // All the built-in music (Zabriskie's too) is loudness-matched to -16 LUFS: see MUSIC_GAIN.
  { file: 'builtin:retro-junkala-title-screen', name: 'Title Screen', credit: 'Juhani Junkala · Retro Game Music Pack · CC0', url: 'music/retro-junkala-title-screen.ogg', kind: 'music' },
  { file: 'builtin:retro-junkala-level-1', name: 'Level 1', credit: 'Juhani Junkala · Retro Game Music Pack · CC0', url: 'music/retro-junkala-level-1.ogg', kind: 'music' },
  { file: 'builtin:retro-junkala-level-2', name: 'Level 2', credit: 'Juhani Junkala · Retro Game Music Pack · CC0', url: 'music/retro-junkala-level-2.ogg', kind: 'music' },
  { file: 'builtin:retro-junkala-level-3', name: 'Level 3', credit: 'Juhani Junkala · Retro Game Music Pack · CC0', url: 'music/retro-junkala-level-3.ogg', kind: 'music' },
  { file: 'builtin:retro-elal-chiploop', name: 'Chiploop', credit: 'Aron Ben Elal · CC0', url: 'music/retro-elal-chiploop.ogg', kind: 'music' },
  { file: 'builtin:retro-shiru-time-up', name: 'Time Up', credit: 'Shiru · CC BY 3.0', url: 'music/retro-shiru-time-up.ogg', kind: 'music' },
  { file: 'builtin:retro-shiru-moonlight', name: 'Moonlight', credit: 'Shiru · CC BY 3.0', url: 'music/retro-shiru-moonlight.ogg', kind: 'music' },
  { file: 'builtin:retro-shiru-intruder-alert', name: 'Intruder Alert', credit: 'Shiru · CC BY 3.0', url: 'music/retro-shiru-intruder-alert.ogg', kind: 'music' },
  { file: 'builtin:retro-shiru-voidfiller', name: 'Voidfiller', credit: 'Shiru · CC BY 3.0', url: 'music/retro-shiru-voidfiller.ogg', kind: 'music' },
  { file: 'builtin:retro-oblidivm-jump2sky', name: 'Jump2Sky', credit: 'Music by Oblidivm · oblidivmmusic.blogspot.com', url: 'music/retro-oblidivm-jump2sky.ogg', kind: 'music' },
  { file: 'builtin:retro-oblidivm-survive', name: 'Survive', credit: 'Music by Oblidivm · oblidivmmusic.blogspot.com', url: 'music/retro-oblidivm-survive.ogg', kind: 'music' },
  { file: 'builtin:retro-oblidivm-the-labyrinth', name: 'The Labyrinth', credit: 'Music by Oblidivm · oblidivmmusic.blogspot.com', url: 'music/retro-oblidivm-the-labyrinth.ogg', kind: 'music' },
  { file: 'builtin:retro-oblidivm-the-undefeated', name: 'The Undefeated', credit: 'Music by Oblidivm · oblidivmmusic.blogspot.com', url: 'music/retro-oblidivm-the-undefeated.ogg', kind: 'music' }
]

const builtInFiles = (prefix: string): string[] => BUILT_IN.filter((t) => t.file.startsWith(prefix)).map((t) => t.file)

/** The playlists that ship with vaporTV, in order: the built-in tracks of each. */
const DEFAULT_PLAYLISTS: Playlist[] = [
  { id: 'zabriskie', name: 'Ambient', files: builtInFiles('builtin:zabriskie-'), shuffle: false },
  { id: 'retro', name: 'Retro', files: builtInFiles('builtin:retro-'), shuffle: false }
]

/** The built-in playlists there were before config kept count (`builtinPlaylists`). */
const FIRST_BUILT_IN = ['zabriskie']

/** Built-in playlist ids, recorded when playlists are saved so one deleted isn't added again. */
export const BUILT_IN_PLAYLIST_IDS = DEFAULT_PLAYLISTS.map((p) => p.id)

/**
 * Music's playlists: the saved ones, plus any built-in playlist newer than them (shipped since they were saved),
 * at the end; or the built-in ones until any are saved.
 */
export function playlists(config: Config): Playlist[] {
  if (!config.playlists) return DEFAULT_PLAYLISTS
  const known = new Set([...(config.builtinPlaylists ?? FIRST_BUILT_IN), ...config.playlists.map((p) => p.id)])
  return [...config.playlists.map(renamed), ...DEFAULT_PLAYLISTS.filter((p) => !known.has(p.id))]
}

/** Built-in playlists' old names, by id: a saved copy still called that takes the new name (one renamed by hand keeps its own). */
const OLD_NAMES: Record<string, { from: string; to: string }> = { zabriskie: { from: 'Chris Zabriskie', to: 'Ambient' } }

const renamed = (playlist: Playlist): Playlist => {
  const old = OLD_NAMES[playlist.id]
  return old && playlist.name === old.from ? { ...playlist, name: old.to } : playlist
}

export function musicFolder(config: Config): string {
  return config.musicFolder ?? join(homedir(), 'Music')
}

/** The built-in tracks, then audio files in the music folder and one level of subfolders, by name, split by kind. */
export async function musicTracks(config: Config): Promise<Record<MusicKind, MusicTrack[]>> {
  const found = await folderTracks(config)
  const of = (kind: MusicKind): MusicTrack[] => [
    ...BUILT_IN.filter((t) => t.kind === kind).map(({ file, name, credit }) => ({ file, name, credit, builtIn: true })),
    ...found.filter((t) => t.kind === kind).map(({ kind: _, ...track }) => track)
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
      // The kind's own folder isn't part of the name; another subfolder is its album ("Album/Track.wav").
      const parts = (rest.length > 0 && (top === KIND_FOLDER.music || top === KIND_FOLDER.ambience) ? rest : [top, ...rest]).map((p) => p.trim())
      const { title, artist } = splitTrackName(parts[parts.length - 1].replace(AUDIO, '').trim())
      const album = parts.length > 1 ? parts.slice(0, -1).join(' · ') : undefined
      return { file, kind, name: title, ...(artist ? { artist } : {}), ...(album ? { album } : {}) }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** A file named "Artist - Title" (split at the first " - "; the title keeps any more), else all of it as the title. */
export function splitTrackName(base: string): { title: string; artist?: string } {
  const at = base.indexOf(' - ')
  if (at <= 0 || at + 3 >= base.length) return { title: base }
  return { artist: base.slice(0, at).trim(), title: base.slice(at + 3).trim() }
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

/** Where the page plays a track from (Settings' preview button). */
export function trackUrl(config: Config, file: string): string {
  return BUILT_IN.find((t) => t.file === file)?.url ?? artUrl(join(musicFolder(config), file))
}

/** What the page should play on each layer: the chosen track, a playlist's tracks, or every one shuffled, and a volume. */
export async function currentMusic(config: Config): Promise<Record<MusicKind, MusicLayer>> {
  const tracks = await musicTracks(config)
  const choices = musicChoices(config)
  const url = (file: string): string => trackUrl(config, file)
  const layer = (kind: MusicKind, volume: MusicVolume | undefined): MusicLayer => {
    const choice = choices[kind]
    const files = tracks[kind].map((t) => t.file)
    // A playlist's tracks in its order, less any no longer there.
    const list = kind === 'music' && choice?.startsWith(PLAYLIST) ? playlists(config).find((p) => PLAYLIST + p.id === choice) : undefined
    const chosen = list ? list.files.filter((f) => files.includes(f)) : choice === SHUFFLE ? files : files.filter((f) => f === choice)
    const names = chosen.map((file) => tracks[kind].find((t) => t.file === file)?.name ?? file)
    return { urls: chosen.map(url), files: chosen, names, shuffle: choice === SHUFFLE || !!list?.shuffle, volume: Math.min(1, MUSIC_VOLUME[volume ?? 'medium'] * (kind === 'music' ? MUSIC_GAIN : 1)) }
  }
  return { music: layer('music', config.musicVolume), ambience: layer('ambience', config.ambienceVolume) }
}

/** Copies an audio file into the music folder's Music or Ambience folder; returns its saved name (relative). */
export async function importMusic(config: Config, source: string, kind: MusicKind): Promise<string> {
  if (!AUDIO.test(source)) throw new Error("That isn't an audio file vaporTV can add")
  const target = await copyInto(source, join(musicFolder(config), KIND_FOLDER[kind]))
  return relative(musicFolder(config), target)
}
