import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

// Disc-image libraries (Xbox 360, GameCube): a folder of No-Intro named images,
// some grouped a level down, multi-disc games as several files.

export interface DiscGame {
  /** `<platform>:<file, relative to the library root>` */
  id: string
  title: string
  /** What the emulator opens: the boot disc, or a .m3u disc list. */
  path: string
  /** Every disc image of a multi-disc game, in disc order (just `path` for one disc). */
  discs: string[]
}

export interface DiscOptions {
  /** Platform prefix for ids. */
  platform: string
  /** Disc image extensions the emulator opens. */
  images: RegExp
  /** Whether the emulator takes .m3u disc lists (then a game's list is what's opened). */
  playlists: boolean
  /** Name overrides by file name (relative to the root). */
  titles?: Record<string, string>
  /** How many folder levels below the root to look in (default 1). */
  depth?: number
}

// Discs that aren't games on their own.
const NOT_A_GAME = /add-on content|bonus disc|demo disc|preview disc/i
// Discs that only install data; the game boots from another disc.
const INSTALL_DISC = /install(ation)? disc/i
// The disc a multi-disc game boots from, when it's labelled.
const PLAY_DISC = /\((play|game disc)\)/i
const DISC = /\(disc\s*(\d+)\)/i

/**
 * A title from a No-Intro style name: "BioShock 2 (USA, Europe) (En,Fr,Es).iso"
 * → "BioShock 2". Regions, languages, revisions and disc numbers are all in brackets.
 */
export function cleanNoIntroTitle(file: string): string {
  return (
    file
      .replace(/\.[a-z0-9]{2,4}$/i, '')
      .replace(/\s*[([].*$/, '')
      // TOSEC-style version numbers: "Aqua GT v1.000"
      .replace(/\s+v\d+(\.\d+)*$/i, '')
      .replace(/\s+/g, ' ')
      .trim()
      // No-Intro puts articles last: "House of the Dead 2, The"
      .replace(/^(.*), (The|A|An)$/, '$2 $1')
  )
}

// When one disc exists in several formats, the one to use: a single compressed
// file before track lists.
const FORMAT_PREFERENCE = ['chd', 'rvz', 'gdi', 'cue', 'cdi', 'iso']

function formatRank(file: string): number {
  const rank = FORMAT_PREFERENCE.indexOf(file.split('.').pop()!.toLowerCase())
  return rank < 0 ? FORMAT_PREFERENCE.length : rank
}

/** One file per disc number: copies of the same disc in other formats are dropped. */
function distinctDiscs(files: string[]): string[] {
  const byDisc = new Map<number, string>()
  for (const file of [...files].sort((a, b) => formatRank(a) - formatRank(b))) {
    const disc = Number(DISC.exec(file)?.[1] ?? 1)
    if (!byDisc.has(disc)) byDisc.set(disc, file)
  }
  return [...byDisc.entries()].sort(([a], [b]) => a - b).map(([, file]) => file)
}

/**
 * Which disc to open for a multi-disc game: one labelled "(Play)" or "(Game Disc)"
 * (GTA V's and Watch Dogs' first discs only install), else the lowest-numbered
 * that isn't an install disc.
 */
function bootDisc(files: string[]): string {
  const disc = (file: string): number => Number(DISC.exec(file)?.[1] ?? 1)
  const playable = files.filter((file) => !INSTALL_DISC.test(file))
  return (
    files.find((file) => PLAY_DISC.test(file)) ??
    [...(playable.length ? playable : files)].sort((a, b) => disc(a) - disc(b))[0]
  )
}

/** One entry per game, however many discs it has. */
export async function scanDiscImages(root: string, options: DiscOptions): Promise<DiscGame[]> {
  // Files in the folder and in folders below it (a game's discs grouped together,
  // e.g. "Resident Evil 4 (USA).m3u/", or "Resident Evil 2/… (Disc 1)/").
  const files: string[] = []
  const walk = async (dir: string, level: number): Promise<void> => {
    for (const entry of await readdir(join(root, dir), { withFileTypes: true }).catch(() => [])) {
      const path = dir ? join(dir, entry.name) : entry.name
      if (!entry.isDirectory()) files.push(path)
      else if (level < (options.depth ?? 1)) await walk(path, level + 1)
    }
  }
  await walk('', 0)
  const name = (file: string): string => file.split('/').pop()!
  const isList = (file: string): boolean => options.playlists && /\.m3u$/i.test(name(file))

  const byTitle = new Map<string, string[]>()
  for (const file of files.filter((f) => (options.images.test(f) || isList(f)) && !NOT_A_GAME.test(name(f)))) {
    const title = cleanNoIntroTitle(name(file))
    byTitle.set(title, [...(byTitle.get(title) ?? []), file])
  }
  return [...byTitle.entries()]
    .map(([title, candidates]) => {
      const images = distinctDiscs(candidates.filter((f) => options.images.test(f)))
      const file = candidates.find(isList) ?? bootDisc(images)
      const discs = images.map((f) => join(root, f))
      return {
        id: `${options.platform}:${file}`,
        title: options.titles?.[file] ?? title,
        path: join(root, file),
        discs: discs.length ? discs : [join(root, file)]
      }
    })
    .sort((a, b) => a.title.localeCompare(b.title))
}
