// Setting up the app tiles on a box that doesn't have them yet.
//
// Two kinds of app:
//   - real programs that work with a controller (VacuumTube, Emby Theater, Jellyfin, Plex HTPC):
//     installed from Flathub for this user (no password) and launched directly, like the
//     emulators, so they need no Steam shortcut;
//   - streaming websites: Chrome (from Flathub) in kiosk mode, as a Steam shortcut, so
//     Steam Input can turn the controller into a mouse and keyboard for them.
// Steam only reads shortcuts at start, so adding one means closing Steam: in Desktop
// Mode the setup window does it; in Gaming Mode Steam is restarted around the change.

import { execFile, spawn } from 'node:child_process'
import { chmod, copyFile, mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { app, screen } from 'electron'
import type { AppState } from '../shared/types'
import type { Config } from './config'
import { flatpakInstalled } from './library/emulators'
import { steamRoot } from './library/recents'
import { activeUserDir } from './library/steam'

const exec = promisify(execFile)

export const BROWSER = 'com.google.Chrome'
/** What a Flatpak needs to see a controller: the input devices, and udev's list of them. */
const CONTROLLER_ACCESS = ['--device=all', '--filesystem=/run/udev:ro']
const FLATHUB = 'https://dl.flathub.org/repo/flathub.flatpakrepo'

type Recipe =
  /** A website, opened by Chrome in kiosk mode from a Steam shortcut named `shortcut`. */
  | { kind: 'web'; shortcut: string; url: string }
  /**
   * A Flathub program that works with a controller. `controller`: its sandbox doesn't
   * let it see controllers by itself (Jellyfin ships with only the GPU), so
   * it's given input devices, and udev's database (Chromium finds pads through it), when
   * installed and when run.
   */
  | { kind: 'flatpak'; flatpak: string; program: string; args?: string[]; controller?: boolean }
  /** Comes with EmuDeck. */
  | { kind: 'emudeck' }

const RECIPES: Record<string, Recipe> = {
  netflix: { kind: 'web', shortcut: 'Netflix', url: 'https://www.netflix.com/browse' },
  disney: { kind: 'web', shortcut: 'Disney+', url: 'https://www.disneyplus.com/home' },
  prime: { kind: 'web', shortcut: 'Prime Video', url: 'https://www.amazon.com/gp/video/storefront' },
  max: { kind: 'web', shortcut: 'Max', url: 'https://play.hbomax.com' },
  hulu: { kind: 'web', shortcut: 'Hulu', url: 'https://www.hulu.com/hub/home' },
  paramount: { kind: 'web', shortcut: 'Paramount+', url: 'https://www.paramountplus.com/home/' },
  peacock: { kind: 'web', shortcut: 'Peacock', url: 'https://www.peacocktv.com/watch/home' },
  tubi: { kind: 'web', shortcut: 'Tubi', url: 'https://tubitv.com/home' },
  youtube: { kind: 'flatpak', flatpak: 'rocks.shy.VacuumTube', program: 'VacuumTube' },
  // Emby Theater's Flatpak ignores gamepads whatever its sandbox allows: Steam Input's
  // keyboard layout (arrows, Enter, Escape) is what drives it.
  emby: { kind: 'flatpak', flatpak: 'media.emby.EmbyTheater', program: 'Emby Theater' },
  jellyfin: { kind: 'flatpak', flatpak: 'org.jellyfin.JellyfinDesktop', program: 'Jellyfin Desktop', args: ['--tv', '--fullscreen'], controller: true },
  // Plex's TV app (the 10-foot one); its sandbox already sees controllers.
  plex: { kind: 'flatpak', flatpak: 'tv.plex.PlexHTPC', program: 'Plex HTPC' },
  esde: { kind: 'emudeck' }
}

/**
 * Whether a tile opens, and if not, how it gets set up. `hasShortcut`: whether a Steam
 * shortcut for it was found (see launchUrl).
 */
export function appState(id: string, hasShortcut: boolean): AppState {
  if (hasShortcut) return { ready: true }
  const recipe = RECIPES[id]
  if (recipe?.kind === 'flatpak') return flatpakInstalled(recipe.flatpak) ? { ready: true } : { ready: false, setup: 'install', program: recipe.program }
  if (recipe?.kind === 'web') return { ready: false, setup: 'web' }
  if (recipe?.kind === 'emudeck') return { ready: false, setup: 'emudeck' }
  return { ready: false, setup: 'shortcut' }
}

/** A Flathub program with no Steam shortcut: what runs it directly, if it's installed. */
export function directCommand(id: string): { command: string; args: string[] } | null {
  const recipe = RECIPES[id]
  if (recipe?.kind !== 'flatpak' || !flatpakInstalled(recipe.flatpak)) return null
  return { command: 'flatpak', args: ['run', ...(recipe.controller ? CONTROLLER_ACCESS : []), recipe.flatpak, ...(recipe.args ?? [])] }
}

type Report = (line: string) => void

/** `flatpak install` for this user, from Flathub, reporting its progress. */
async function installFlatpak(id: string, name: string, report: Report): Promise<void> {
  if (flatpakInstalled(id)) return
  await exec('flatpak', ['remote-add', '--user', '--if-not-exists', 'flathub', FLATHUB])
  report(`Installing ${name}…`)
  await new Promise<void>((resolve, reject) => {
    const child = spawn('flatpak', ['install', '--user', '--noninteractive', '-y', 'flathub', id], { stdio: ['ignore', 'pipe', 'pipe'] })
    let lastPercent = -1
    const onData = (chunk: Buffer): void => {
      // Progress comes as lines redrawn with \r; pass on whole percents only.
      for (const line of chunk.toString().split(/[\r\n]+/)) {
        const percent = Number(/(\d{1,3})%/.exec(line)?.[1] ?? NaN)
        if (Number.isFinite(percent) && percent !== lastPercent) {
          lastPercent = percent
          report(`Installing ${name}… ${percent}%`)
        }
      }
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('error', reject)
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`Couldn't install ${name} (flatpak exited ${code}).`))))
  })
  report(`${name} installed`)
}

