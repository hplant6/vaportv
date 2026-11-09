import { readFile } from 'node:fs/promises'
import { readKeys } from './evdev'
import type { Foreground } from './hotkey'
import { power, sleepBlocker } from './power'
import { pressSteamButton } from './steamButton'
import { pressVirtualKey } from './virtualKeys'

// Remotes' buttons that work whatever is on screen. Power puts the box to sleep (SteamOS
// ignores the Power key, as Steam handles the box's own button). Home closes what's in
// front and comes back to vaporTV, as Select + Start held does on a controller: at once
// for an app (Kodi, Netflix), on a second press for a game, which would lose its progress.
// Back (Backspace) over YouTube also presses Escape, the only key its TV app goes back
// on; `backIsEscape` says when. F11 (a Sofabaton button mapped to it) opens Steam's menu, as a controller's Steam
// button does. Menu tapped is voice search; held, Settings. Home, F11 and Menu only from remotes (a Sofabaton hub, a USB TV remote): on a real keyboard it's a key
// that games and text boxes use.

const KEY_POWER = 116
const KEY_HOME = 102
/** Keypad 7, which is Home with Num Lock off: the Sofabaton app's "Home1" sends it. */
const KEY_KP7 = 71
const KEY_F11 = 87
const KEY_BACKSPACE = 14
/** Remotes' Menu button (the HID Menu key), and a keyboard's Menu key. */
const KEY_PROPS = 130
const KEY_COMPOSE = 127
/** Menu held this long opens Settings instead of voice search. */
const MENU_HOLD_MS = 600
/** After waking, Power and Home are ignored this long: a remote's "on" sends one to wake the box. */
const AFTER_WAKE_MS = 15_000
/** A game closes when Home is pressed again within this long. */
const HOME_AGAIN_MS = 3000
const RESCAN_MS = 5000
/** Asleep at least this long between ticks: the box slept (rather than vaporTV stalling). */
const ASLEEP_MS = 2000
/**
 * Asleep less than this, the box didn't really sleep: the Sofabaton hub reconnects
 * seconds into sleep and that wakes it (5-7 s in), however the sleep began (remote Power,
 * the controller switched off, the power menu, Steam's own Sleep). It goes back to sleep
 * after RESLEEP_DELAY_MS, when the hub's reconnect is over (a second sleep holds), unless
 * someone is waking it meanwhile: Power or another remote key, or a controller switched on.
 */
const BOUNCE_MS = 10_000
const RESLEEP_DELAY_MS = 8000
/** A bounce this soon after vaporTV slept it again isn't put back to sleep: no loops. */
const RESLEEP_ONCE_MS = 60_000
/** Remotes, by the names their receivers give: a Sofabaton hub, a TV remote's USB dongle ("... RC"). */
const REMOTE_NAME = /sofabaton|\bremote\b|\bRC\b/i

type Log = (line: string) => void

/** What a remote's Menu button does, tapped and held. */
export interface MenuActions {
  tap: () => Promise<void>
  hold: () => Promise<void>
}

/** Whether a device's KEY= capability bitmap (64-bit words, most significant first) has `code`. */
export function hasKey(bitmap: string, code: number): boolean {
  const words = bitmap.trim().split(/\s+/).reverse()
  const word = words[Math.floor(code / 64)]
  return !!word && ((BigInt(`0x${word}`) >> BigInt(code % 64)) & 1n) === 1n
}

/**
 * Keyboards to watch, from the kernel's device list: Bluetooth (bus 0005) or USB (0003)
 * ones with a Power key, and remotes (`remote`: their Home counts). The box's own power
 * button (bus 0019) is left to Steam.
 */
