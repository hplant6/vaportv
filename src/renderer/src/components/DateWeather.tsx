import { useEffect, useState } from 'react'
import type { Weather } from '../../../shared/types'
import { useNow } from './useNow'

const REFRESH = 15 * 60 * 1000

export function DateWeather() {
  const now = useNow()
  const [weather, setWeather] = useState<Weather | null>(null)

  useEffect(() => {
    const load = (): Promise<void> => window.steamtv.getWeather().then(setWeather)
    load()
    const timer = setInterval(load, REFRESH)
    return () => clearInterval(timer)
  }, [])

  const date = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <div className="date-weather display">
      {weather && <span className="temp">{weather.temperature}°</span>}
      <span className="date">{date}</span>
    </div>
  )
}
