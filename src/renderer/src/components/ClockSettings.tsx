import { useEffect, useState } from 'react'
import type { ClockCorners, ClockWidget } from '../../../shared/types'
import { CLOCK_WIDGETS } from '../../../shared/clock'
import { useBattery } from '../power'
import { CLOCK_CHANGED_EVENT, ClockLayout } from './ClockCorner'

type Side = 'left' | 'right'

const NAMES: Record<ClockWidget, string> = {
  dateTemp: 'Temperature & date',
  time: 'Time',
  date: 'Date',
  weather: 'Weather',
  battery: 'Battery',
  cpuUsage: 'CPU use',
  cpuTemp: 'CPU temperature',
  gpuUsage: 'GPU use',
  gpuTemp: 'GPU temperature'
}

const UNITS: { id: ClockCorners['sensorUnit']; name: string; detail: string }[] = [
  { id: 'celsius', name: 'Celsius', detail: '°C' },
  { id: 'fahrenheit', name: 'Fahrenheit', detail: '°F' }
]

/**
 * Settings → Home: what each corner of the top bar shows, one choice per corner, each row
 * showing the layout itself (live, as that corner draws it) in place of a description.
 */
export function ClockSettings() {
  const [corners, setCorners] = useState<ClockCorners | null>(null)
  const battery = useBattery()

  useEffect(() => {
    window.steamtv.clock.get().then(setCorners)
  }, [])

  const choose = (side: Side, id: ClockWidget | null): void => {
    if (!corners || (corners[side][0] ?? null) === id) return
    const next = { ...corners, [side]: id ? [id] : [] }
    setCorners(next)
    window.steamtv.clock.set(next).then(() => window.dispatchEvent(new Event(CLOCK_CHANGED_EVENT)))
  }

  const chooseUnit = (unit: ClockCorners['sensorUnit']): void => {
    if (!corners || corners.sensorUnit === unit) return
    const next = { ...corners, sensorUnit: unit }
    setCorners(next)
    window.steamtv.clock.set(next).then(() => window.dispatchEvent(new Event(CLOCK_CHANGED_EVENT)))
  }

  const row = (side: Side, id: ClockWidget | null) => {
    const selected = (corners![side][0] ?? null) === id
    const name = id ? NAMES[id] : 'Nothing'
    return (
      <button
        key={id ?? 'none'}
        className={`setting-row${selected ? ' on' : ''}`}
        tabIndex={-1}
        role="radio"
        aria-checked={selected}
        aria-label={name}
        data-focusable=""
        data-select-sound="move"
        onClick={() => choose(side, id)}
      >
        <span className="radio" aria-hidden="true" />
        <span className="setting-name display">{name}</span>
        {id === 'battery' && !battery ? (
          <span className="setting-detail">No battery on this device</span>
        ) : (
          id && (
            <span className="clock-preview display" aria-hidden="true">
              <ClockLayout id={id} side={side} />
            </span>
          )
        )}
      </button>
    )
  }

  const group = (side: Side, heading: string) => (
    <div className="settings-group" key={side}>
      <h3 className="settings-heading display">{heading}</h3>
      <div className="setting-list" data-focus-memory={`settings-clock-${side}`}>
        {CLOCK_WIDGETS.map((id) => row(side, id))}
        {row(side, null)}
      </div>
    </div>
  )

  if (!corners) return null
  return (
    <>
      {group('left', 'Top left corner')}
      {group('right', 'Top right corner')}
      <div className="settings-group">
        <h3 className="settings-heading display">CPU & GPU temperature</h3>
        <p className="settings-help">Apart from the weather's, which is in General.</p>
        <div className="setting-list" data-focus-memory="settings-clock-unit">
          {UNITS.map((u) => (
            <button
              key={u.id}
              className={`setting-row${corners.sensorUnit === u.id ? ' on' : ''}`}
              tabIndex={-1}
              role="radio"
              aria-checked={corners.sensorUnit === u.id}
              aria-label={u.name}
              data-focusable=""
              data-select-sound="move"
              onClick={() => chooseUnit(u.id)}
            >
              <span className="radio" aria-hidden="true" />
              <span className="setting-name display">{u.name}</span>
              <span className="setting-detail">{u.detail}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
