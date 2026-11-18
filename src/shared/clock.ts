import type { ClockCorners, ClockWidget } from './types'

/** Every layout a corner of the top bar can show, in the order Settings lists them. */
export const CLOCK_WIDGETS: ClockWidget[] = ['dateTemp', 'time', 'date', 'weather', 'logo', 'battery', 'cpuUsage', 'cpuTemp', 'gpuUsage', 'gpuTemp']

/** A corner fits one before it runs into the bar's tabs. */
export const CORNER_ROOM = 1

/** Temperature and date on the left, the time on the right, as the bar always was. */
export const DEFAULT_CLOCK_CORNERS: ClockCorners = { left: ['dateTemp'], right: ['time'], sensorUnit: 'celsius' }

/**
 * Known layouts only, and no more than a corner holds (the first). Both corners may show the same one.
 * A corner saved showing the song (a layout that's gone: the bar's second row shows the music now)
 * goes back to what it showed to begin with.
 */
export function cleanClockCorners(corners: Partial<ClockCorners> | undefined): ClockCorners {
  if (!corners) return DEFAULT_CLOCK_CORNERS
  const clean = (list: unknown, side: 'left' | 'right'): ClockWidget[] => {
    const saved = Array.isArray(list) ? list : []
    const known = saved.filter((w): w is ClockWidget => CLOCK_WIDGETS.includes(w)).slice(0, CORNER_ROOM)
    return !known.length && saved.includes('song') ? DEFAULT_CLOCK_CORNERS[side] : known
  }
  return { left: clean(corners.left, 'left'), right: clean(corners.right, 'right'), sensorUnit: corners.sensorUnit === 'fahrenheit' ? 'fahrenheit' : 'celsius' }
}
