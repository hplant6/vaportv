/** Sunrise and sunset as minutes after local midnight. */
export interface SunTimes {
  sunrise: number
  sunset: number
}

/** Used when no location is configured. */
export const DEFAULT_SUN_TIMES: SunTimes = { sunrise: 6 * 60 + 30, sunset: 18 * 60 + 30 }

const RAD = Math.PI / 180
/** Sun's centre this far below the horizon at rise/set (refraction + disc radius). */
const ZENITH = 90.833 * RAD

/** NOAA sunrise equation. Longitude is east-positive. */
export function sunTimes(date: Date, latitude: number, longitude: number): SunTimes {
  const startOfYear = Date.UTC(date.getFullYear(), 0, 1)
  const dayOfYear = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - startOfYear) / 86_400_000)
  const g = ((2 * Math.PI) / 365) * dayOfYear

  const equationOfTime =
    229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g))
  const declination =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g)

  const lat = latitude * RAD
  // Clamped so polar day/night degrade to a 24h or 0h day instead of NaN.
  const cosHourAngle = Math.cos(ZENITH) / (Math.cos(lat) * Math.cos(declination)) - Math.tan(lat) * Math.tan(declination)
  const hourAngle = Math.acos(Math.max(-1, Math.min(1, cosHourAngle))) / RAD

  const toLocal = (utcMinutes: number): number => (((utcMinutes - date.getTimezoneOffset()) % 1440) + 1440) % 1440
  return {
    sunrise: toLocal(720 - 4 * (longitude + hourAngle) - equationOfTime),
    sunset: toLocal(720 - 4 * (longitude - hourAngle) - equationOfTime)
  }
}
