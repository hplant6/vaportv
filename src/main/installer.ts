// Desktop Mode setup: puts vaporTV in place so it opens in Gaming Mode, and takes it
// back out again. Run from the AppImage's setup window (see setupMode in index.ts).
//
// Install:
//   1. copy the AppImage to ~/Applications (or update the copy an existing shortcut uses)
//   2. close Steam, add or update the "vaporTV" non-Steam shortcut (launch options and
//      library art included), and note its ids for the autostart script
//   3. install the Gaming Mode autostart service (optional)
//   4. with the admin password (one prompt): the controller wake rule (optional), the
//      Chrome policy that installs vaporTV for Netflix (when Netflix is set up), and the
//      keep list that carries both through SteamOS updates
//
// Repair (Gaming Mode, RepairDialog): step 4 again when a SteamOS update has taken its
// files, with the password typed on vaporTV's keyboard.

import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { app } from 'electron'
import type { InstallOptions, InstallStatus, SetupDamage } from '../shared/types'
import { addShortcutsNow, appState, installForApp } from './appSetup'
import { loadConfig } from './config'
import { appCatalog } from './customApps'
import { launchUrl } from './launch'
import { bootVideoSelected, installBootVideo, removeBootVideo } from './bootVideo'
import { NETFLIX_POLICY, netflixPolicy, netflixPolicyCurrent, stageNetflixExtension } from './netflixExtension'
import { shortcutAppId } from './library/emudeck'
import { steamRoot } from './library/recents'
import { activeUserDir } from './library/steam'
import { childObject, childString, dumpBinaryVdf, parseBinaryVdf, type VdfObject } from './library/vdf'

const run = promisify(execFile)

const NAME = 'vaporTV'
/** Stops Steam's overlay library loading into Electron, which crashes it. */
const LAUNCH_OPTIONS = 'LD_PRELOAD= %command%'
const APPLICATIONS = join(homedir(), 'Applications')
const SERVICE = 'steamtv-autostart.service'
const SERVICE_DIR = join(homedir(), '.config', 'systemd', 'user')
const AUTOSTART_BIN = join(homedir(), '.local', 'bin', 'steamtv-autostart')
const SHORTCUT_ENV = join(homedir(), '.config', 'steamtv', 'steam-shortcut.env')
const ICON = join(homedir(), '.local', 'share', 'steamtv', 'vaportv.png')
const WAKE_RULE = '/etc/udev/rules.d/90-vaportv-controller-wake.rules'
/** Earlier hand-installed rule (the developer's box); left alone if present. */
const OLD_WAKE_RULE = '/etc/udev/rules.d/90-steamtv-controller-wake.rules'
/**
 * SteamOS updates throw away every change in /etc that isn't on their keep list
 * (/usr/lib/rauc/atomic-update-keep.conf), moving it to /etc/previous: the 3.9.5 update
 * took the wake rule and the Netflix policy. Drop-ins here add to that list.
 */
const KEEP_LIST = '/etc/atomic-update.conf.d/vaportv.conf'
/** A shortcut that's vaporTV: by name, or by the AppImage it runs. */
const OURS = /(steamtv|vaportv)[^/]*\.AppImage/i

type Report = (line: string) => void

/** Files shipped beside the app (package.json extraResources): session/ and library-art/. */
function resource(folder: 'session' | 'library-art', file: string): string {
  if (app.isPackaged) return join(process.resourcesPath, folder, file)
  return join(app.getAppPath(), folder === 'library-art' ? join('build', 'library-art') : folder, file)
}

const quote = (path: string): string => `"${path}"`
const unquote = (s: string): string => s.replace(/^"|"$/g, '')

async function steamRunning(): Promise<boolean> {
  return run('pgrep', ['-x', 'steam']).then(
    () => true,
    () => false
  )
}

/** Gaming Mode is running: its whole session hangs off Steam, so Steam mustn't be closed. */
async function inGamingMode(): Promise<boolean> {
  return run('pgrep', ['^gamescope(-wl)?$']).then(
    () => true,
    () => false
  )
}

/** Asks Steam to quit and waits for it; Steam rewrites shortcuts.vdf as it exits. */
async function stopSteam(report: Report): Promise<void> {
  if (await inGamingMode()) throw new Error('Run setup from Desktop Mode: Steam has to close briefly, and Gaming Mode runs on it.')
  if (!(await steamRunning())) return
  report('Closing Steam for a moment…')
  spawn('steam', ['-shutdown'], { detached: true, stdio: 'ignore' }).unref()
  for (let i = 0; i < 60; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    if (!(await steamRunning())) return
  }
  throw new Error("Steam didn't close. Quit it from its menu, then try again.")
}

