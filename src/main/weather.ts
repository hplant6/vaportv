import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Weather } from '../shared/types'
import { getLocation, onLocationChange } from './location'

const TTL = 15 * 60 * 1000
/** A forecast kept on disk is shown after a failed fetch (stale beats blank) for up to this long. */
const STALE_LIMIT = 24 * 60 * 60 * 1000
/** One quick retry when open-meteo is briefly down (it answered 503 for a few minutes once). */
const RETRY_MS = 2000
const SAVED = join(homedir(), '.cache', 'steamtv', 'weather.json')

/** The last good forecast, and where it was for (so another place's isn't shown). */
interface Saved {
  at: number
  key: string
  value: Weather
}

let cached: Saved | null = null
let loaded = false
// A new place or unit: fetch again rather than show the old one for 15 minutes.
onLocationChange(() => (cached = null))

async function lastSaved(key: string): Promise<Saved | null> {
  if (!loaded) {
    loaded = true
    cached ??= await readFile(SAVED, 'utf8').then(
      (text) => JSON.parse(text) as Saved,
      () => null
    )
  }
  return cached?.key === key ? cached : null
}

async function fetchCurrent(url: URL): Promise<number> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json()
      return Math.round(body.current.temperature_2m)
    } catch (err) {
      if (attempt >= 1) throw err
      await new Promise((resolve) => setTimeout(resolve, RETRY_MS))
    }
  }
}

/**
 * The temperature where the weather is for, and the town. When it can't be had (open-meteo down, no
 * network), the last forecast for that place if it's under a day old, else just the town, no temperature.
 */
export async function getWeather(): Promise<Weather | null> {
  const weather = await getLocation()
  if (!weather) return cached?.value ?? null
  // The town alone: "Long Beach, California" → "Long Beach".
  const city = weather.place?.split(',')[0].trim() || undefined
  const key = `${weather.latitude},${weather.longitude},${weather.unit}`
  const saved = await lastSaved(key)
  if (saved && Date.now() - saved.at < TTL) return saved.value

  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(weather.latitude))
  url.searchParams.set('longitude', String(weather.longitude))
  url.searchParams.set('current', 'temperature_2m')
  url.searchParams.set('temperature_unit', weather.unit)

  try {
    const value: Weather = { temperature: await fetchCurrent(url), unit: weather.unit, city }
    cached = { at: Date.now(), key, value }
    await mkdir(dirname(SAVED), { recursive: true })
    await writeFile(SAVED, JSON.stringify(cached)).catch(() => {})
    return value
  } catch (err) {
    console.error('steamtv: weather fetch failed:', err)
    if (saved && Date.now() - saved.at < STALE_LIMIT) return { ...saved.value, city }
    return { temperature: null, unit: weather.unit, city }
  }
}
