import { useCallback, useEffect, useState } from 'react'
import type { HideableTab, IntroSettings, LocationSettings, TemperatureUnit, UpdateState } from '../../../shared/types'
import { OverStage } from './GooglePhotos'
import { LocationDialog, WEATHER_CHANGED_EVENT } from './LocationDialog'
import { OPEN_UPDATE_EVENT } from './UpdateDialog'
import { PLAY_INTRO_EVENT } from './Intro'
import { TABS } from './NavBar'
import { ToggleRow } from './ToggleRow'
import { refreshTabs } from '../availableTabs'
import { OPEN_WELCOME_EVENT } from './Welcome'
import { toast } from './Toast'

const UNITS: { id: TemperatureUnit; name: string; detail?: string }[] = [
  { id: 'auto', name: 'Automatic', detail: 'By country' },
  { id: 'fahrenheit', name: 'Fahrenheit', detail: '°F' },
  { id: 'celsius', name: 'Celsius', detail: '°C' }
]

/** Settings → General: which tabs show, where the weather is for, its units, the intro video, updates, and the welcome tour. */
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

  // Tabs with something to show, and those switched off; Home always shows.
  // The bar fits `max` tabs (Home included): another can only come on once one goes off.
  const [tabs, setTabs] = useState<{ available: HideableTab[]; hidden: HideableTab[]; shown: HideableTab[]; max: number } | null>(null)
  const loadTabs = useCallback(() => {
    window.steamtv.tabs.get().then(setTabs)
  }, [])
  useEffect(loadTabs, [loadTabs])
  const toggleTab = (id: HideableTab): void => {
    if (!tabs) return
    const on = tabs.shown.includes(id)
    if (!on && tabs.shown.length + 1 >= tabs.max) {
      toast(`The bar fits ${tabs.max} tabs: switch one off first`)
      return
    }
    const hidden = on ? [...tabs.hidden.filter((t) => t !== id), id] : tabs.hidden.filter((t) => t !== id)
    window.steamtv.tabs.setHidden(hidden).then(() => {
      refreshTabs()
      loadTabs()
    })
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

  const closePicker = useCallback(() => {
    setPicking(false)
    document.querySelector<HTMLElement>('#settings-weather-location')?.focus()
  }, [])

  return (
    <>
      <div className="settings-group">
        <h3 className="settings-heading display">Tabs</h3>
        <p className="settings-help">
          Which tabs the top bar shows, up to {tabs?.max ?? 10} with Home (always there). Consoles appear once they have games.
        </p>
        <div className="setting-list" data-focus-memory="settings-tabs">
          {tabs &&
            TABS.filter((t) => tabs.available.includes(t.id as HideableTab)).map((t) => (
              <ToggleRow
                key={t.id}
                label={t.label}
                on={tabs.shown.includes(t.id as HideableTab)}
                onToggle={() => toggleTab(t.id as HideableTab)}
              />
            ))}
        </div>
      </div>

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
