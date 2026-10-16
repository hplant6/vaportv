import { activate, back, favorite, move, switchTab, type Direction } from './focus'
import { noteInput } from './idle'

// Standard-mapping button indices.
const BUTTON_A = 0
const BUTTON_B = 1
const BUTTON_Y = 3
const BUTTON_L1 = 4
const BUTTON_R1 = 5
const DPAD: Record<Direction, number> = { up: 12, down: 13, left: 14, right: 15 }

const STICK_THRESHOLD = 0.6
/** A stick counts once it has been seen this close to centre; until then it may be a trigger or a motion sensor. */
const STICK_REST_MAX = 0.3
const REPEAT_DELAY = 400
const REPEAT_INTERVAL = 130

let paused = false
let held: Direction | null = null
let nextRepeat = 0
let confirmDown = false
let backDown = false
let favoriteDown = false
let anyDown = false
let previousTabDown = false
let nextTabDown = false
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
  let previousTab = false
  let nextTab = false
  for (const pad of pads()) {
    direction ??= readDirection(pad)
    confirm ||= !!pad.buttons[BUTTON_A]?.pressed
    backPressed ||= !!pad.buttons[BUTTON_B]?.pressed
    favoritePressed ||= !!pad.buttons[BUTTON_Y]?.pressed
    previousTab ||= !!pad.buttons[BUTTON_L1]?.pressed
    nextTab ||= !!pad.buttons[BUTTON_R1]?.pressed
  }

  if (waitForRelease) {
    if (direction || confirm || backPressed || favoritePressed || previousTab || nextTab) return
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
  if (previousTab && !previousTabDown) switchTab(-1)
  previousTabDown = previousTab
  if (nextTab && !nextTabDown) switchTab(1)
  nextTabDown = nextTab
}

export function startGamepad(): void {
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
