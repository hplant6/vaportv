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
/** A gap this long between ticks means the box was asleep. */
const ASLEEP_GAP_MS = 5000
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

/**
 * `foreground`: what's in front, and closing it, as Select + Start does (from startHotkey).
 * `backIsEscape`: whether the app in front wants Escape for a remote's Back (YouTube).
 */
export function startRemoteKeys(log: Log, foreground: Foreground, backIsEscape: () => Promise<boolean>, menu: MenuActions): void {
  if (process.platform !== 'linux') return
  const watched = new Set<string>()
  let lastTick = Date.now()
  let awokeAt = 0
  let sleepingUntil = 0
  /** When Home was first pressed over a game; a second press soon after closes it. */
  let homeArmedAt = 0
  /** Menu is down: when it's held long enough this fires (Settings); let go first, it's a tap. */
  let menuTimer: ReturnType<typeof setTimeout> | undefined

  // The process is paused while the box sleeps, so a long gap between ticks is a wake.
  setInterval(() => {
    const now = Date.now()
    if (now - lastTick > ASLEEP_GAP_MS) awokeAt = now
    lastTick = now
  }, 1000)

  const justWoke = (now: number): boolean => now - awokeAt < AFTER_WAKE_MS

  const pressedPower = async (): Promise<void> => {
    const now = Date.now()
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
