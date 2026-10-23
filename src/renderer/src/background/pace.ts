import { onBattery } from '../power'

// Backdrops on battery (a Steam Deck in your hands) draw at most this often: about half
// the work of a 60Hz screen, and hard to tell apart in slow, drifting scenes.
export const BATTERY_FPS = 30

/** For a frame loop: whether to draw at `now`. Every frame on mains power; at most BATTERY_FPS on battery. */
export function pacer(): (now: number) => boolean {
  let drawn = -Infinity
  return (now) => {
    // A couple of ms of slack, so 60Hz frames fall cleanly into every other one.
    if (onBattery() && now - drawn < 1000 / BATTERY_FPS - 2) return false
    drawn = now
    return true
  }
}
