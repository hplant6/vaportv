import { activate, back, coreMenu, favorite, move, options, switchTab, type Direction } from './focus'
import { noteInput } from './idle'
import { stepVolume } from './volume'
import { ASSIGNABLE_BUTTONS, DEFAULT_CONTROLS, type ControlAction, type Controls } from '../../../shared/controls'

/** Settings fires this after the buttons change. */
export const CONTROLS_CHANGED_EVENT = 'steamtv:controls-changed'

// Standard-mapping D-pad indices; every other button goes through `controls`.
const DPAD: Record<Direction, number> = { up: 12, down: 13, left: 14, right: 15 }

const STICK_THRESHOLD = 0.6
/** A stick counts once it has been seen this close to centre; until then it may be a trigger or a motion sensor. */
const STICK_REST_MAX = 0.3
const REPEAT_DELAY = 400
const REPEAT_INTERVAL = 130

let paused = false
let controls: Controls = DEFAULT_CONTROLS
/** Waiting for "press a button" in Settings: called with the next button pressed, or null if cancelled. */
let capture: { onButton: (button: number | null) => void; until: number; released: boolean } | null = null
const CAPTURE_TIMEOUT_MS = 6000
let held: Direction | null = null
let nextRepeat = 0
let confirmDown = false
let backDown = false
let favoriteDown = false
let optionsDown = false
let coreDown = false
let anyDown = false
let previousTabDown = false
let nextTabDown = false
/** The trigger held for volume (-1 L2, 1 R2) and when it next repeats. */
let volumeHeld: 1 | -1 | null = null
let nextVolumeRepeat = 0
// After a pause, and at startup, ignore the pad until everything is released, so
// the press that closed a game (or anything already held) doesn't act here.
let waitForRelease = true
/** Pads report junk as they connect (the Flydigi shows A held): ignore everything this long after. */
const CONNECT_SETTLE_MS = 500
let settleUntil = 0
// Pads whose first two axes have been seen near centre at least once.
const usableSticks = new Set<string>()

/** Stops reading the pad while a game has it. */
export function setGamepadPaused(value: boolean): void {
  paused = value
  held = null
  volumeHeld = null
  if (!value) waitForRelease = true
}

/**
 * Pads to read: connected ones with the standard layout. Others (motion-sensor
 * devices, unknown layouts) have buttons and axes at indices that mean something
 * else, and can look like a stick held to one side.
 */
function pads(): Gamepad[] {
  return navigator.getGamepads().filter((pad): pad is Gamepad => !!pad && pad.connected && pad.mapping === 'standard')
}

function readDirection(pad: Gamepad): Direction | null {
  for (const direction of Object.keys(DPAD) as Direction[]) {
    if (pad.buttons[DPAD[direction]]?.pressed) return direction
  }
  const key = `${pad.index}:${pad.id}`
  if (!usableSticks.has(key)) {
    if (!pad.axes.slice(0, 2).every((v) => Math.abs(v) <= STICK_REST_MAX)) return null
    usableSticks.add(key)
  }
  const [x = 0, y = 0] = pad.axes
  if (Math.abs(x) < STICK_THRESHOLD && Math.abs(y) < STICK_THRESHOLD) return null
  if (Math.abs(x) > Math.abs(y)) return x > 0 ? 'right' : 'left'
  return y > 0 ? 'down' : 'up'
}

/** One line describing what each pad reports, for the input log. */
function describePads(): string {
  return navigator
    .getGamepads()
    .filter((pad): pad is Gamepad => !!pad)
    .map((pad) => {
      const axes = pad.axes.map((v) => v.toFixed(2)).join(',')
      const pressed = pad.buttons.flatMap((b, i) => (b.pressed ? [i] : [])).join(',')
      return `[${pad.index} "${pad.id}" ${pad.mapping || 'no-mapping'}${pad.connected ? '' : ' DISCONNECTED'} axes=${axes} pressed=${pressed}]`
    })
    .join(' ')
}

