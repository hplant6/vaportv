// The music as the visualizer and the dancing cover both hear it: one reading of the analyser
// per frame, shared, so the cover moves on the same kicks the visualizer shows, not a beat
// behind on a reading of its own.

import { musicAnalyser } from './player'

/** The spectrum's width: bands from about 70 Hz to 12 kHz, log spaced. */
export const SPECTRUM_BANDS = 128

/** What each frame hands a look: the music, 0 to 1, measured against the song itself (a quiet
 *  track swings as far as a loud one). */
export interface Levels {
  time: number
  bass: number
  mid: number
  high: number
  /** 1 on a kick (a jump in the bass), falling away over a few tenths of a second. */
  kick: number
  /** A kick landed this frame. */
  beat: boolean
  /** Kicks so far: for a reader that doesn't look every frame. */
  beats: number
  /** How loud it is overall, against the song's own quiet and loud. */
  energy: number
  /** Where the colours have turned to (radians): drifting, and swung round on the kicks. */
  hue: number
  /** The spectrum, low to high on a log scale, SPECTRUM_BANDS wide. */
  spectrum: Uint8Array
}


/**
 * Measures a level against the song's own range: the floor creeps up to the quiet and the
 * ceiling down to the loud over several seconds, and a new low or high moves them at once.
 * So a quiet track swings 0 to 1 as fully as a loud one.
 */
function gauge(minSpan = 0.08): (x: number, dt: number) => number {
  let low = 1
  let high = 0
  return (x, dt) => {
    low = x < low ? x : low + (x - low) * Math.min(1, dt * 0.15)
    high = x > high ? x : high + (x - high) * Math.min(1, dt * 0.12)
    return Math.min(1, Math.max(0, (x - low) / Math.max(high - low, minSpan)))
  }
}

/** Reads the analyser into Levels each frame: quick to rise, slower to fall, so it hits on the beat without flicker. */
function listener(): (playing: boolean, dt: number) => Levels {
  const bins = new Uint8Array(512)
  const spectrum = new Uint8Array(SPECTRUM_BANDS)
  const smooth = new Float32Array(SPECTRUM_BANDS)
  /** Each band's slow average, taken off so what changes stands out over what holds. */
  const floor = new Float32Array(SPECTRUM_BANDS)
  // Each band's place among the bins (fractional, read between two), log spaced from about
  // 70Hz to 12kHz at fftSize 1024: whole bins would make the bass a staircase.
  const at = Array.from({ length: SPECTRUM_BANDS }, (_, i) => 1.5 * Math.pow(250 / 1.5, i / (SPECTRUM_BANDS - 1)))
  const levels: Levels = { time: 0, bass: 0, mid: 0, high: 0, kick: 0, beat: false, beats: 0, energy: 0, hue: 0, spectrum }
  const bassGauge = gauge()
  const midGauge = gauge()
  const highGauge = gauge()
  const energyGauge = gauge(0.05)
  let bassSlow = 0
  let sinceKick = 1
  /** The kicks' swing of the colours: thrown one way then the other, easing back. */
  let swing = 0
  let swingSpeed = 0
  let side = 1
  const average = (from: number, to: number): number => {
    let sum = 0
    for (let i = from; i < to; i++) sum += bins[i]
    return sum / (to - from) / 255
  }
  const follow = (was: number, now: number, fall = 0.1): number => was + (now - was) * (now > was ? 0.6 : fall)
  return (playing, dt) => {
    // Paused, it slows to a drift rather than stopping dead.
    levels.time += dt * (playing ? 1 : 0.25)
    const analyser = playing ? musicAnalyser() : null
    if (analyser) analyser.getByteFrequencyData(bins)
    else bins.fill(0)
    const bass = analyser ? bassGauge(average(1, 6), dt) : 0
    levels.bass = follow(levels.bass, bass)
    levels.mid = follow(levels.mid, analyser ? midGauge(average(6, 60), dt) : 0)
    levels.high = follow(levels.high, analyser ? highGauge(average(60, 250), dt) : 0)
    levels.energy = follow(levels.energy, analyser ? energyGauge(average(1, 250), dt) : 0, 0.04)

    // A kick: the bass jumping well above where it's been lately.
    sinceKick += dt
    levels.beat = false
    if (bass - bassSlow > 0.22 && bass > 0.55 && sinceKick > 0.2) {
      levels.kick = 1
      levels.beat = true
      levels.beats++
      sinceKick = 0
      swingSpeed += side * (1.0 + levels.energy * 1.2)
      side = -side
    }
    bassSlow += (bass - bassSlow) * Math.min(1, dt * 4)
    levels.kick *= Math.exp(-dt * 5)

    // The colours: a slow drift round, louder drifting faster, and a springy swing on each kick.
    swingSpeed += -swing * 9 * dt - swingSpeed * 3 * dt
    swing += swingSpeed * dt
    levels.hue = Math.sin(levels.time * (0.05 + levels.energy * 0.04)) * 0.3 + swing

    for (let b = 0; b < SPECTRUM_BANDS; b++) {
      const i = Math.floor(at[b])
      const level = (bins[i] + (bins[i + 1] - bins[i]) * (at[b] - i)) / 255
      floor[b] += (level - floor[b]) * Math.min(1, dt * 0.5)
      // The analyser's in decibels, nearly never silent: some of the level as it is, and the
      // rise over its own average made large, so hits stand out; the treble (quieter than it
      // sounds) lifted toward the top.
      const base = Math.max(0, (level - 0.35) / 0.65)
      const rise = Math.max(0, level - floor[b]) * 4
      const v = Math.min(1, (base * 0.45 + rise) * (1 + (b / SPECTRUM_BANDS) * 0.8))
      smooth[b] += (v - smooth[b]) * (v > smooth[b] ? 0.7 : 0.14)
      spectrum[b] = Math.round(smooth[b] * 255)
    }
    return levels
  }
}

let shared: ((playing: boolean, dt: number) => Levels) | null = null
let sampledAt = -1
let last: Levels | null = null

/**
 * This frame's Levels (`now`: requestAnimationFrame's time, the same for every reader in a
 * frame): measured by the first reader, handed to the rest as they are.
 */
export function musicLevels(now: number, playing: boolean): Levels {
  shared ??= listener()
  if (last && now === sampledAt) return last
  const dt = sampledAt < 0 ? 1 / 60 : Math.min(Math.max((now - sampledAt) / 1000, 0), 0.1)
  sampledAt = now
  last = shared(playing, dt)
  return last
}