async function shortcutsFile(): Promise<string> {
  const userDir = await activeUserDir(steamRoot(await loadConfig()))
  if (!userDir) throw new Error("Couldn't find your Steam account. Sign in to Steam once, then try again.")
  return join(userDir, 'config', 'shortcuts.vdf')
}

/** Steam's shortcuts as an object, refusing to touch a file it couldn't write back unchanged. */
async function readShortcuts(file: string): Promise<VdfObject> {
  if (!existsSync(file)) return { shortcuts: {} }
  const data = await readFile(file)
  const parsed = parseBinaryVdf(data)
  if (!dumpBinaryVdf(parsed).equals(data)) throw new Error("Steam's shortcuts file has something vaporTV doesn't understand; left it alone.")
  return parsed
}

/** The vaporTV entry among Steam's shortcuts, if any: [key, entry]. */
function findOurs(shortcuts: VdfObject): [string, VdfObject] | undefined {
  for (const [key, entry] of Object.entries(shortcuts)) {
    if (typeof entry !== 'object') continue
    const name = childString(entry, 'AppName') ?? ''
    const exe = childString(entry, 'Exe') ?? ''
    if (name.toLowerCase() === NAME.toLowerCase() || OURS.test(exe)) return [key, entry]
  }
  return undefined
}

/** Sets a field, keeping however Steam spelled the key (AppName / appname). */
function setField(entry: VdfObject, name: string, value: string | number): void {
  const key = Object.keys(entry).find((k) => k.toLowerCase() === name.toLowerCase()) ?? name
  entry[key] = value
}

/** 64-bit id Steam launches a shortcut by. */
const gameId = (appid: number): string => ((BigInt(appid) << 32n) | 0x02000000n).toString()

export async function installStatus(): Promise<InstallStatus> {
  const config = await loadConfig()
  const file = await shortcutsFile().catch(() => null)
  const shortcuts = file ? childObject(await readShortcuts(file).catch(() => ({})), 'shortcuts') : undefined
  const ours = shortcuts && findOurs(shortcuts)
  return {
    running: process.env.APPIMAGE ?? null,
    appImage: ours ? unquote(childString(ours[1], 'Exe') ?? '') : null,
    shortcut: !!ours,
    autostart: existsSync(join(SERVICE_DIR, SERVICE)),
    wake: existsSync(WAKE_RULE) || existsSync(OLD_WAKE_RULE),
    netflix: existsSync(NETFLIX_POLICY),
    bootVideo: await bootVideoSelected(config),
    steamRunning: await steamRunning(),
    apps: await Promise.all(
      appCatalog(config).map(async (a) => ({ id: a.id, name: a.name, state: appState(a.id, (await launchUrl(config, 'app', a.id)) !== null) }))
    )
  }
}

/** Where the AppImage goes: where an existing vaporTV shortcut points (so it's updated), else ~/Applications. */
async function destination(): Promise<string> {
  const status = await installStatus()
  if (status.appImage && status.appImage.startsWith(APPLICATIONS + '/')) return status.appImage
  return join(APPLICATIONS, 'vaporTV.AppImage')
}

async function copyAppImage(target: string, report: Report): Promise<void> {
  const source = process.env.APPIMAGE
  if (!source) throw new Error('Run setup from the vaporTV AppImage.')
  if (source === target) return report(`vaporTV is already in ${dirname(target)}`)
  report(`Copying vaporTV to ${target}…`)
  await mkdir(dirname(target), { recursive: true })
  // Copy beside it, then swap, so a running copy never sees a half-written file.
  await copyFile(source, `${target}.new`)
  await chmod(`${target}.new`, 0o755)
  await run('mv', ['-f', `${target}.new`, target])
}

/**
 * Adds vaporTV to Steam's shortcuts (in place), or updates the existing entry to run
 * `exe`. Returns its app id and whether it was already there.
 */
