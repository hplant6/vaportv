import { useCallback, useEffect, useState } from 'react'
import type { IntroSettings, LocationSettings, SystemUpdate, TemperatureUnit, UpdateState } from '../../../shared/types'
import { OverStage } from './GooglePhotos'
import { LocationDialog, WEATHER_CHANGED_EVENT } from './LocationDialog'
import { OPEN_UPDATE_EVENT } from './UpdateDialog'
import { PLAY_INTRO_EVENT } from './Intro'
import { MediaServerSettings } from './MediaServerSettings'

const UNITS: { id: TemperatureUnit; name: string; detail?: string }[] = [
  { id: 'auto', name: 'Automatic', detail: 'By country' },
  { id: 'fahrenheit', name: 'Fahrenheit', detail: '°F' },
  { id: 'celsius', name: 'Celsius', detail: '°C' }
]

/** Settings → General: where the weather is for, its units, the intro video and updates. */
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

  const [intro, setIntro] = useState<IntroSettings | null>(null)
  useEffect(() => {
    window.steamtv.intro.get().then(setIntro)
  }, [])
  const chooseIntro = (choice: string): void => {
    if (!intro || intro.choice === choice) return
    setIntro({ ...intro, choice })
    window.steamtv.intro.set(choice)
  }

  const [updates, setUpdates] = useState<UpdateState | null>(null)
  const [checking, setChecking] = useState(false)
  useEffect(() => {
    window.steamtv.updates.get().then(setUpdates)
    return window.steamtv.updates.onAvailable(setUpdates)
  }, [])

  // With an update: its window. Without: ask GitHub now.
  const pressUpdates = (): void => {
    if (!updates?.enabled || checking) return
    if (updates.update) {
      window.dispatchEvent(new CustomEvent(OPEN_UPDATE_EVENT, { detail: updates }))
      return
    }
    setChecking(true)
    window.steamtv.updates.check().then((next) => {
      setChecking(false)
      setUpdates(next)
      if (next.update) window.dispatchEvent(new CustomEvent(OPEN_UPDATE_EVENT, { detail: next }))
    })
  }

  const updateDetail = !updates
    ? ''
    : !updates.enabled
      ? 'This build is updated by hand'
      : checking
        ? 'Checking…'
        : updates.update
          ? `${updates.update.version} is out · A for what's new`
          : updates.error
            ? `Couldn't check: ${updates.error} · A to try again`
            : 'Up to date · A to check now'

  // The box's Flatpaks (what Discover offers in Desktop Mode): checked as Settings opens,
  // all updated with one press.
  const [system, setSystem] = useState<SystemUpdate[] | null>(null)
  const [systemError, setSystemError] = useState<string | null>(null)
  const [systemBusy, setSystemBusy] = useState<string | null>(null)
  const checkSystem = useCallback(() => {
    setSystem(null)
    setSystemError(null)
    window.steamtv.systemUpdates.list().then(setSystem, (err: Error) => {
      setSystem([])
      setSystemError(err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    })
  }, [])
  useEffect(() => {
    checkSystem()
    return window.steamtv.systemUpdates.onProgress(setSystemBusy)
  }, [checkSystem])

  const pressSystem = (): void => {
    if (systemBusy || !system) return
    if (systemError || system.length === 0) return checkSystem()
    setSystemBusy('Starting…')
    window.steamtv.systemUpdates.install().then((err) => {
      setSystemBusy(null)
      checkSystem()
      if (err) setSystemError(err)
    })
  }

  const systemDetail = systemBusy
    ? systemBusy
    : !system
      ? 'Checking…'
      : systemError
        ? `Couldn't ${system.length ? 'update' : 'check'}: ${systemError} · A to try again`
        : system.length === 0
          ? 'Up to date · A to check again'
          : `${pendingSummary(system)} · A to update all`

  const closePicker = useCallback(() => {
    setPicking(false)
    document.querySelector<HTMLElement>('#settings-weather-location')?.focus()
  }, [])

  return (
    <>
      <MediaServerSettings />
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
              {location?.place ? `${location.place} · ${location.chosen ? 'chosen' : 'guessed from your internet address'}` : 'Not found yet · A to choose'}
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
        <h3 className="settings-heading display">Intro</h3>
        <div className="setting-list" data-focus-memory="settings-intro">
          {intro?.choices.map((c) => (
            <button
              key={c.id}
              className={`setting-row${intro.choice === c.id ? ' on' : ''}`}
              tabIndex={-1}
              role="radio"
              aria-checked={intro.choice === c.id}
              data-focusable=""
              data-select-sound="move"
              onClick={() => chooseIntro(c.id)}
            >
              <span className="radio" aria-hidden="true" />
              <span className="setting-name display">{c.name}</span>
              {c.id === 'default' && <span className="setting-detail">Default</span>}
            </button>
          ))}
          <button
            className="setting-row"
            tabIndex={-1}
            data-focusable=""
            data-select-sound="move"
            onClick={() => window.dispatchEvent(new Event(PLAY_INTRO_EVENT))}
          >
            <span className="setting-name display">Play now</span>
            <span className="setting-detail">
              {intro?.choice === 'off' ? 'Choose an intro first' : `Your own: put a video in ${intro?.folder ?? 'the intro folder'}`}
            </span>
          </button>
        </div>
      </div>

      <div className="settings-group">
        <h3 className="settings-heading display">Updates</h3>
        <div className="setting-list" data-focus-memory="settings-updates">
          <button className="setting-row" tabIndex={-1} data-focusable="" data-select-sound="move" onClick={pressUpdates}>
            <span className="setting-name display">vaporTV {updates?.current ?? ''}</span>
            <span className="setting-detail">{updateDetail}</span>
          </button>
          <button className="setting-row" tabIndex={-1} data-focusable="" data-select-sound="move" onClick={pressSystem}>
            <span className="setting-name display">Apps and system</span>
            <span className="setting-detail">{systemDetail}</span>
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

/** "Google Chrome, Kodi and 2 runtimes": the apps by name, the runtimes they need counted. */
function pendingSummary(updates: SystemUpdate[]): string {
  const apps = updates.filter((u) => !u.runtime).map((u) => u.name)
  const runtimes = updates.length - apps.length
  const named = apps.length > 3 ? [...apps.slice(0, 2), `${apps.length - 2} more apps`] : apps
  const parts = runtimes ? [...named, `${runtimes} ${runtimes === 1 ? 'runtime' : 'runtimes'}`] : named
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0]
}
