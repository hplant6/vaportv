import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

// Chrome's own settings for the streaming websites vaporTV opens in it (Netflix, Disney+...): the
// Flathub Chrome reads extra command-line flags from chrome-flags.conf, a flag a line, at each start,
// so they apply without editing Steam's shortcuts (which needs Steam closed) or a system policy
// (which needs the admin password). Lines already there (someone's own) stay.
//
// Sound without a click first: Chrome only lets a page play sound once someone has clicked or
// pressed a key on it, and a controller (read through the Gamepad API) doesn't count, so Netflix
// started its videos muted and its unmute button couldn't turn the sound back on. A TV has no one
// to click; the sound should simply play.

const FLAGS_FILE = join(homedir(), '.var', 'app', 'com.google.Chrome', 'config', 'chrome-flags.conf')
export const WANTED_FLAGS = ['--autoplay-policy=no-user-gesture-required']

/** The file's text with every wanted flag in it (any already set to something else replaced); null if it has them all. */
export function withFlags(text: string, wanted: string[] = WANTED_FLAGS): string | null {
  const lines = text.split('\n').filter((line, i, all) => line.trim() || i < all.length - 1)
  let changed = false
  for (const flag of wanted) {
    const name = flag.split('=')[0]
    const at = lines.findIndex((line) => line.trim().split('=')[0] === name)
    if (at >= 0 && lines[at].trim() === flag) continue
    if (at >= 0) lines[at] = flag
    else lines.push(flag)
    changed = true
  }
  return changed ? `${lines.filter((line) => line.trim()).join('\n')}\n` : null
}

/** Puts vaporTV's flags in Chrome's flags file, once Chrome (the Flatpak) is installed. They apply from its next start. */
export async function ensureChromeFlags(): Promise<void> {
  if (!existsSync(join(homedir(), '.var', 'app', 'com.google.Chrome'))) return
  const next = withFlags(await readFile(FLAGS_FILE, 'utf8').catch(() => ''))
  if (next === null) return
  await mkdir(dirname(FLAGS_FILE), { recursive: true })
  await writeFile(FLAGS_FILE, next)
}
