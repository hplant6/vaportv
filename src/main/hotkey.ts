import { execFile } from 'node:child_process'
import { createReadStream, type ReadStream } from 'node:fs'
import { readdir, readFile, readlink } from 'node:fs/promises'

// Hold Select + Start to always get back to steamtv: it closes whatever is in front
// (a game, a streaming app, an emulator), or just brings steamtv forward over
// Steam's own UI. Read straight from the controllers' evdev
// devices, so it works while another app has focus.

const BTN_SELECT = 0x13a
const BTN_START = 0x13b
const EV_KEY = 1
/** struct input_event on 64-bit Linux: timeval (16) + type (2) + code (2) + value (4). */
const EVENT_SIZE = 24
const HOLD_MS = 1000
const RESCAN_MS = 5000
const KILL_GRACE_MS = 5000
/** Ryujinx ignores SIGTERM (it asks "are you sure?"), so emulators get a shorter wait. */
const EMULATOR_GRACE_MS = 1500

/** Steam's own UI in gamescope's app list. */
const STEAM_UI_APPID = 769
/**
 * vaporTV's own Steam shortcut's 32-bit app id, from what Steam passes when it launches
 * it (SteamAppId, or the 64-bit SteamGameId). Null when not started from Steam.
 */
export const STEAMTV_APPID: number | null = process.env.SteamAppId && process.env.SteamAppId !== '0'
  ? Number(process.env.SteamAppId)
  : process.env.SteamGameId
    ? Number(BigInt(process.env.SteamGameId) >> 32n)
    : null

type Log = (line: string) => void

interface Watched {
  stream: ReadStream
  held: Set<number>
}

/** Controllers (devices with a joystick handler) by event node, from the kernel's list. */
async function controllerDevices(): Promise<string[]> {
  const text = await readFile('/proc/bus/input/devices', 'utf8').catch(() => '')
  return text
    .split('\n\n')
    .map((block) => /^H: Handlers=(.*)$/m.exec(block)?.[1] ?? '')
    .filter((handlers) => /\bjs\d+\b/.test(handlers))
    .map((handlers) => /\b(event\d+)\b/.exec(handlers)?.[1])
    .filter((name): name is string => !!name)
    .map((name) => `/dev/input/${name}`)
}

let logXprop: Log = () => {}

/**
 * Runs xprop on gamescope's display; resolves with its output ('' on failure).
 * Always :0, where Steam runs and gamescope keeps its state; apps (steamtv
 * included) may be given a different display.
 */
function xprop(args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile('xprop', args, { env: { ...process.env, DISPLAY: ':0' } }, (err, out, stderr) => {
      if (err) logXprop(`hotkey: xprop ${args.join(' ')} failed: ${stderr.trim() || err.message}`)
      resolve(err ? '' : out)
    })
  })
}

/** The Steam app id gamescope is drawing, or null outside Gaming Mode. */
async function appOnScreen(): Promise<number | null> {
  const match = /=\s*(\d+)/.exec(await xprop(['-root', 'GAMESCOPE_FOCUSED_APP_GFX']))
  return match ? Number(match[1]) : null
}

/** pid → parent pid for every process. */
async function processTree(): Promise<Map<number, number>> {
  const parents = new Map<number, number>()
  for (const entry of await readdir('/proc').catch(() => [] as string[])) {
    if (!/^\d+$/.test(entry)) continue
    const stat = await readFile(`/proc/${entry}/stat`, 'utf8').catch(() => '')
    // Fields after the parenthesised command name: state, ppid, ...
    const ppid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1])
    if (ppid) parents.set(Number(entry), ppid)
  }
  return parents
}

function descendants(root: number, parents: Map<number, number>): number[] {
  const found: number[] = []
  const queue = [root]
  while (queue.length) {
    const pid = queue.shift()!
    for (const [child, parent] of parents) {
      if (parent === pid) {
        found.push(child)
        queue.push(child)
      }
    }
  }
  return found
}

function signal(pids: number[], sig: NodeJS.Signals): void {
  for (const pid of pids) {
    try {
      process.kill(pid, sig)
    } catch {
      // Already gone.
    }
  }
}

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Asks processes to quit, forces any still running after a grace period, and
 * resolves once they're all gone (or a little after the forced kill).
 */
