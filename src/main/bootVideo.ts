import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import type { Config } from './config'
import { childString, parseTextVdf } from './library/vdf'
import { steamRoot } from './library/recents'

// vaporTV's intro as Steam's startup movie, so the box boots into it. Steam lists any
// .webm in config/uioverrides/movies under Settings → Customization → Startup Movie, and
// keeps the choice in config/config.vdf as a path relative to its config folder.

/** As Steam records it (Customization → StartupMovie → LocalPath). */
export const BOOT_VIDEO_PATH = '/uioverrides/movies/vaportv.webm'
/** How long after Steam starts its startup movie can still have just played. */
const BOOT_WINDOW_S = 150

const configVdf = (config: Config): string => join(steamRoot(config), 'config', 'config.vdf')
const movieFile = (config: Config): string => join(steamRoot(config), 'config', BOOT_VIDEO_PATH)

/**
 * Steam's config.vdf with its startup movie set to `localPath` ('' for none, back to
 * Steam's own), leaving everything else as written. Values are set in place; a missing
 * StartupMovie block (or Customization block around it) is added.
 */
export function withStartupMovie(text: string, localPath: string): string {
  const values: [string, string][] = [
    ['Shuffle', '0'],
    ['MovieID', '0'],
    ['LocalPath', localPath]
  ]
  const block = /^([ \t]*)"StartupMovie"\s*\{([^}]*)\}/m.exec(text)
  if (block) {
    const indent = `${block[1]}\t`
    let body = block[2]
    for (const [key, value] of values) {
      const line = new RegExp(`^(\\s*"${key}"\\s*)"[^"]*"`, 'm')
      body = line.test(body) ? body.replace(line, `$1"${value}"`) : `${body.replace(/\s*$/, '')}\n${indent}"${key}"\t\t"${value}"\n${block[1]}`
    }
    return text.slice(0, block.index) + `${block[1]}"StartupMovie"\n${block[1]}{${body}}` + text.slice(block.index + block[0].length)
  }
  const movie = (indent: string): string =>
    `${indent}"StartupMovie"\n${indent}{\n${values.map(([k, v]) => `${indent}\t"${k}"\t\t"${v}"\n`).join('')}${indent}}\n`
  const customization = /^([ \t]*)"Customization"\s*\{\n?/m.exec(text)
  if (customization) {
    const at = customization.index + customization[0].length
    return text.slice(0, at) + movie(`${customization[1]}\t`) + text.slice(at)
  }
  // No Customization yet: a new one, last in the root object.
  const end = text.lastIndexOf('}')
  if (end < 0) throw new Error("Steam's config.vdf isn't in the expected shape")
  return `${text.slice(0, end)}\t"Customization"\n\t{\n${movie('\t\t')}\t}\n${text.slice(end)}`
}

/** Whether Steam's startup movie is vaporTV's. */
export async function bootVideoSelected(config: Config): Promise<boolean> {
  const text = await readFile(configVdf(config), 'utf8').catch(() => '')
  const settings = text && parseTextVdf(text)
  if (!settings) return false
  const root = Object.values(settings)[0]
  if (!root || typeof root !== 'object') return false
  return childString(root, 'Customization', 'StartupMovie', 'LocalPath') === BOOT_VIDEO_PATH && existsSync(movieFile(config))
}

/** Whether Steam started within the last couple of minutes (so its startup movie has just played). */
export async function steamJustStarted(): Promise<boolean> {
  const uptime = Number((await readFile('/proc/uptime', 'utf8').catch(() => '0')).split(' ')[0])
  for (const pid of await readdir('/proc').catch(() => [] as string[])) {
    if (!/^\d+$/.test(pid)) continue
    if ((await readFile(`/proc/${pid}/comm`, 'utf8').catch(() => '')).trim() !== 'steam') continue
    // Field 22 (after the parenthesised name): start time in clock ticks (100 a second) since boot.
    const stat = await readFile(`/proc/${pid}/stat`, 'utf8').catch(() => '')
    const started = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]) / 100
    if (Number.isFinite(started) && uptime - started < BOOT_WINDOW_S) return true
  }
  return false
}

/** The intro shipped with the page (out/renderer/intro), inside the app. */
function shippedIntro(): string {
  return join(app.getAppPath(), 'out', 'renderer', 'intro', 'vaportv.webm')
}

/** Copies the intro in and makes it Steam's startup movie. Steam must be closed (it rewrites config.vdf on exit). */
export async function installBootVideo(config: Config): Promise<void> {
  await mkdir(join(steamRoot(config), 'config', 'uioverrides', 'movies'), { recursive: true })
  // Read, then written: it may be inside the app's archive, where copyFile can't reach.
  await writeFile(movieFile(config), await readFile(shippedIntro()))
  const file = configVdf(config)
  await writeFile(file, withStartupMovie(await readFile(file, 'utf8'), BOOT_VIDEO_PATH))
}

/** Steam's own startup movie again, if vaporTV's was chosen. Steam must be closed. */
export async function removeBootVideo(config: Config): Promise<void> {
  if (await bootVideoSelected(config)) {
    const file = configVdf(config)
    await writeFile(file, withStartupMovie(await readFile(file, 'utf8'), ''))
  }
  await rm(movieFile(config), { force: true })
}