function poll(now: number): void {
  requestAnimationFrame(poll)
  if (paused || now < settleUntil) return

  let direction: Direction | null = null
  let confirm = false
  let backPressed = false
  let favoritePressed = false
  let optionsPressed = false
  let corePressed = false
  let previousTab = false
  let nextTab = false
  let volumeDown = false
  let volumeUp = false
  if (capture) return pollCapture(now)

  const down = (pad: Gamepad, action: ControlAction): boolean => !!pad.buttons[controls[action]]?.pressed
  for (const pad of pads()) {
    direction ??= readDirection(pad)
    confirm ||= down(pad, 'select')
    backPressed ||= down(pad, 'back')
    favoritePressed ||= down(pad, 'favorite')
    optionsPressed ||= down(pad, 'options')
    corePressed ||= down(pad, 'core')
    previousTab ||= down(pad, 'previousTab')
    nextTab ||= down(pad, 'nextTab')
    volumeDown ||= down(pad, 'volumeDown')
    volumeUp ||= down(pad, 'volumeUp')
  }

  if (waitForRelease) {
    if (direction || confirm || backPressed || favoritePressed || optionsPressed || corePressed || previousTab || nextTab || volumeDown || volumeUp) return
    waitForRelease = false
  }

  // Any button at all counts as activity; one that wakes the screensaver does nothing else.
  const anyInput = !!direction || pads().some((pad) => pad.buttons.some((b) => b.pressed))
  const newPress = anyInput && !anyDown
  anyDown = anyInput
  if (anyInput && noteInput(newPress)) {
    held = null
    waitForRelease = true
    return
  }

  if (direction !== held) {
    held = direction
    if (direction) {
      window.steamtv.logInput(`gamepad ${direction}: ${describePads()}`)
      move(direction, 'gamepad')
      nextRepeat = now + REPEAT_DELAY
    }
  } else if (direction && now >= nextRepeat) {
    move(direction, 'gamepad')
    nextRepeat = now + REPEAT_INTERVAL
  }

  if (confirm && !confirmDown) activate()
  confirmDown = confirm
  if (backPressed && !backDown) back()
  backDown = backPressed
  if (favoritePressed && !favoriteDown) favorite()
  favoriteDown = favoritePressed
  if (optionsPressed && !optionsDown) options()
  optionsDown = optionsPressed
  if (corePressed && !coreDown) coreMenu()
  coreDown = corePressed
  if (previousTab && !previousTabDown) switchTab(-1)
  previousTabDown = previousTab
  if (nextTab && !nextTabDown) switchTab(1)
  nextTabDown = nextTab

  // Both triggers at once cancel out.
  const volume = volumeUp === volumeDown ? null : volumeUp ? 1 : -1
  if (volume !== volumeHeld) {
    volumeHeld = volume
    if (volume) {
      stepVolume(volume)
      nextVolumeRepeat = now + REPEAT_DELAY
    }
  } else if (volume && now >= nextVolumeRepeat) {
    stepVolume(volume)
    nextVolumeRepeat = now + REPEAT_INTERVAL
  }
}

/**
 * Settings' "press a button": once everything is let go (the A that chose the row),
 * the next assignable button pressed is reported. The D-pad, or nothing for a few
 * seconds, cancels with null.
 */
export function captureButton(onButton: (button: number | null) => void): void {
  capture?.onButton(null)
  capture = { onButton, until: performance.now() + CAPTURE_TIMEOUT_MS, released: false }
}

export function cancelCapture(): void {
  finishCapture(null)
}

function finishCapture(button: number | null): void {
  const done = capture
  capture = null
  // The press that was captured must not also act once normal reading resumes.
  waitForRelease = true
  held = null
  done?.onButton(button)
}

function pollCapture(now: number): void {
  if (now > capture!.until) return finishCapture(null)
  const all = pads()
  const anyHeld = all.some((pad) => pad.buttons.some((b) => b.pressed))
  if (!capture!.released) {
    if (!anyHeld) capture!.released = true
    return
  }
  for (const pad of all) {
    if (Object.values(DPAD).some((i) => pad.buttons[i]?.pressed)) return finishCapture(null)
    const button = ASSIGNABLE_BUTTONS.find((i) => pad.buttons[i]?.pressed)
    if (button !== undefined) return finishCapture(button)
  }
}

function loadControls(): void {
  window.steamtv.getSettings().then((s) => (controls = s.controls))
}

export function startGamepad(): void {
  loadControls()
  window.addEventListener(CONTROLS_CHANGED_EVENT, loadControls)
  // A launched game takes the window focus; the pad is the game's until we get it back.
  window.addEventListener('blur', () => {
    window.steamtv.logInput('window lost focus')
    setGamepadPaused(true)
  })
  window.addEventListener('focus', () => {
    window.steamtv.logInput('window focused')
    setGamepadPaused(false)
  })
  window.addEventListener('gamepadconnected', (event) => {
    window.steamtv.logInput(`connected ${event.gamepad.index} "${event.gamepad.id}" ${event.gamepad.mapping || 'no-mapping'}`)
    // Switching a controller on must not also press whatever it reports first.
    settleUntil = performance.now() + CONNECT_SETTLE_MS
    waitForRelease = true
  })
  window.addEventListener('gamepaddisconnected', (event) => {
    window.steamtv.logInput(`disconnected ${event.gamepad.index} "${event.gamepad.id}"`)
    usableSticks.delete(`${event.gamepad.index}:${event.gamepad.id}`)
  })
  requestAnimationFrame(poll)
}
