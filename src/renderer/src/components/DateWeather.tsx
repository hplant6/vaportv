import { useEffect, useState, type ReactNode } from 'react'
import type { Weather } from '../../../shared/types'
import { WEATHER_CHANGED_EVENT } from './LocationDialog'
import { useNow } from './useNow'

const REFRESH = 15 * 60 * 1000

/** Top left: temperature and date, then `after` (the Settings button). */
export function DateWeather({ after }: { after?: ReactNode }) {
  const now = useNow()
  const [weather, setWeather] = useState<Weather | null>(null)

  useEffect(() => {
    const load = (): Promise<void> => window.steamtv.getWeather().then(setWeather)
    load()
    const timer = setInterval(load, REFRESH)
    window.addEventListener(WEATHER_CHANGED_EVENT, load)
    return () => {
      clearInterval(timer)
      window.removeEventListener(WEATHER_CHANGED_EVENT, load)
    }
  }, [])

  const date = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <div className="date-weather display">
      {weather && <span className="temp">{weather.temperature}°</span>}
      <span className="date">{date}</span>
      {after}
    </div>
  )
}
