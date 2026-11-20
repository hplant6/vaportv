// Whether vaporTV is what's on screen, for what pauses while a game or app is in front (the
// music). The window's focus events alone aren't enough on the box: gamescope can switch back
// to vaporTV (from an app, or when the box wakes) without a focus event, and the music stayed
// paused. So main asks gamescope every couple of seconds too (`onFront`).
//
// Losing focus counts at once (an app's starting). Main's "in front" right after that is
// usually from before the app's window appeared, so it isn't believed until main has seen
// vaporTV away and back, or a while has passed (an app that never showed its window).

/** After losing focus, main's "in front" is believed anyway after this long. */
const STALE_MS = 10_000

let front = document.hasFocus()
/** When the window lost focus with main not yet having seen us go (0: not waiting). */
let blurredAt = 0
const listeners = new Set<(front: boolean) => void>()

function set(next: boolean): void {
  if (next === front) return
  front = next
  for (const listener of listeners) listener(front)
}

// Listening from the start, so no change is missed before anything asks.
{
  window.addEventListener('focus', () => {
    blurredAt = 0
    set(true)
  })
  window.addEventListener('blur', () => {
    blurredAt = Date.now()
    set(false)
  })
  window.steamtv.onFront((inFront) => {
    if (!inFront) {
      blurredAt = 0
      return set(false)
    }
    if (blurredAt && Date.now() - blurredAt < STALE_MS) return
    blurredAt = 0
    set(true)
  })
  // Waking: whatever was in front before, main's next word decides.
  window.steamtv.onResume(() => {
    blurredAt = 0
  })
}

/** Whether vaporTV is on screen now. */
export function isFront(): boolean {
  return front
}

/** Calls `listener` whenever vaporTV comes to the front (true) or goes behind something (false). Returns a stop function. */
export function onFrontChange(listener: (front: boolean) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