export function upsertShortcut(vdf: VdfObject, exe: string, icon = ''): { appid: number; updated: boolean } {
  const shortcuts = (childObject(vdf, 'shortcuts') ?? (vdf.shortcuts = {})) as VdfObject
  const existing = findOurs(shortcuts)
  let appid: number
  if (existing) {
    // Keep its id (and so its art, play time and autostart id); just point it at this copy.
    const entry = existing[1]
    appid = Number(childString(entry, 'appid') ?? entry.appid)
    setField(entry, 'AppName', NAME)
    setField(entry, 'Exe', quote(exe))
    setField(entry, 'StartDir', quote(dirname(exe)))
    setField(entry, 'LaunchOptions', LAUNCH_OPTIONS)
    if (icon) setField(entry, 'icon', icon)
  } else {
    appid = shortcutAppId(quote(exe), NAME)
    const keys = Object.keys(shortcuts).map(Number).filter(Number.isFinite)
    shortcuts[String(keys.length ? Math.max(...keys) + 1 : 0)] = {
      appid,
      AppName: NAME,
      Exe: quote(exe),
      StartDir: quote(dirname(exe)),
      icon,
      ShortcutPath: '',
      LaunchOptions: LAUNCH_OPTIONS,
      IsHidden: 0,
      AllowDesktopConfig: 1,
      AllowOverlay: 1,
      OpenVR: 0,
      Devkit: 0,
      DevkitGameID: '',
      DevkitOverrideAppID: 0,
      LastPlayTime: 0,
      FlatpakAppID: '',
      tags: {}
    }
  }
  return { appid, updated: !!existing }
}

async function addShortcut(exe: string, report: Report): Promise<number> {
  const file = await shortcutsFile()
  const vdf = await readShortcuts(file)
  const { appid, updated } = upsertShortcut(vdf, exe, await installIcon())
  report(updated ? 'Updated the vaporTV shortcut in Steam' : 'Added vaporTV to your Steam library')
  await writeFile(`${file}.vaportv-backup`, await readFile(file).catch(() => Buffer.alloc(0)))
  await writeFile(file, dumpBinaryVdf(vdf))
  await addLibraryArt(dirname(file), appid)
  // Lets autostart launch vaporTV before it's ever been opened from Steam.
  await mkdir(dirname(SHORTCUT_ENV), { recursive: true })
  await writeFile(SHORTCUT_ENV, `STEAMTV_GAME_ID=${gameId(appid)}\nSTEAMTV_APPID=${appid}\n`)
  return appid
}

/** The app icon, kept outside the AppImage (whose files vanish when it closes) for Steam to show. */
async function installIcon(): Promise<string> {
  const source = resource('library-art', 'icon.png')
  if (!existsSync(source)) return ''
  await mkdir(dirname(ICON), { recursive: true })
  await copyFile(source, ICON)
  return ICON
}

/** vaporTV's capsule, banner and hero for Steam's library (grid folder, named by app id). */
async function addLibraryArt(configDir: string, appid: number): Promise<void> {
  const grid = join(configDir, 'grid')
  await mkdir(grid, { recursive: true })
  const art: [string, string][] = [
    ['capsule.png', `${appid}p.png`],
    ['header.png', `${appid}.png`],
    // The hero has the wordmark in it, so there's no separate logo for Steam to lay over it.
    ['hero.png', `${appid}_hero.png`]
  ]
  for (const [from, to] of art) {
    const source = resource('library-art', from)
    // Don't replace art someone chose themselves.
    if (existsSync(source) && !existsSync(join(grid, to))) await writeFile(join(grid, to), await readFile(source))
  }
}

async function installAutostart(report: Report): Promise<void> {
  await mkdir(dirname(AUTOSTART_BIN), { recursive: true })
  await mkdir(SERVICE_DIR, { recursive: true })
  await writeFile(AUTOSTART_BIN, await readFile(resource('session', 'steamtv-autostart.sh')))
  await chmod(AUTOSTART_BIN, 0o755)
  await writeFile(join(SERVICE_DIR, SERVICE), await readFile(resource('session', 'steamtv-autostart.service')))
  await run('systemctl', ['--user', 'daemon-reload'])
  await run('systemctl', ['--user', 'enable', SERVICE])
  report('vaporTV will open when Gaming Mode starts')
}

const WAKE_RULE_TEXT = [
  '# vaporTV: let a controller wake the box from sleep. Switching a wireless controller',
  "# on reconnects its USB receiver, which wakes the box when the hub it's on may wake it.",
  'ACTION=="add|change", SUBSYSTEM=="usb", ATTR{idVendor}=="1d6b", ATTR{power/wakeup}="enabled"',
  "# Bluetooth too (a remote's hub, a keyboard): USB Bluetooth adapters are class e0.",
  'ACTION=="add|change", SUBSYSTEM=="usb", ATTR{bDeviceClass}=="e0", ATTR{power/wakeup}="enabled"',
  ''
].join('\n')

const KEEP_LIST_TEXT = ['## vaporTV: keep its wake rule and Netflix policy through SteamOS updates', WAKE_RULE, NETFLIX_POLICY, ''].join('\n')