/** Installs what an app needs: the program itself, or Chrome for a website. */
export async function installForApp(id: string, name: string, report: Report): Promise<void> {
  const recipe = RECIPES[id]
  if (recipe?.kind === 'flatpak') {
    await installFlatpak(recipe.flatpak, recipe.program, report)
    // Kept for every launch, Steam shortcuts included: they run plain `flatpak run`.
    if (recipe.controller) await exec('flatpak', ['override', '--user', ...CONTROLLER_ACCESS, recipe.flatpak])
    return
  }
  if (recipe?.kind === 'web') return installFlatpak(BROWSER, 'Google Chrome', report)
  throw new Error(`vaporTV can't set ${name} up by itself.`)
}

/**
 * How much Chrome should enlarge websites for this screen: the sites are laid out for
 * a desktop, so on a 4K TV their text is tiny unless drawn at 2x (as on a 1080p screen).
 */
export function tvScale(): number {
  const display = screen.getPrimaryDisplay()
  const height = Math.round(display.size.height * display.scaleFactor)
  return Math.max(1, Math.round((height / 1080) * 4) / 4)
}

/** Websites among `ids`, as the Steam shortcuts to add for them, drawn at `scale`. */
export function webShortcuts(ids: string[], scale = 1): { name: string; exe: string; startDir: string; launchOptions: string }[] {
  return ids.flatMap((id) => {
    const recipe = RECIPES[id]
    if (recipe?.kind !== 'web') return []
    const zoom = scale > 1 ? [`--force-device-scale-factor=${scale}`] : []
    const args = ['run', BROWSER, '--kiosk', '--start-fullscreen', '--no-first-run', '--noerrdialogs', ...zoom, recipe.url]
    return [{ name: recipe.shortcut, exe: '"flatpak"', startDir: './', launchOptions: args.map((a) => `"${a}"`).join(' ') }]
  })
}

/** The shortcut helper (session/add-app-shortcuts.py), copied out of the AppImage so it outlives vaporTV. */
async function helper(): Promise<string> {
  const source = app.isPackaged ? join(process.resourcesPath, 'session', 'add-app-shortcuts.py') : join(app.getAppPath(), 'session', 'add-app-shortcuts.py')
  const target = join(homedir(), '.local', 'share', 'steamtv', 'add-app-shortcuts.py')
  await mkdir(join(homedir(), '.local', 'share', 'steamtv'), { recursive: true })
  await copyFile(source, target)
  await chmod(target, 0o755)
  return target
}

async function shortcutsFile(config: Config): Promise<string> {
  const userDir = await activeUserDir(steamRoot(config))
  if (!userDir) throw new Error("Couldn't find your Steam account.")
  return join(userDir, 'config', 'shortcuts.vdf')
}

async function entriesFile(entries: ReturnType<typeof webShortcuts>): Promise<string> {
  const file = join(homedir(), '.cache', 'steamtv', `app-shortcuts-${Date.now()}.json`)
  await mkdir(join(homedir(), '.cache', 'steamtv'), { recursive: true })
  await writeFile(file, JSON.stringify(entries))
  return file
}

/** Adds the shortcuts now. Steam must already be closed (the Desktop Mode setup window). */
export async function addShortcutsNow(config: Config, ids: string[], report: Report): Promise<void> {
  const entries = webShortcuts(ids, tvScale())
  if (!entries.length) return
  const { stdout } = await exec('python3', [await helper(), await shortcutsFile(config), await entriesFile(entries)])
  for (const line of stdout.split('\n').filter(Boolean)) report(line.replace(/^added /, 'Added ').replace(/^updated /, 'Updated '))
}

/**
 * Gaming Mode: hands the shortcuts to a helper that runs on its own (a transient user
 * service), then closes Steam. The helper writes them once Steam is gone; Gaming Mode
 * brings Steam back, and the helper then opens vaporTV again (through its autostart).
 */
export async function addShortcutsWithRestart(config: Config, ids: string[]): Promise<void> {
  const entries = webShortcuts(ids, tvScale())
  if (!entries.length) return
  const args = [await helper(), await shortcutsFile(config), await entriesFile(entries), '--wait-for-steam-exit', '--relaunch']
  await exec('systemd-run', ['--user', '--collect', '--quiet', `--unit=vaportv-app-shortcuts-${Date.now()}`, 'python3', ...args])
  spawn('steam', ['-shutdown'], { detached: true, stdio: 'ignore' }).unref()
}

/** Whether Steam's Gaming Mode (gamescope; gamescope-wl on current SteamOS) is what's running. */
export async function inGamingMode(): Promise<boolean> {
  return exec('pgrep', ['^gamescope(-wl)?$']).then(
    () => true,
    () => false
  )
}