async function terminate(pids: number[], log: Log, grace = KILL_GRACE_MS): Promise<void> {
  if (!pids.length) return
  signal(pids, 'SIGTERM')
  const deadline = Date.now() + grace
  while (Date.now() < deadline && pids.some(alive)) await sleep(200)
  const stuck = pids.filter(alive)
  if (!stuck.length) return
  log(`hotkey: ${stuck.length} processes ignored SIGTERM; killing`)
  signal(stuck, 'SIGKILL')
  for (let i = 0; i < 10 && pids.some(alive); i++) await sleep(200)
}

/**
 * Processes belonging to Steam app `appid`: everything under its `reaper SteamLaunch
 * AppId=<appid>`, plus any process carrying `SteamAppId=<appid>` in its environment
 * (and their children). The second catches apps that outlived their launch, e.g.
 * Chrome kiosk shortcuts handing a page to a Chrome already running.
 */
async function steamLaunchProcesses(appid: number): Promise<number[]> {
  const parents = await processTree()
  const found = new Set<number>()
  const tag = `SteamAppId=${appid}`
  for (const pid of parents.keys()) {
    if (pid === process.pid) continue
    const args = (await readFile(`/proc/${pid}/cmdline`, 'utf8').catch(() => '')).split('\0')
    const reaper = args.includes('SteamLaunch') && args.includes(`AppId=${appid}`)
    const tagged = !reaper && (await readFile(`/proc/${pid}/environ`, 'utf8').catch(() => '')).split('\0').includes(tag)
    if (!reaper && !tagged) continue
    if (tagged) found.add(pid)
    for (const child of descendants(pid, parents)) found.add(child)
  }
  found.delete(process.pid)
  return [...found]
}

/**
 * What steamtv launched itself (emulators): everything in steamtv's Steam session
 * except steamtv's own processes. Works even if steamtv restarted since.
 */
async function launchedBySteamtv(): Promise<number[]> {
  const parents = await processTree()
  // steamtv itself: this process, Electron's helpers (same executable) and the
  // chain above it. Emulators are children of this process too, so the
  // executable is what tells them apart.
  const ours = new Set([process.pid])
  for (const pid of descendants(process.pid, parents)) {
    if ((await readlink(`/proc/${pid}/exe`).catch(() => '')) === process.execPath) ours.add(pid)
  }
  for (let pid = parents.get(process.pid); pid; pid = parents.get(pid)) ours.add(pid)
  // Under Steam, everything in vaporTV's Steam session; without it (development), its children.
  const session = STEAMTV_APPID === null ? descendants(process.pid, parents) : await steamLaunchProcesses(STEAMTV_APPID)
  const candidates = session.filter((pid) => !ours.has(pid))
  // The AppImage runtime sits beside steamtv in the session and keeps its files
  // mounted; closing it pulls steamtv's own files away and crashes it.
  const runtime = new Set<number>()
  for (const pid of candidates) {
    const program = (await readFile(`/proc/${pid}/cmdline`, 'utf8').catch(() => '')).split('\0')[0]
    if (/\/(steamtv|vaportv)[^/]*\.AppImage$/i.test(program)) {
      runtime.add(pid)
      for (const child of descendants(pid, parents)) runtime.add(child)
    }
  }
  return candidates.filter((pid) => !runtime.has(pid))
}

export interface HotkeyOptions {
  /** Brings the steamtv window to the front. */
  bringBack: () => void
  /** Name of what steamtv launched for a Steam app id, or of its running emulator game. */
  nameFor: (target: number | 'emulator') => string | undefined
  /** An app is being closed (show the closing animation)... */
  onClosing: (name: string | undefined) => void
  /** ...and now it's gone. */
  onClosed: () => void
  log: Log
}

/** Closing animation: shown at least this long so it doesn't just flicker. */
const MIN_CLOSING_MS = 900

