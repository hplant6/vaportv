import { useSyncExternalStore, type ReactNode } from 'react'
import type { ClockCorners, ClockWidget, SystemStats, Weather } from '../../../shared/types'
import { DEFAULT_CLOCK_CORNERS } from '../../../shared/clock'
import { WEATHER_CHANGED_EVENT } from './LocationDialog'
import { useNow } from './useNow'
import { useBattery } from '../power'
import charging from '../assets/battery/charg.svg'
import full from '../assets/battery/full.svg'
import high from '../assets/battery/high.svg'
import medium from '../assets/battery/med.svg'
import empty from '../assets/battery/low.svg'

// A corner of the top bar: the layout chosen for it in Settings → Home, after Henry's
// Figma set. Each is a big value with a label, or a two-line stack, beside it; in the right
// corner the stack comes first, so the big values sit against the screen's edges.

/** Settings fires this after changing what the corners show. */
export const CLOCK_CHANGED_EVENT = 'steamtv:clock-changed'

const WEATHER_REFRESH = 15 * 60 * 1000
const STATS_REFRESH = 2000
/** The battery turns red at or below this. */
const LOW_BATTERY = 15

// ── Shared sources: one weather fetch and one stats poll, however many layouts use them ──

function store<T>(initial: T, start: (set: (value: T) => void) => () => void) {
  let value = initial
  let stop: (() => void) | null = null
  const listeners = new Set<() => void>()
  const set = (next: T): void => {
    value = next
    listeners.forEach((l) => l())
  }
  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      stop ??= start(set)
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) {
          stop?.()
          stop = null
        }
      }
    },
    get: () => value
  }
}

const weatherStore = store<Weather | null>(null, (set) => {
  const load = (): void => void window.steamtv.getWeather().then(set)
  load()
  const timer = setInterval(load, WEATHER_REFRESH)
  window.addEventListener(WEATHER_CHANGED_EVENT, load)
  return () => {
    clearInterval(timer)
    window.removeEventListener(WEATHER_CHANGED_EVENT, load)
  }
})

const NO_STATS: SystemStats = { cpuUsage: null, cpuTemp: null, gpuUsage: null, gpuTemp: null }
const statsStore = store<SystemStats>(NO_STATS, (set) => {
  const load = (): void => void window.steamtv.getSystemStats().then(set, () => set(NO_STATS))
  load()
  const timer = setInterval(load, STATS_REFRESH)
  return () => clearInterval(timer)
})

const useWeather = (): Weather | null => useSyncExternalStore(weatherStore.subscribe, weatherStore.get)
const useStats = (): SystemStats => useSyncExternalStore(statsStore.subscribe, statsStore.get)

// ── Pieces ──

const percent = (value: number | null): string => (value === null ? '--' : `${value}%`)

/** A temperature with its unit, e.g. "79°F". */
const degrees = (value: number | null | undefined, unit: 'celsius' | 'fahrenheit'): string =>
  value === null || value === undefined ? '--' : `${value}°${unit === 'fahrenheit' ? 'F' : 'C'}`

/** A sensor's °C in the unit chosen for the CPU and GPU (Settings → Home), apart from the weather's. */
function sensorDegrees(celsius: number | null, unit: 'celsius' | 'fahrenheit'): string {
  return degrees(celsius === null || unit === 'celsius' ? celsius : Math.round((celsius * 9) / 5 + 32), unit)
}

function timeParts(now: Date): { time: string; meridiem: string } {
  const hours = now.getHours()
  return { time: `${hours % 12 || 12}:${String(now.getMinutes()).padStart(2, '0')}`, meridiem: hours < 12 ? 'am' : 'pm' }
}

const shortDate = (now: Date): string => now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

/** A big value with a label (one line) or a stack (two) beside it; the right corner mirrors it. */
function Layout({ side, big, label, stack, lead }: { side: 'left' | 'right'; big?: ReactNode; label?: string; stack?: [string, string]; lead?: ReactNode }) {
  const parts = [
    lead,
    big !== undefined && (
      <span key="big" className="clock-big">
        {big}
      </span>
    ),
    label && (
      <span key="label" className="clock-label">
        {label}
      </span>
    ),
    stack && (
      <span key="stack" className="clock-stack">
        <span className="clock-stack-top">{stack[0]}</span>
        <span className="clock-stack-bottom">{stack[1]}</span>
      </span>
    )
  ].filter(Boolean)
  return <span className={`clock-widget ${side}`}>{side === 'right' ? parts.reverse() : parts}</span>
}

