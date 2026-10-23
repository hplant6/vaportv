import { copyFile, mkdir, readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'
import type { BrowseEntry, BrowseKind } from '../shared/types'

// Adding your own files (music, backdrops): a browser over this machine's home folders and
// any USB drive or SD card, and copying the file picked into vaporTV's folder for it.

export const AUDIO = /\.(mp3|ogg|oga|flac|wav|m4a|aac|opus)$/i
export const IMAGE = /\.(jpe?g|png|webp|gif|avif)$/i
export const VIDEO = /\.(mp4|webm|mkv|mov|m4v)$/i

/** Which files each kind of browsing shows. */
const SHOWS: Record<BrowseKind, (name: string) => boolean> = {
  audio: (name) => AUDIO.test(name),
  backdrop: (name) => IMAGE.test(name) || VIDEO.test(name)
}

/** Where SteamOS (and most desktops) mount USB drives and SD cards. */
function driveParents(): string[] {
  const user = userInfo().username
  return [join('/run/media', user), '/run/media', '/media', join('/media', user)]
}

/** The browser and the copier only look inside home and the drive mounts. */
export function allowed(path: string): boolean {
  const full = resolve(path)
  return [homedir(), '/run/media', '/media'].some((root) => full === root || full.startsWith(root + sep))
}

/** The places to start from: home folders that exist (but `skip`, vaporTV's own), then each mounted drive. */
async function roots(skip: string[]): Promise<BrowseEntry[]> {
  const home = homedir()
  const own = new Set(skip.map((p) => resolve(p)))
  const places = [
    { name: 'Downloads', path: join(home, 'Downloads') },
    { name: 'Desktop', path: join(home, 'Desktop') },
    { name: 'Pictures', path: join(home, 'Pictures') },
    { name: 'Videos', path: join(home, 'Videos') },
    { name: 'Home', path: home }
  ].filter((p) => existsSync(p.path) && !own.has(resolve(p.path)))
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

/**
 * A folder's subfolders, then the files of that kind (hidden ones left out); with no folder,
 * the places to start (less `skip`, the folders the files are copied into).
 */
export async function browseFiles(dir: string | null, kind: BrowseKind, skip: string[] = []): Promise<BrowseEntry[]> {
  if (!dir) return roots(skip)
  if (!allowed(dir)) throw new Error('That folder is outside home and the drives')
  const visible = (await readdir(dir, { withFileTypes: true })).filter((e) => !e.name.startsWith('.'))
  const byName = (a: BrowseEntry, b: BrowseEntry): number => a.name.localeCompare(b.name, undefined, { numeric: true })
  const folders = visible.filter((e) => e.isDirectory()).map((e) => ({ name: e.name, path: join(dir, e.name), kind: 'folder' as const }))
  const files = visible.filter((e) => e.isFile() && SHOWS[kind](e.name)).map((e) => ({ name: e.name, path: join(dir, e.name), kind: 'file' as const }))
  return [...folders.sort(byName), ...files.sort(byName)]
}

/** Copies a file into `folder` (made if needed) without overwriting one of the same name ("Name (2)"); returns where it went. */
export async function copyInto(source: string, folder: string): Promise<string> {
  if (!allowed(source) || !(await stat(source)).isFile()) throw new Error("vaporTV can't add that file")
  // Already there (picked from vaporTV's own folder): nothing to copy.
  if (resolve(dirname(source)) === resolve(folder)) return source
  await mkdir(folder, { recursive: true })
  const ext = extname(source)
  const stem = basename(source, ext)
  let target = join(folder, basename(source))
  for (let n = 2; existsSync(target); n++) target = join(folder, `${stem} (${n})${ext}`)
  await copyFile(source, target)
  return target
}
