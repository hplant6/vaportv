import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
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

// A corner of the top bar: a row of the layouts chosen in Settings → Home, after Henry's
// Figma set. Each is a big value with a label, or a two-line stack, beside it; in the right
// corner the stack comes first, so the big values sit against the screen's edges.

/** Settings fires this after changing what the corners show. */
export const CLOCK_CHANGED_EVENT = 'steamtv:clock-changed'

/** Room in a corner before the bar's tabs (px); a wider row is scaled down to fit. */
const ROOM = 320
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

/** A sensor's °C, in the weather's unit so every temperature on the bar agrees. */
function useDegrees(): (celsius: number | null) => string {
  const unit = useWeather()?.unit
  return (celsius) => (celsius === null ? '--' : `${unit === 'fahrenheit' ? Math.round((celsius * 9) / 5 + 32) : celsius}°`)
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

function Widget({ id, side }: { id: ClockWidget; side: 'left' | 'right' }) {
  const now = useNow()
  const weather = useWeather()
  const degrees = useDegrees()
  const needsStats = id === 'cpuUsage' || id === 'cpuTemp' || id === 'gpuUsage' || id === 'gpuTemp'
  const stats = needsStats ? <Stats id={id} side={side} degrees={degrees} /> : null
  const temp = weather ? `${weather.temperature}°` : '--'

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
function Stats({ id, side, degrees }: { id: 'cpuUsage' | 'cpuTemp' | 'gpuUsage' | 'gpuTemp'; side: 'left' | 'right'; degrees: (c: number | null) => string }) {
  const stats = useStats()
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

let corners: ClockCorners = DEFAULT_CLOCK_CORNERS

function useCorners(): ClockCorners {
  const [value, setValue] = useState(corners)
  useEffect(() => {
    const load = (): void =>
      void window.steamtv.clock.get().then((next) => {
        corners = next
        setValue(next)
      })
    load()
    window.addEventListener(CLOCK_CHANGED_EVENT, load)
    return () => window.removeEventListener(CLOCK_CHANGED_EVENT, load)
  }, [])
  return value
}

/** One corner of the top bar, scaled down if its row is wider than the corner. */
export function ClockCorner({ side }: { side: 'left' | 'right' }) {
  const widgets = useCorners()[side]
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = (): void => setScale(Math.min(1, ROOM / el.scrollWidth))
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => observer.disconnect()
  }, [widgets])

  if (!widgets.length) return null
  return (
    <div ref={ref} className={`clock-corner ${side} display`} style={scale < 1 ? { transform: `scale(${scale})` } : undefined}>
      {widgets.map((id) => (
        <Widget key={id} id={id} side={side} />
      ))}
    </div>
  )
}