function Battery({ side }: { side: 'left' | 'right' }) {
  const battery = useBattery()
  if (!battery) return null
  const low = battery.percent <= LOW_BATTERY && !battery.charging
  const icon = battery.charging ? charging : battery.percent >= 80 ? full : battery.percent >= 55 ? high : battery.percent >= 25 ? medium : empty
  return (
    <span className={low ? 'clock-battery low' : 'clock-battery'} aria-label={`Battery ${battery.percent}%${battery.charging ? ', charging' : ''}`}>
      <Layout
        side={side}
        // A mask, not an image: it takes the text colour, so it can turn red.
        lead={<span key="icon" className="clock-battery-icon" style={{ maskImage: `url("${icon}")` }} aria-hidden="true" />}
        stack={[`${battery.percent}%`, 'Batt']}
      />
    </span>
  )
}

/** One layout, as a corner draws it (Settings shows it too, as a preview). */
export function ClockLayout({ id, side }: { id: ClockWidget; side: 'left' | 'right' }) {
  const now = useNow()
  const weather = useWeather()
  const sensorUnit = useCorners().sensorUnit
  const needsStats = id === 'cpuUsage' || id === 'cpuTemp' || id === 'gpuUsage' || id === 'gpuTemp'
  const stats = needsStats ? <Stats id={id} side={side} unit={sensorUnit} /> : null
  const temp = weather ? degrees(weather.temperature, weather.unit) : '--'

  switch (id) {
    case 'dateTemp':
      // The bar as it always was: the temperature small, then the date.
      return (
        <span className="clock-widget date-temp">
          {weather && <span className="temp">{temp}</span>}
          <span className="clock-big">{shortDate(now)}</span>
        </span>
      )
    case 'time': {
      const { time, meridiem } = timeParts(now)
      // The time reads left to right in either corner.
      return <Layout side="left" big={time} label={meridiem} />
    }
    case 'date':
      return <Layout side={side} big={shortDate(now)} />
    case 'weather':
      return <Layout side={side} big={temp} stack={[timeParts(now).time, weather?.city ?? '']} />
    case 'battery':
      return <Battery side={side} />
    default:
      return stats
  }
}

/** The CPU and GPU layouts, which alone need the stats poll. */
function Stats({ id, side, unit }: { id: 'cpuUsage' | 'cpuTemp' | 'gpuUsage' | 'gpuTemp'; side: 'left' | 'right'; unit: 'celsius' | 'fahrenheit' }) {
  const stats = useStats()
  const degrees = (celsius: number | null): string => sensorDegrees(celsius, unit)
  switch (id) {
    case 'cpuUsage':
      return <Layout side={side} big={percent(stats.cpuUsage)} stack={['CPU', degrees(stats.cpuTemp)]} />
    case 'cpuTemp':
      return <Layout side={side} big={degrees(stats.cpuTemp)} label="CPU" />
    case 'gpuUsage':
      return <Layout side={side} big={percent(stats.gpuUsage)} label="GPU" />
    case 'gpuTemp':
      return <Layout side={side} big={degrees(stats.gpuTemp)} stack={['GPU', percent(stats.gpuUsage)]} />
  }
}

const cornersStore = store<ClockCorners>(DEFAULT_CLOCK_CORNERS, (set) => {
  const load = (): void => void window.steamtv.clock.get().then(set)
  load()
  window.addEventListener(CLOCK_CHANGED_EVENT, load)
  return () => window.removeEventListener(CLOCK_CHANGED_EVENT, load)
})

const useCorners = (): ClockCorners => useSyncExternalStore(cornersStore.subscribe, cornersStore.get)

/** One corner of the top bar. */
export function ClockCorner({ side }: { side: 'left' | 'right' }) {
  const widgets = useCorners()[side]
  if (!widgets.length) return null
  return (
    <div className={`clock-corner ${side} display`}>
      {widgets.map((id) => (
        <ClockLayout key={id} id={id} side={side} />
      ))}
    </div>
  )
}
