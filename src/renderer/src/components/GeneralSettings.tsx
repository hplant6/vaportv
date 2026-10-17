import { useCallback, useEffect, useState } from 'react'
import type { LocationSettings, TemperatureUnit } from '../../../shared/types'
import { OverStage } from './GooglePhotos'
import { LocationDialog, WEATHER_CHANGED_EVENT } from './LocationDialog'
import { OPEN_WELCOME_EVENT } from './Welcome'

const UNITS: { id: TemperatureUnit; name: string; detail?: string }[] = [
  { id: 'auto', name: 'Automatic', detail: 'By country' },
  { id: 'fahrenheit', name: 'Fahrenheit', detail: '°F' },
  { id: 'celsius', name: 'Celsius', detail: '°C' }
]

/** Settings → General: where the weather is for, its units, and the welcome tour. */
export function GeneralSettings() {
  const [location, setLocation] = useState<LocationSettings | null>(null)
  const [picking, setPicking] = useState(false)

  const load = useCallback(() => {
    window.steamtv.location.get().then(setLocation)
  }, [])
  useEffect(() => {
    load()
    window.addEventListener(WEATHER_CHANGED_EVENT, load)
    return () => window.removeEventListener(WEATHER_CHANGED_EVENT, load)
  }, [load])

  const chooseUnit = (unit: TemperatureUnit): void => {
    if (!location || location.unit === unit) return
    setLocation({ ...location, unit })
    window.steamtv.location.setUnit(unit).then(() => window.dispatchEvent(new Event(WEATHER_CHANGED_EVENT)))
  }

  const closePicker = useCallback(() => {
    setPicking(false)
    document.querySelector<HTMLElement>('#settings-weather-location')?.focus()
  }, [])

  return (
    <>
      <div className="settings-group">
        <h3 className="settings-heading display">Weather</h3>
        <div className="setting-list" data-focus-memory="settings-weather">
          <button
            id="settings-weather-location"
            className="setting-row"
            tabIndex={-1}
            data-focusable=""
            data-select-sound="move"
            onClick={() => setPicking(true)}
          >
            <span className="setting-name display">Location</span>
            <span className="setting-detail">
              {location?.place ? `${location.place} · ${location.chosen ? 'chosen' : 'detected'}` : 'Not found yet · A to choose'}
            </span>
          </button>
        </div>
      </div>

      <div className="settings-group">
        <h3 className="settings-heading display">Temperature</h3>
        <div className="setting-list" data-focus-memory="settings-units">
          {location &&
            UNITS.map((u) => (
              <button
                key={u.id}
                className={`setting-row${location.unit === u.id ? ' on' : ''}`}
                tabIndex={-1}
                role="radio"
                aria-checked={location.unit === u.id}
                data-focusable=""
                data-select-sound="move"
                onClick={() => chooseUnit(u.id)}
              >
                <span className="radio" aria-hidden="true" />
                <span className="setting-name display">{u.name}</span>
                {u.detail && <span className="setting-detail">{u.detail}</span>}
              </button>
            ))}
        </div>
      </div>

      <div className="settings-group">
        <h3 className="settings-heading display">Help</h3>
        <div className="setting-list" data-focus-memory="settings-help">
          <button
            className="setting-row"
            tabIndex={-1}
            data-focusable=""
            data-select-sound="move"
            onClick={() => window.dispatchEvent(new Event(OPEN_WELCOME_EVENT))}
          >
            <span className="setting-name display">Show the welcome tour</span>
            <span className="setting-detail">The buttons, and setting up apps</span>
          </button>
        </div>
      </div>

      {picking && (
        <OverStage>
          <LocationDialog onClose={closePicker} />
        </OverStage>
      )}
    </>
  )
}
