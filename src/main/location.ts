import type { LocationSettings, PlaceMatch, TemperatureUnit } from '../shared/types'
import { loadConfig, saveConfig } from './config'

export interface Location {
  latitude: number
  longitude: number
  unit: 'fahrenheit' | 'celsius'
  /** e.g. "Long Beach, California", where known. */
  place?: string
}

// Countries that report temperature in Fahrenheit.
const FAHRENHEIT = new Set(['US', 'LR', 'MM', 'BS', 'BZ', 'KY', 'PW', 'FM', 'MH'])

// The box doesn't move; one successful IP lookup per run is enough.
let detected: Promise<Omit<Location, 'unit'> & { country: string; place: string }> | null = null

function detect(): typeof detected {
  detected ??= fetch('https://ipwho.is/', { signal: AbortSignal.timeout(8000) })
    .then((res) => res.json())
    .then((body) => {
      if (!body.success) throw new Error(body.message ?? 'lookup failed')
      const place = [body.city, body.region].filter(Boolean).join(', ') || body.country || ''
      return { latitude: body.latitude, longitude: body.longitude, country: body.country_code, place }
    })
    .catch((err) => {
      detected = null // retry on the next call
      throw err
    })
  return detected
}

/**
 * Location for weather and sunrise/sunset: `weather.latitude/longitude` in the
 * config file when set, otherwise looked up from the public IP address.
 */
export async function getLocation(): Promise<Location | null> {
  const { weather } = await loadConfig()
  if (weather?.latitude !== undefined && weather.longitude !== undefined) {
    const unit = weather.unit ?? (weather.country && !FAHRENHEIT.has(weather.country) ? 'celsius' : 'fahrenheit')
    return { latitude: weather.latitude, longitude: weather.longitude, unit, place: weather.place }
  }
  try {
    const found = await detect()!
    const unit = weather?.unit ?? (FAHRENHEIT.has(found.country) ? 'fahrenheit' : 'celsius')
    return { latitude: found.latitude, longitude: found.longitude, unit, place: found.place || undefined }
  } catch (err) {
    console.error('steamtv: location lookup failed:', err)
    return null
  }
}

/** Fired after the location or units change, so the weather is fetched again. */
const changeListeners = new Set<() => void>()
export function onLocationChange(listener: () => void): void {
  changeListeners.add(listener)
}

/** What Settings shows: where the weather is for, and whether that was chosen or guessed. */
export async function locationSettings(): Promise<LocationSettings> {
  const { weather } = await loadConfig()
  const chosen = weather?.latitude !== undefined && weather.longitude !== undefined
  const found = chosen ? null : await detect()!.catch(() => null)
  return {
    place: chosen ? (weather?.place ?? `${weather!.latitude!.toFixed(2)}, ${weather!.longitude!.toFixed(2)}`) : (found?.place ?? null),
    chosen,
    unit: weather?.unit ?? 'auto'
  }
}

/** Places matching a name, from Open-Meteo's place search (free, no key). */
export async function searchPlaces(query: string): Promise<PlaceMatch[]> {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search')
  url.searchParams.set('name', query)
  url.searchParams.set('count', '10')
  url.searchParams.set('language', 'en')
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`Place search didn't answer (${res.status}).`)
  const body = (await res.json()) as {
    results?: { name: string; admin1?: string; country?: string; country_code?: string; latitude: number; longitude: number }[]
  }
  return (body.results ?? []).map((r) => ({
    name: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
    latitude: r.latitude,
    longitude: r.longitude,
    country: r.country_code
  }))
}

/** Uses a chosen place for the weather, or (null) goes back to guessing from the connection. */
export async function setPlace(place: PlaceMatch | null): Promise<void> {
  const { weather } = await loadConfig()
  await saveConfig({
    weather: place
      ? { ...weather, latitude: place.latitude, longitude: place.longitude, place: place.name, country: place.country }
      : { unit: weather?.unit }
  })
  changeListeners.forEach((listener) => listener())
}

export async function setTemperatureUnit(unit: TemperatureUnit): Promise<void> {
  const { weather } = await loadConfig()
  await saveConfig({ weather: { ...weather, unit: unit === 'auto' ? undefined : unit } })
  changeListeners.forEach((listener) => listener())
}
