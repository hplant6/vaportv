import { useEffect } from 'react'

// The apps you talk to (Claude, Translate) hold the sound while they're open, so you can hear
// them and they can hear you: music (the Music player, background music) turns well down, and
// a film or show pauses (vaporTV's own player, and mpv's). Music comes back up when the last
// one closes; a film stays paused, to carry on from where it was.

/** What music plays at while held: well down, still there. */
export const HELD_VOLUME = 0.12

/** Fired on the window as the hold starts (detail true) and ends (false). */
export const SOUND_HOLD_EVENT = 'steamtv:sound-hold'

let holds = 0

/** Whether something holds the sound now. */
export function soundHeld(): boolean {
  return holds > 0
}

/** What music's volume is multiplied by now: HELD_VOLUME while held, else 1. */
export function heldFactor(): number {
  return holds > 0 ? HELD_VOLUME : 1
}

function changed(held: boolean): void {
  window.steamtv.logInput(held ? 'sound held: music down, video paused' : 'sound let go: music back up')
  if (held) void window.steamtv.media.pauseExternal().catch(() => undefined)
  window.dispatchEvent(new CustomEvent(SOUND_HOLD_EVENT, { detail: held }))
}

/** Holds the sound; the function it returns lets go (once). */
export function holdSound(): () => void {
  holds++
  if (holds === 1) changed(true)
  let released = false
  return () => {
    if (released) return
    released = true
    holds--
    if (holds === 0) changed(false)
  }
}

/** Holds the sound while the component's mounted (an app's screen is open). */
export function useSoundHold(): void {
  useEffect(() => holdSound(), [])
}