/** Shows the closing animation over steamtv while `pids` shut down behind it. */
async function closeWithAnimation(options: HotkeyOptions, pids: number[], name: string | undefined, grace?: number): Promise<void> {
  const shown = Date.now()
  // steamtv first, so the animation is what's on screen while the app closes.
  options.onClosing(name)
  options.bringBack()
  await terminate(pids, options.log, grace)
  await sleep(Math.max(0, MIN_CLOSING_MS - (Date.now() - shown)))
  options.onClosed()
  // Steam sometimes puts its own UI up as the app goes; make sure steamtv stays.
  setTimeout(options.bringBack, 500)
}

async function closeForeground(options: HotkeyOptions): Promise<void> {
  const { log } = options
  const emulator = await launchedBySteamtv()
  if (emulator.length) {
    // Emulators run inside steamtv's own Steam session, so close just them.
    log(`hotkey: closing what steamtv launched (${emulator.length} processes)`)
    await closeWithAnimation(options, emulator, options.nameFor('emulator'), EMULATOR_GRACE_MS)
  } else {
    const appid = await appOnScreen()
    if (appid === STEAMTV_APPID) return
    if (appid === null || appid === STEAM_UI_APPID) {
      // Nothing to close; Steam's own UI is over steamtv.
      log(`hotkey: bringing steamtv forward (on screen: ${appid})`)
      options.bringBack()
      return
    }
    const pids = await steamLaunchProcesses(appid)
    log(`hotkey: closing app ${appid} (${pids.length} processes)`)
    await closeWithAnimation(options, pids, options.nameFor(appid))
  }
}

export function startHotkey(options: HotkeyOptions): void {
  if (process.platform !== 'linux') return
  logXprop = options.log
  const watched = new Map<string, Watched>()
  let timer: ReturnType<typeof setTimeout> | undefined

  const anyComboHeld = (): boolean =>
    [...watched.values()].some((w) => w.held.has(BTN_SELECT) && w.held.has(BTN_START))

  const update = (): void => {
    if (anyComboHeld()) {
      timer ??= setTimeout(() => {
        timer = undefined
        if (anyComboHeld()) closeForeground(options).catch((err) => options.log(`hotkey: ${err}`))
      }, HOLD_MS)
    } else {
      clearTimeout(timer)
      timer = undefined
    }
  }

  const watch = (path: string): void => {
    const stream = createReadStream(path, { highWaterMark: EVENT_SIZE * 64 })
    const device: Watched = { stream, held: new Set() }
    let pending = Buffer.alloc(0)
    stream.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk as Buffer])
      while (pending.length >= EVENT_SIZE) {
        const type = pending.readUInt16LE(16)
        const code = pending.readUInt16LE(18)
        const value = pending.readInt32LE(20)
        pending = pending.subarray(EVENT_SIZE)
        if (type !== EV_KEY || (code !== BTN_SELECT && code !== BTN_START)) continue
        if (value) device.held.add(code)
        else device.held.delete(code)
        update()
      }
    })
    const drop = (): void => {
      watched.delete(path)
      update()
    }
    stream.on('error', drop)
    stream.on('close', drop)
    watched.set(path, device)
    options.log(`hotkey: watching ${path}`)
  }

  // Same as holding the combo; lets the close path be tested from a shell
  // (`kill -USR2 <steamtv pid>`) without pressing buttons.
  process.on('SIGUSR2', () => {
    options.log('hotkey: triggered by SIGUSR2')
    closeForeground(options).catch((err) => options.log(`hotkey: ${err}`))
  })

  const rescan = async (): Promise<void> => {
    for (const path of await controllerDevices()) if (!watched.has(path)) watch(path)
  }
  rescan()
  setInterval(rescan, RESCAN_MS)
}

/** Puts steamtv back in front if Steam's UI is over it (e.g. after an app closed). */
export async function ensureSteamtvInFront(log: Log): Promise<void> {
  if ((await appOnScreen()) === STEAMTV_APPID) return
  log('hotkey: putting steamtv first in gamescope\'s app order')
  // Steam picks the app in front through this list. Cleared first: setting the
  // value it already has isn't seen as a change.
  await xprop(['-root', '-remove', 'GAMESCOPECTRL_BASELAYER_APPID'])
  await xprop(['-root', '-f', 'GAMESCOPECTRL_BASELAYER_APPID', '32c', '-set', 'GAMESCOPECTRL_BASELAYER_APPID', `${STEAMTV_APPID},${STEAM_UI_APPID}`])
}