async function keepListCurrent(): Promise<boolean> {
  return (await readFile(KEEP_LIST, 'utf8').catch(() => '')) === KEEP_LIST_TEXT
}

/** Whether the user has a password: SteamOS comes without one, and sudo/pkexec need it. */
async function hasPassword(): Promise<boolean> {
  const status = await run('passwd', ['-S']).then(
    ({ stdout }) => stdout,
    () => ''
  )
  return !/^\S+ NP /m.test(status)
}

/**
 * What needs root: the wake rule (with wake enabled on the USB root hubs, switching a
 * controller on, its receiver reconnecting, wakes the box), the Chrome policy that
 * installs vaporTV for Netflix, and the keep list for both. The files are written to a
 * temp folder; the commands put them in place as root. Null when there's nothing to do.
 */
async function rootSteps(wake: boolean, netflix: boolean, report: Report): Promise<{ what: string; temp: string; steps: string[] } | null> {
  if (wake && (existsSync(OLD_WAKE_RULE) || (await readFile(WAKE_RULE, 'utf8').catch(() => '')) === WAKE_RULE_TEXT)) {
    report('Controller wake is already set up')
    wake = false
  }
  const policy = netflix && !(await netflixPolicyCurrent()) ? await netflixPolicy() : null
  if (netflix && !policy) report('Netflix remote control is already set up')
  // Also for a box set up before there was a keep list, once either file is in place.
  const keep = (wake || !!policy || existsSync(WAKE_RULE) || existsSync(NETFLIX_POLICY)) && !(await keepListCurrent())
  if (!wake && !policy && !keep) return null
  const what =
    [wake && 'controller wake', policy && 'Netflix remote control'].filter(Boolean).join(' and ') || 'keeping your setup through SteamOS updates'
  const temp = await mkdtemp(join(tmpdir(), 'vaportv-'))
  const steps: string[] = []
  if (wake) {
    await writeFile(join(temp, 'wake.rules'), WAKE_RULE_TEXT)
    steps.push(
      `install -m 644 ${join(temp, 'wake.rules')} ${WAKE_RULE}`,
      'udevadm control --reload',
      'udevadm trigger --subsystem-match=usb --action=change'
    )
  }
  if (policy) {
    await writeFile(join(temp, 'policy.json'), policy)
    steps.push(`install -D -m 644 ${join(temp, 'policy.json')} ${NETFLIX_POLICY}`)
  }
  if (keep) {
    await writeFile(join(temp, 'keep.conf'), KEEP_LIST_TEXT)
    steps.push(`install -D -m 644 ${join(temp, 'keep.conf')} ${KEEP_LIST}`)
  }
  return { what, temp, steps }
}

/** Setup's root step, under one password prompt (Desktop Mode has a polkit agent to ask). */
async function adminStep(wake: boolean, netflix: boolean, report: Report): Promise<void> {
  const plan = await rootSteps(wake, netflix, report)
  if (!plan) return
  if (!(await hasPassword())) {
    await rm(plan.temp, { recursive: true, force: true })
    return report(`Skipped ${plan.what}: it needs an admin password. Set one with \`passwd\` in Konsole, then run setup again.`)
  }
  report(`Asking for your password to set up ${plan.what}…`)
  const done = await run('pkexec', ['sh', '-c', plan.steps.join(' && ')]).then(
    () => true,
    () => false
  )
  await rm(plan.temp, { recursive: true, force: true })
  // Not worth failing the whole install over: everything else is already in place.
  report(
    done
      ? `Set up ${plan.what}`
      : `Skipped ${plan.what} (the password wasn't given). If you never set one, run \`passwd\` in Konsole, then run setup again.`
  )
}

