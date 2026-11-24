import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

// The audio and subtitles picked in the player, remembered for next time: per film, and per
// show for episodes (so the next episode plays the same way). A film without a pick of its own
// gets the audio language picked last, when it has one in it. Kept in
// ~/.config/steamtv/track-choices.json. Tracks are found again by their stream index and name
// (a film's own), or by name and then language (another episode, where the indexes can differ).

const FILE = join(homedir(), '.config', 'steamtv', 'track-choices.json')
/** Only so many films and shows are kept: the ones picked for most recently. */
const KEEP = 400

export interface TrackChoice {
  index: number
  name: string
  language?: string
}

export interface Remembered {
  audio?: TrackChoice
  /** null: subtitles off. */
  subtitle: TrackChoice | null
  at: number
}

export interface TrackMemory {
  items: Record<string, Remembered>
  /** The audio language picked last (Emby's code, "eng"): a film with nothing remembered starts in it, if it has it. */
  audioLanguage?: string
}

/** A server's track, as the player's told about it. */
export interface Stream {
  index: number
  name: string
  language?: string
}

export async function loadTrackMemory(file = FILE): Promise<TrackMemory> {
  try {
    const data = JSON.parse(await readFile(file, 'utf8')) as Partial<TrackMemory>
    return { items: data.items ?? {}, audioLanguage: data.audioLanguage }
  } catch {
    return { items: {} }
  }
}

export async function saveTrackMemory(memory: TrackMemory, file = FILE): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  const part = `${file}.part`
  await writeFile(part, JSON.stringify(memory, null, 1))
  await rename(part, file)
}

/** The stream that's the one remembered: the same index and name, else the same name, else the same language. */
export function findStream(streams: Stream[], choice: TrackChoice): Stream | undefined {
  return (
    streams.find((s) => s.index === choice.index && s.name === choice.name) ??
    streams.find((s) => s.name === choice.name) ??
    (choice.language ? streams.find((s) => s.language === choice.language) : undefined)
  )
}

/** What to start with for `key` (stream indexes; subtitle -1 is off), where something's remembered; unset, the server's pick stands. */
export function recall(memory: TrackMemory, key: string, audio: Stream[], subtitles: Stream[]): { audio?: number; subtitle?: number } {
  const r = memory.items[key]
  const out: { audio?: number; subtitle?: number } = {}
  const a = r?.audio ? findStream(audio, r.audio) : memory.audioLanguage ? audio.find((s) => s.language === memory.audioLanguage) : undefined
  if (a) out.audio = a.index
  if (r) {
    if (r.subtitle === null) out.subtitle = -1
    else {
      const s = findStream(subtitles, r.subtitle)
      if (s) out.subtitle = s.index
    }
  }
  return out
}

/** Remembers what's playing for `key` (picked in the player): stream indexes, subtitle -1 off; unset, what was remembered stays. */
export function remember(
  memory: TrackMemory,
  key: string,
  audio: Stream[],
  subtitles: Stream[],
  audioIndex: number | undefined,
  subtitleIndex: number | undefined,
  now: number
): TrackMemory {
  const pickedAudio = audio.find((s) => s.index === audioIndex)
  const pickedSubtitle = subtitleIndex === -1 ? null : subtitles.find((s) => s.index === subtitleIndex)
  if (pickedSubtitle === undefined && !pickedAudio) return memory
  const choice = (s: Stream): TrackChoice => ({ index: s.index, name: s.name, ...(s.language ? { language: s.language } : {}) })
  const before = memory.items[key]
  const entry: Remembered = {
    audio: pickedAudio ? choice(pickedAudio) : before?.audio,
    subtitle: pickedSubtitle === undefined ? (before?.subtitle ?? null) : pickedSubtitle && choice(pickedSubtitle),
    at: now
  }
  const items = Object.entries({ ...memory.items, [key]: entry })
    .sort((x, y) => y[1].at - x[1].at)
    .slice(0, KEEP)
  return { items: Object.fromEntries(items), audioLanguage: pickedAudio?.language ?? memory.audioLanguage }
}
