import { readFile } from 'node:fs/promises'
import { readKeys } from '../evdev'

// Controllers while a film plays in mpv. mpv has the window (vaporTV's page has lost focus, so its
// own controller reading is paused) and mpv itself no longer reads controllers, so vaporTV reads
// them here, straight from their evdev devices as Select + Start does over a game, and turns them
// into the buttons and D-pad directions vaporTV's page knows: the standard-mapping indices
// Settings → Controller assigns actions to.

export type PadDirection = 'up' | 'down' | 'left' | 'right'

export interface PadEvents {
  /** A standard-mapping button (0 A, 1 B, ... 11 R3) pressed. */
  button: (index: number) => void
  /** A D-pad direction pressed, and again while it's held (after a pause, then quicker). */
  direction: (direction: PadDirection) => void
}

/** evdev key code → standard-mapping button, as Chromium maps an xinput pad (xpad). */
export const KEY_TO_BUTTON: Record<number, number> = {
  0x130: 0, // BTN_A / SOUTH
  0x131: 1, // BTN_B / EAST
  0x133: 2, // BTN_X
  0x134: 3, // BTN_Y
  0x136: 4, // BTN_TL
  0x137: 5, // BTN_TR
  0x138: 6, // BTN_TL2 (pads whose triggers are buttons)
  0x139: 7, // BTN_TR2
  0x13a: 8, // BTN_SELECT
  0x13b: 9, // BTN_START
  0x13d: 10, // BTN_THUMBL
  0x13e: 11 // BTN_THUMBR
}

/** D-pads that are buttons rather than a hat. */
const KEY_TO_DIRECTION: Record<number, PadDirection> = { 0x220: 'up', 0x221: 'down', 0x222: 'left', 0x223: 'right' }

const ABS_Z = 0x02
const ABS_RZ = 0x05
const ABS_HAT0X = 0x10
const ABS_HAT0Y = 0x11
/** Analogue triggers (0-255 on xpad, 0-1023 on some): pressed past this, let go under the lower. */
const TRIGGER_ON = 100
const TRIGGER_OFF = 40

const REPEAT_DELAY_MS = 400
const REPEAT_MS = 130
/** The same press seen on two devices (a pad and Steam's copy of it) this close together is one. */
const ECHO_MS = 60
const RESCAN_MS = 3000

/** Controllers (devices with a joystick handler) by event node, from the kernel's list. */
export function padDevices(devices: string): string[] {
  return devices
    .split('\n\n')
    .map((block) => /^H: Handlers=(.*)$/m.exec(block)?.[1] ?? '')
    .filter((handlers) => /\bjs\d+\b/.test(handlers))
    .map((handlers) => /\b(event\d+)\b/.exec(handlers)?.[1])
    .filter((name): name is string => !!name)
    .map((name) => `/dev/input/${name}`)
}

/**
 * Turns one device's raw events into presses: `press(kind, value)`. Pure apart from the
 * callbacks, so the hat and trigger handling can be tested.
 */
export function padDecoder(press: (what: { button: number } | { direction: PadDirection | null }) => void): {
  key: (code: number, value: number) => void
  abs: (code: number, value: number) => void
} {
  const triggerDown = new Map<number, boolean>()
  let hatX = 0
  let hatY = 0
  const hat = (): void => {
    // One direction at a time; vertical wins a diagonal, as menus are mostly up and down.
    press({ direction: hatY < 0 ? 'up' : hatY > 0 ? 'down' : hatX < 0 ? 'left' : hatX > 0 ? 'right' : null })
  }
  return {
    key: (code, value) => {
      const direction = KEY_TO_DIRECTION[code]
      if (direction) return press({ direction: value ? direction : null })
      const button = KEY_TO_BUTTON[code]
      if (button !== undefined && value === 1) press({ button })
    },
    abs: (code, value) => {
      if (code === ABS_HAT0X) {
        hatX = Math.sign(value)
        hat()
      } else if (code === ABS_HAT0Y) {
        hatY = Math.sign(value)
        hat()
      } else if (code === ABS_Z || code === ABS_RZ) {
        const was = triggerDown.get(code) ?? false
        if (!was && value > TRIGGER_ON) {
          triggerDown.set(code, true)
          press({ button: code === ABS_Z ? 6 : 7 })
        } else if (was && value < TRIGGER_OFF) triggerDown.set(code, false)
      }
    }
  }
}

/** Reads every controller until the returned stop is called. */
export function readPads(events: PadEvents, log: (line: string) => void = () => undefined): () => void {
  const stops = new Map<string, () => void>()
  let stopped = false
  let held: PadDirection | null = null
  let repeat: ReturnType<typeof setTimeout> | undefined
  const lastButton = new Map<number, number>()
  let lastDirection = { direction: '', at: 0 }

  const setHeld = (direction: PadDirection | null): void => {
    if (direction === held) return
    held = direction
    clearTimeout(repeat)
    if (!direction) return
    const now = Date.now()
    if (lastDirection.direction === direction && now - lastDirection.at < ECHO_MS) return
    lastDirection = { direction, at: now }
    events.direction(direction)
    const again = (): void => {
      if (held !== direction || stopped) return
      lastDirection = { direction, at: Date.now() }
      events.direction(direction)
      repeat = setTimeout(again, REPEAT_MS)
    }
    repeat = setTimeout(again, REPEAT_DELAY_MS)
  }

  const watch = (path: string): void => {
    const decoder = padDecoder((what) => {
      if (stopped) return
      if ('button' in what) {
        const now = Date.now()
        if (now - (lastButton.get(what.button) ?? 0) < ECHO_MS) return
        lastButton.set(what.button, now)
        events.button(what.button)
      } else setHeld(what.direction)
    })
    stops.set(path, readKeys(path, decoder.key, () => stops.delete(path), decoder.abs))
    log(`player: reading controller ${path}`)
  }

  const rescan = async (): Promise<void> => {
    if (stopped) return
    for (const path of padDevices(await readFile('/proc/bus/input/devices', 'utf8').catch(() => ''))) if (!stops.has(path)) watch(path)
  }
  void rescan()
  const timer = setInterval(rescan, RESCAN_MS)
  return () => {
    stopped = true
    clearInterval(timer)
    clearTimeout(repeat)
    for (const stop of [...stops.values()]) stop()
    stops.clear()
  }
}
