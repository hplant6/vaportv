import { activate, back, controlsGuide, favorite, gameMenu, move, playlist, sideBar, switchTab, voiceSearch, type Direction } from './focus'
import { keepAwake, noteActivity, noteInput } from './idle'
import { stepVolume } from './volume'
import { skipTrack } from '../components/BackgroundMusic'
import { actionsOn, ASSIGNABLE_BUTTONS, CONTROL_ACTIONS, DEFAULT_CONTROLS, HOLD_MS, isHold, type ControlAction, type Controls } from '../../../shared/controls'

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
let blurred = false
let steamAway = false
/** Holds the screensaver off while Steam's menu is over vaporTV. */
const STEAM_MENU = {}
let controls: Controls = DEFAULT_CONTROLS
/** Waiting for "press a button" in Settings: called with the next button pressed, or null if cancelled. */
let capture: { onButton: (button: number | null) => void; until: number; released: boolean } | null = null
const CAPTURE_TIMEOUT_MS = 6000
let held: Direction | null = null
let nextRepeat = 0
let anyDown = false

/**
 * What each action does, once per press (it acts again only after being let go), or once
 * held for HOLD_MS for a hold action. A new hotkey is an action in shared/controls.ts plus
 * a line here. Volume isn't here: it repeats while held (below).
 */
const ON_PRESS: Partial<Record<ControlAction, () => void>> = {
  select: activate,
  back,
  favorite,
  playlist,
  sideBar,
  controlsGuide,
  gameMenu,
  voiceSearch,
  nextSong: () => {
    window.steamtv.logInput('next song (controller)')
    skipTrack('music', 1, true)
  },
  previousTab: () => switchTab(-1),
  nextTab: () => switchTab(1)
}
/** Actions whose buttons were held last time round, to tell a new press. */
let actionsDown = new Set<ControlAction>()
/**
 * Hold actions whose button is down: when it went down, or null once the hold has acted.
 * Its button's press action waits for the release, and is dropped if the hold acted.
 */
const holding = new Map<ControlAction, number | null>()
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

/** Buttons a hook has taken: their usual actions wait until they're let go. */
const hooked = new Set<number>()
let buttonHook: ((button: number) => boolean) | null = null
/** Buttons held last time round, to tell a new press. */
let heldButtons = new Set<number>()

/**
 * While the hook is set (the on-screen keyboard), each newly pressed button (standard index)
 * goes to it first; one it returns true for doesn't also do its usual thing. Select and Back
 * (wherever they're assigned) aren't offered: they always choose and close.
 */
export function hookButtons(hook: (button: number) => boolean): () => void {
  buttonHook = hook
  return () => {
    if (buttonHook === hook) buttonHook = null
  }
}

function offerButtons(): void {
  const now = new Set<number>()
  for (const pad of pads()) pad.buttons.forEach((b, i) => b.pressed && now.add(i))
  for (const button of hooked) if (!now.has(button)) hooked.delete(button)
  for (const button of now) {
    if (heldButtons.has(button) || button === controls.select || button === controls.back || !buttonHook) continue
    if (buttonHook(button)) hooked.add(button)
  }
  heldButtons = now
}

function poll(now: number): void {
  requestAnimationFrame(poll)
  if (paused || now < settleUntil) return

  let direction: Direction | null = null
  if (capture) return pollCapture(now)
  offerButtons()

  // Whether an action's button is held: the one place that knows how an action maps to buttons
  // (so a combination, when there are some, is checked here).
  const down = (pad: Gamepad, action: ControlAction): boolean => !hooked.has(controls[action]) && !!pad.buttons[controls[action]]?.pressed
  const pressed = new Set<ControlAction>()
  for (const pad of pads()) {
    direction ??= readDirection(pad)
    for (const { id } of CONTROL_ACTIONS) if (down(pad, id)) pressed.add(id)
  }

  if (waitForRelease) {
    if (direction || pressed.size) return
    waitForRelease = false
    // What was down before doesn't count as let go now.
    actionsDown = new Set()
    holding.clear()
  }

  // Any button at all counts as activity; one that wakes the screensaver does nothing else.
  const anyInput = !!direction || pads().some((pad) => pad.buttons.some((b) => b.pressed))
  const newPress = anyInput && !anyDown
  anyDown = anyInput
  if (newPress && !direction) window.steamtv.logInput(`gamepad press: ${describePads()}`)
  if (anyInput && noteInput(newPress, direction)) {
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

  const wasDown = actionsDown
  actionsDown = pressed
  for (const { id } of CONTROL_ACTIONS) {
    if (isHold(id)) {
      // Held long enough: the hold acts. Let go sooner: the button's press action does.
      if (pressed.has(id) && !wasDown.has(id)) holding.set(id, now)
      const since = holding.get(id)
      if (pressed.has(id) && since != null && now - since >= HOLD_MS) {
        holding.set(id, null)
        ON_PRESS[id]?.()
      } else if (!pressed.has(id) && wasDown.has(id)) {
        holding.delete(id)
        const press = actionsOn(controls, controls[id]).press
        if (since != null && press) ON_PRESS[press]?.()
      }
    } else if (pressed.has(id) && !wasDown.has(id) && !actionsOn(controls, controls[id]).hold) {
      ON_PRESS[id]?.()
    }
  }

  // Both triggers at once cancel out.
  const volumeUp = pressed.has('volumeUp')
  const volume = volumeUp === pressed.has('volumeDown') ? null : volumeUp ? 1 : -1
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
    noteActivity()
    blurred = true
    setGamepadPaused(true)
  })
  window.addEventListener('focus', () => {
    window.steamtv.logInput('window focused')
    noteActivity()
    blurred = false
    setGamepadPaused(steamAway)
  })
  // Steam's menu over us: the window keeps its focus, so this is the only sign. Coming
  // back, the A that closed the menu is still held and must not act here too.
  window.steamtv.onSteamFocus((away) => {
    noteActivity()
    // The screensaver doesn't start under Steam's menu either.
    keepAwake(STEAM_MENU, away)
    steamAway = away
    setGamepadPaused(away || blurred)
  })
  window.addEventListener('gamepadconnected', (event) => {
    window.steamtv.logInput(`connected ${event.gamepad.index} "${event.gamepad.id}" ${event.gamepad.mapping || 'no-mapping'}`)
    noteActivity()
    // Switching a controller on must not also press whatever it reports first.
    settleUntil = performance.now() + CONNECT_SETTLE_MS
    waitForRelease = true
  })
  window.addEventListener('gamepaddisconnected', (event) => {
    window.steamtv.logInput(`disconnected ${event.gamepad.index} "${event.gamepad.id}"`)
    noteActivity()
    usableSticks.delete(`${event.gamepad.index}:${event.gamepad.id}`)
  })
  requestAnimationFrame(poll)
}
