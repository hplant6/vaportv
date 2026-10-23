import { readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { extname, join } from 'node:path'
import type { CustomBackdrop } from '../shared/types'
import { copyInto, IMAGE, VIDEO } from './browse'
import { artUrl } from './library/art'

// Your own backdrops: pictures and videos in BACKDROP_FOLDER, added from Settings → Backdrop
// (or put there by hand). A video plays muted on a loop; a picture holds still.

export const BACKDROP_FOLDER = join(homedir(), 'Pictures', 'vaporTV Backdrops')

/** The pictures and videos in the folder, by name. */
export async function customBackdrops(): Promise<CustomBackdrop[]> {
  const names = await readdir(BACKDROP_FOLDER).catch(() => [] as string[])
  return names
    .filter((name) => !name.startsWith('.') && (IMAGE.test(name) || VIDEO.test(name)))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((file) => ({
      file,
      name: file.slice(0, -extname(file).length),
      kind: VIDEO.test(file) ? ('video' as const) : ('image' as const),
      url: artUrl(join(BACKDROP_FOLDER, file))
    }))
}

/** Copies a picture or video into the folder; returns its file name there. */
export async function addBackdrop(source: string): Promise<string> {
  if (!IMAGE.test(source) && !VIDEO.test(source)) throw new Error("That isn't a picture or video vaporTV can use")
  const target = await copyInto(source, BACKDROP_FOLDER)
  return target.slice(BACKDROP_FOLDER.length + 1)
}
