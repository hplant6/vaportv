import { onBattery } from '../power'

// Backdrops on battery (a Steam Deck in your hands) draw at most this often: about half
// the work of a 60Hz screen, and hard to tell apart in slow, drifting scenes.
export const BATTERY_FPS = 30

/** For a frame loop: whether to draw at `now`. Every frame on mains power (or at most `fps`); at most BATTERY_FPS on battery. */
export function pacer(fps = Infinity): (now: number) => boolean {
  let drawn = -Infinity
  return (now) => {
    const cap = onBattery() ? Math.min(fps, BATTERY_FPS) : fps
    // A couple of ms of slack, so 60Hz frames fall cleanly into every other one.
    if (now - drawn < 1000 / cap - 2) return false
    drawn = now
    return true
  }
}
