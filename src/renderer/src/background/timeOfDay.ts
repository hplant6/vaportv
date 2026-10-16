import type { SunTimes } from '../../../shared/sun'
import type { BackdropTime } from '../../../shared/types'

/** Uniform values for the sea shader at one moment of the day. */
export interface SceneState {
  /** Palette pair index (see sCol in seaShader.ts). */
  scene: number
  /** 0..1 blend across that pair. */
  blend: number
  /** 0 = sunrise, 1 = sunset, 1..2 = overnight below the horizon. */
  sun: number
  /** 0..1 star visibility. */
  stars: number
}

// Palette pairs in the shader.
const DAWN_TO_DAY = 0
const DAY_TO_DUSK = 1
const NIGHT_TO_PREDAWN = 4
const PREDAWN_TO_DAWN = 5
const DUSK_TO_NIGHT = 6

const DAY = 1440

// Minutes relative to sunrise / sunset.
const PREDAWN_BEGINS = -90
const PREDAWN_FULL = -30
const DAWN_FULL = 15
const DAYLIGHT_FULL = 150
const NIGHT_FULL = 75
const STARS_IN = { from: 35, to: 80 } // after sunset
const STARS_OUT = { from: 70, to: 25 } // before sunrise

const wrap = (minutes: number): number => ((minutes % DAY) + DAY) % DAY
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x))
const smooth = (x: number): number => {
  const t = clamp01(x)
  return t * t * (3 - 2 * t)
}

/** Fraction of the way through [from, to], or null when outside it. Handles spans crossing midnight. */
function progress(minutes: number, from: number, to: number): number | null {
  if (to <= from) return null
  for (const t of [minutes, minutes + DAY, minutes - DAY]) {
    if (t >= from && t < to) return (t - from) / (to - from)
  }
  return null
}

export function sceneAt(minutes: number, { sunrise, sunset }: SunTimes): SceneState {
  const noon = (sunrise + sunset) / 2
  const dayLength = sunset - sunrise
  const isDay = minutes >= sunrise && minutes <= sunset

  const sinceSunset = wrap(minutes - sunset)
  const untilSunrise = wrap(sunrise - minutes)
  const sun = isDay ? (minutes - sunrise) / dayLength : 1 + sinceSunset / (DAY - dayLength)
  const stars = isDay
    ? 0
    : Math.min(
        smooth((sinceSunset - STARS_IN.from) / (STARS_IN.to - STARS_IN.from)),
        smooth((untilSunrise - STARS_OUT.to) / (STARS_OUT.from - STARS_OUT.to))
      )

  // The day -> dusk pair eases in very late inside the shader, so it can span the whole afternoon.
  const spans: [from: number, to: number, scene: number][] = [
    [sunrise + PREDAWN_BEGINS, sunrise + PREDAWN_FULL, NIGHT_TO_PREDAWN],
    [sunrise + PREDAWN_FULL, sunrise + DAWN_FULL, PREDAWN_TO_DAWN],
    [sunrise + DAWN_FULL, Math.min(sunrise + DAYLIGHT_FULL, noon), DAWN_TO_DAY],
    [noon, sunset, DAY_TO_DUSK],
    [sunset, sunset + NIGHT_FULL, DUSK_TO_NIGHT]
  ]
  for (const [from, to, scene] of spans) {
    const blend = progress(minutes, from, to)
    if (blend !== null) return { scene, blend, sun, stars }
  }

  // Between spans: full daylight before noon, otherwise full night.
  return isDay ? { scene: DAY_TO_DUSK, blend: 0, sun, stars } : { scene: NIGHT_TO_PREDAWN, blend: 0, sun, stars }
}

/** Minutes after local midnight, with seconds as a fraction so the scene moves continuously. */
export function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60
}

/**
 * The minute to draw for a fixed backdrop setting, relative to today's sun so
 * each lands on that look whatever the season. Null for 'auto' (follow the clock).
 */
export function heldMinutes(time: BackdropTime, { sunrise, sunset }: SunTimes): number | null {
  switch (time) {
    case 'dawn':
      return sunrise
    case 'day':
      return (sunrise + sunset) / 2
    case 'sunset':
      return sunset
    case 'night':
      return wrap(sunset + 4 * 60)
    default:
      return null
  }
}
