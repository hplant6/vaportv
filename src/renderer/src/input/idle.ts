// Time since the last controller or keyboard input, for the screensaver, and
// whether the screensaver is up (input then only wakes it, or steps a slideshow).

import type { Direction } from './focus'

let lastInput = performance.now()
let saverUp = false
const listeners = new Set<(up: boolean) => void>()

export function idleMs(): number {
  return performance.now() - lastInput
}

export function screensaverUp(): boolean {
  return saverUp
}

export function setScreensaverUp(up: boolean): void {
  if (up === saverUp) return
  saverUp = up
  lastInput = performance.now()
  for (const listener of listeners) listener(up)
}

/** Calls back when the screensaver starts or stops; returns an unsubscribe. */
export function onScreensaver(listener: (up: boolean) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

let stepper: ((direction: Direction) => void) | null = null

/** A slideshow on screen: directions step through its pictures instead of waking it. Returns an unsubscribe. */
export function onScreensaverStep(step: (direction: Direction) => void): () => void {
  stepper = step
  return () => {
    if (stepper === step) stepper = null
  }
}

/**
 * Records input. Returns true while the screensaver is up: the input is swallowed,
 * so it doesn't also move the cursor or launch something. Only a new press wakes
 * it; a button still held from before (the A that chose Preview) doesn't. A new
 * `direction` over a slideshow steps it instead.
 */
export function noteInput(newPress: boolean, direction?: Direction | null): boolean {
  lastInput = performance.now()
  if (!saverUp) return false
  if (newPress && direction && stepper) stepper(direction)
  else if (newPress) setScreensaverUp(false)
  return true
}
