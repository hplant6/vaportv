// "Both": the visualizer's looks take turns, changing over on a beat. A look stays up a while
// (changing every beat would be chaos), then hands over on the next kick; sooner when the song
// clearly changes section (the beat dropping in after a quiet stretch). The two cross-fade,
// both drawn only for that moment. Music with no kicks to speak of still changes, eventually.

export interface SwitchTiming {
  /** Shortest time a look stays up: a section change can take over after this long. */
  minHold: number
  /** After this long, the next kick changes it. */
  maxHold: number
  /** After this long, it changes without waiting for a kick. */
  giveUp: number
  /** How long the cross-fade takes. */
  fade: number
  /** How far the loudness has to jump over its recent level to count as a new section. */
  drop: number
}

export const SWITCH_TIMING: SwitchTiming = { minHold: 15, maxHold: 40, giveUp: 70, fade: 0.7, drop: 0.3 }

/** Each look's strength, 0 to 1, for this frame. */
export type Switcher = (beat: boolean, energy: number, playing: boolean, dt: number) => Float32Array

/** Takes turns between `count` looks, starting with the first; with one, it just stays. */
export function switcher(count: number, timing: SwitchTiming = SWITCH_TIMING): Switcher {
  const fades = new Float32Array(count)
  fades[0] = 1
  let current = 0
  let next = -1
  let progress = 0
  let held = 0
  /** The loudness over the last several seconds, for telling a new section from the beat. */
  let recent = 0
  return (beat, energy, playing, dt) => {
    const drop = energy - recent > timing.drop
    recent += (energy - recent) * Math.min(1, dt * 0.15)
    if (next >= 0) {
      progress = Math.min(1, progress + dt / timing.fade)
      const e = progress * progress * (3 - 2 * progress)
      fades[current] = 1 - e
      fades[next] = e
      if (progress >= 1) {
        current = next
        next = -1
        held = 0
      }
      return fades
    }
    // Paused, it holds still: a change is for the music to cause.
    if (!playing || count < 2) return fades
    held += dt
    if ((beat && held >= timing.minHold && drop) || (beat && held >= timing.maxHold) || held >= timing.giveUp) {
      next = (current + 1) % count
      progress = 0
    }
    return fades
  }
}
