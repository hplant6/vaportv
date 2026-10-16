import { loadConfig } from './config'

export interface Location {
  latitude: number
  longitude: number
  unit: 'fahrenheit' | 'celsius'
}

// Countries that report temperature in Fahrenheit.
const FAHRENHEIT = new Set(['US', 'LR', 'MM', 'BS', 'BZ', 'KY', 'PW', 'FM', 'MH'])

// The box doesn't move; one successful IP lookup per run is enough.
let detected: Promise<Omit<Location, 'unit'> & { country: string }> | null = null

function detect(): typeof detected {
  detected ??= fetch('https://ipwho.is/', { signal: AbortSignal.timeout(8000) })
    .then((res) => res.json())
    .then((body) => {
      if (!body.success) throw new Error(body.message ?? 'lookup failed')
      return { latitude: body.latitude, longitude: body.longitude, country: body.country_code }
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
    return { latitude: weather.latitude, longitude: weather.longitude, unit: weather.unit ?? 'fahrenheit' }
  }
  try {
    const found = await detect()!
    const unit = weather?.unit ?? (FAHRENHEIT.has(found.country) ? 'fahrenheit' : 'celsius')
    return { latitude: found.latitude, longitude: found.longitude, unit }
  } catch (err) {
    console.error('steamtv: location lookup failed:', err)
    return null
  }
}