/** Where a SteamOS update puts an /etc file it discards. */
const previous = (file: string): string => file.replace(/^\/etc\//, '/etc/previous/')

/**
 * What of setup's root half has gone missing, for the repair window in Gaming Mode: the
 * wake rule when a SteamOS update moved it to /etc/previous, the Netflix policy whenever
 * the Netflix tile works but the policy isn't this version's, and the keep list.
 */
export async function setupDamage(): Promise<SetupDamage> {
  const config = await loadConfig()
  const wake = !existsSync(WAKE_RULE) && !existsSync(OLD_WAKE_RULE) && existsSync(previous(WAKE_RULE))
  const netflix = (await launchUrl(config, 'app', 'netflix')) !== null && (await netflixPolicy()) !== null && !(await netflixPolicyCurrent())
  const keep = (wake || netflix || existsSync(WAKE_RULE) || existsSync(NETFLIX_POLICY)) && !(await keepListCurrent())
  return { wake, netflix, keep, password: await hasPassword() }
}

/**
 * Puts back what setupDamage found, as root. Gaming Mode has no polkit agent to ask for the
 * password, so vaporTV asks with its own keyboard and hands it to sudo. Null when it worked,
 * else why not.
 */
export async function repairSetup(password: string): Promise<string | null> {
  const damage = await setupDamage()
  const plan = await rootSteps(damage.wake, damage.netflix, () => {})
  if (!plan) return null
  const result = await new Promise<{ code: number | null; stderr: string }>((resolve) => {
    // -k: always check the password typed, never a cached sudo session; -p '': no prompt in stderr.
    const child = spawn('sudo', ['-S', '-k', '-p', '', 'sh', '-c', plan.steps.join(' && ')], { stdio: ['pipe', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', (err) => resolve({ code: null, stderr: err.message }))
    child.on('close', (code) => resolve({ code, stderr }))
    child.stdin.end(password + '\n')
  })
  await rm(plan.temp, { recursive: true, force: true })
  if (result.code === 0) return null
  if (/try again|incorrect password|no password/i.test(result.stderr)) return "That password didn't work"
  return result.stderr.trim().split('\n').pop() || 'It stopped with an error'
}

export async function install(options: InstallOptions, report: Report): Promise<void> {
  const config = await loadConfig()
  const apps = appCatalog(config).filter((a) => options.apps.includes(a.id))
  const target = await destination()
  await copyAppImage(target, report)
  // Downloads first, while Steam is still open; they can take a while.
  for (const a of apps) await installForApp(a.id, a.name, report)
  await stopSteam(report)
  await addShortcut(target, report)
  await addShortcutsNow(config, options.apps, report)
  // While Steam is closed: it rewrites config.vdf as it exits.
  if (options.bootVideo) {
    await installBootVideo(config)
    report("vaporTV's intro is now Steam's startup movie")
  }
  if (options.autostart) await installAutostart(report)
  const netflix = options.apps.includes('netflix') || (await launchUrl(config, 'app', 'netflix')) !== null
  if (netflix) await stageNetflixExtension()
  await adminStep(options.wake, netflix, report)
  report('Done. Return to Gaming Mode to start vaporTV.')
}

export async function uninstall(report: Report): Promise<void> {
  const config = await loadConfig()
  await stopSteam(report)
  const file = await shortcutsFile()
  const vdf = await readShortcuts(file)
  const shortcuts = childObject(vdf, 'shortcuts')
  const ours = shortcuts && findOurs(shortcuts)
  if (shortcuts && ours) {
    delete shortcuts[ours[0]]
    await writeFile(file, dumpBinaryVdf(vdf))
    report('Removed vaporTV from your Steam library')
  }
  if (existsSync(join(SERVICE_DIR, SERVICE))) {
    await run('systemctl', ['--user', 'disable', SERVICE]).catch(() => {})
    await rm(join(SERVICE_DIR, SERVICE), { force: true })
    await rm(AUTOSTART_BIN, { force: true })
    await run('systemctl', ['--user', 'daemon-reload']).catch(() => {})
    report('Gaming Mode no longer starts vaporTV')
  }
  await rm(SHORTCUT_ENV, { force: true })
  if (await bootVideoSelected(config)) {
    await removeBootVideo(config)
    report("Steam's own startup movie is back")
  }
  const rootFiles = (
    [
      [WAKE_RULE, 'controller wake'],
      [NETFLIX_POLICY, 'Netflix remote control']
    ] as const
  ).filter(([file]) => existsSync(file))
  if (rootFiles.length) {
    const what = rootFiles.map(([, name]) => name).join(' and ')
    report(`Asking for your password to remove ${what}…`)
    const files = [...rootFiles.map(([file]) => file), ...(existsSync(KEEP_LIST) ? [KEEP_LIST] : [])]
    await run('pkexec', ['rm', '-f', ...files]).then(
      () => report(`Removed ${what}`),
      () => report(`Couldn't remove ${what} (no password given)`)
    )
  }
  report(`Done. Your settings stay in ~/.config/steamtv; delete ${basename(process.env.APPIMAGE ?? 'the AppImage')} to finish.`)
}

/** Back to Gaming Mode, as Desktop Mode's own shortcut does. */
export async function returnToGamingMode(): Promise<void> {
  spawn('steamos-session-select', ['gamescope'], { detached: true, stdio: 'ignore' }).unref()
}