export function remoteKeyboards(devices: string): { path: string; remote: boolean }[] {
  return devices
    .split('\n\n')
    .filter((block) => /^I: Bus=000[35]\b/m.test(block) && !/^N: Name=".*power button/im.test(block))
    .map((block) => {
      const keys = /^B: KEY=(.*)$/m.exec(block)?.[1] ?? ''
      const name = /^N: Name="(.*)"$/m.exec(block)?.[1] ?? ''
      const event = /^H: Handlers=.*\b(event\d+)\b/m.exec(block)?.[1]
      return { event, remote: REMOTE_NAME.test(name) && hasKey(keys, KEY_HOME), power: hasKey(keys, KEY_POWER) }
    })
    .filter((d): d is { event: string; remote: boolean; power: boolean } => !!d.event && (d.power || d.remote))
    .map((d) => ({ path: `/dev/input/${d.event}`, remote: d.remote }))
}

/** Controllers' names (devices with a joystick handler), from the kernel's device list. */
export function controllersIn(devices: string): string[] {
  return devices
    .split('\n\n')
    .filter((block) => /^H: Handlers=.*\bjs\d+\b/m.test(block))
    .map((block) => /^N: Name="(.*)"$/m.exec(block)?.[1] ?? '')
    .filter(Boolean)
}

async function controllerNames(): Promise<string[]> {
  return controllersIn(await readFile('/proc/bus/input/devices', 'utf8').catch(() => ''))
}

/**
 * `foreground`: what's in front, and closing it, as Select + Start does (from startHotkey).
 * `backIsEscape`: whether the app in front wants Escape for a remote's Back (YouTube).
 */
export function startRemoteKeys(log: Log, foreground: Foreground, backIsEscape: () => Promise<boolean>, menu: MenuActions): void {
  if (process.platform !== 'linux') return
  const watched = new Set<string>()
  let lastTick = Date.now()
  // The monotonic clock stops while the box sleeps; the wall clock doesn't. Their
  // difference between ticks is time asleep, which a stalled process doesn't have.
  let lastMono = performance.now()
  let awokeAt = 0
  let sleepingUntil = 0
  /** Controllers on at the last tick, and at the last one before the box slept. */
  let controllers: string[] = []
  let controllersBeforeSleep: string[] = []
  /** When vaporTV last put the box back to sleep after a bounce. */
  let resleptAt = 0
  let resleepTimer: ReturnType<typeof setTimeout> | undefined
  /** When Home was first pressed over a game; a second press soon after closes it. */
  let homeArmedAt = 0
  /** Menu is down: when it's held long enough this fires (Settings); let go first, it's a tap. */
  let menuTimer: ReturnType<typeof setTimeout> | undefined

  const cancelResleep = (why: string): boolean => {
    if (!resleepTimer) return false
    clearTimeout(resleepTimer)
    resleepTimer = undefined
    log(`sleep: ${why}, staying awake`)
    return true
  }

  // The process is paused while the box sleeps, so time asleep between ticks is a wake.
  setInterval(async () => {
    const now = Date.now()
    const mono = performance.now()
    const asleep = now - lastTick - (mono - lastMono)
    lastTick = now
    lastMono = mono
    if (asleep >= ASLEEP_MS) {
      awokeAt = now
      controllersBeforeSleep = controllers
      if (asleep < BOUNCE_MS && now - resleptAt > RESLEEP_ONCE_MS) {
        log(`sleep: woke after ${(asleep / 1000).toFixed(1)} s, going back to sleep in ${RESLEEP_DELAY_MS / 1000} s unless someone's waking it`)
        clearTimeout(resleepTimer)
        resleepTimer = setTimeout(() => sleepAgain(), RESLEEP_DELAY_MS)
      } else if (asleep < BOUNCE_MS) log(`sleep: woke after ${(asleep / 1000).toFixed(1)} s again, staying awake`)
    }
    controllers = await controllerNames()
    const switchedOn = controllers.find((name) => !controllersBeforeSleep.includes(name))
    if (switchedOn) cancelResleep(`a controller came on (${switchedOn})`)
  }, 1000)

  const sleepAgain = async (): Promise<void> => {
    resleepTimer = undefined
    const why = await sleepBlocker()
    if (why) return log(`sleep: woke straight back up, staying awake (${why})`)
    log('sleep: woke straight back up, sleeping again')
    resleptAt = Date.now()
    await power('sleep')
  }

  const justWoke = (now: number): boolean => now - awokeAt < AFTER_WAKE_MS

  const pressedPower = async (): Promise<void> => {
    const now = Date.now()
    if (cancelResleep('remote power: switched back on')) return
    if (justWoke(now) || now < sleepingUntil) return log('remote power: ignored (just woke)')
    const why = await sleepBlocker()
    if (why) return log(`remote power: staying awake (${why})`)
    log('remote power: sleeping')
    sleepingUntil = now + AFTER_WAKE_MS
    await power('sleep')
  }

  const pressedHome = async (): Promise<void> => {
    const now = Date.now()
    if (justWoke(now)) return log('remote home: ignored (just woke)')
    const kind = await foreground.kind()
    if (kind === 'game' && now - homeArmedAt > HOME_AGAIN_MS) {
      homeArmedAt = now
      return log('remote home: a game is in front; press again to close it')
    }
    homeArmedAt = 0
    log(`remote home: back to vaporTV (${kind ?? 'nothing to close'})`)
    foreground.close()
  }

  const watch = (path: string, remote: boolean): void => {
    readKeys(
      path,
      (code, value) => {
        if ((code === KEY_PROPS || code === KEY_COMPOSE) && remote) {
          // Pressed (1), repeating while held (2), let go (0).
          if (value === 1) {
            clearTimeout(menuTimer)
            menuTimer = setTimeout(() => {
              menuTimer = undefined
              log('remote menu: held, Settings')
              menu.hold().catch((err) => log(`remote menu: ${err}`))
            }, MENU_HOLD_MS)
          } else if (value === 0 && menuTimer) {
            clearTimeout(menuTimer)
            menuTimer = undefined
            log('remote menu: tapped, voice search')
            menu.tap().catch((err) => log(`remote menu: ${err}`))
          }
          return
        }
        if (value !== 1) return
        if (code !== KEY_POWER) cancelResleep(`a key was pressed (${code})`)
        if (code === KEY_POWER) pressedPower().catch((err) => log(`remote power: ${err}`))
        else if ((code === KEY_HOME || code === KEY_KP7) && remote) pressedHome().catch((err) => log(`remote home: ${err}`))
        else if (code === KEY_BACKSPACE && remote) {
          backIsEscape()
            .then((yes) => {
              if (!yes) return
              log('remote back: Escape for YouTube')
              pressVirtualKey('KEY_ESC', log)
            })
            .catch((err) => log(`remote back: ${err}`))
        } else if (code === KEY_F11 && remote) {
          log('remote F11: Steam menu')
          pressSteamButton(log)
        }
      },
      () => watched.delete(path)
    )
    watched.add(path)
    log(`remote keys: watching ${path}${remote ? ' (a remote)' : ''}`)
  }

  // Bluetooth remotes come and go (they disconnect to save battery), hence the rescans.
  const rescan = async (): Promise<void> => {
    const devices = await readFile('/proc/bus/input/devices', 'utf8').catch(() => '')
    for (const { path, remote } of remoteKeyboards(devices)) if (!watched.has(path)) watch(path, remote)
  }
  rescan()
  setInterval(rescan, RESCAN_MS)
}
