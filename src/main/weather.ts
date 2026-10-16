import type { Weather } from '../shared/types'
import { getLocation } from './location'

const TTL = 15 * 60 * 1000

let cached: { at: number; value: Weather } | null = null

export async function getWeather(): Promise<Weather | null> {
  if (cached && Date.now() - cached.at < TTL) return cached.value

  const weather = await getLocation()
  if (!weather) return cached?.value ?? null

  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(weather.latitude))
  url.searchParams.set('longitude', String(weather.longitude))
  url.searchParams.set('current', 'temperature_2m')
  url.searchParams.set('temperature_unit', weather.unit)

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = await res.json()
    const value = { temperature: Math.round(body.current.temperature_2m) }
    cached = { at: Date.now(), value }
    return value
  } catch (err) {
    console.error('steamtv: weather fetch failed:', err)
    // Stale beats blank on a TV that is left on all day.
    return cached?.value ?? null
  }
}
