import type { ClockCorners, ClockWidget } from './types'

/** Every layout a corner of the top bar can show, in the order Settings lists them. */
export const CLOCK_WIDGETS: ClockWidget[] = ['dateTemp', 'time', 'date', 'weather', 'battery', 'cpuUsage', 'cpuTemp', 'gpuUsage', 'gpuTemp']

/** A corner fits one before it runs into the bar's tabs. */
export const CORNER_ROOM = 1

/** Temperature and date on the left, the time on the right, as the bar always was. */
export const DEFAULT_CLOCK_CORNERS: ClockCorners = { left: ['dateTemp'], right: ['time'] }

/** Known layouts only, each in one corner at most, and no more than a corner holds (the first). */
export function cleanClockCorners(corners: Partial<ClockCorners> | undefined): ClockCorners {
  if (!corners) return DEFAULT_CLOCK_CORNERS
  const seen = new Set<ClockWidget>()
  const clean = (list: unknown): ClockWidget[] =>
    (Array.isArray(list) ? list : [])
      .filter((w): w is ClockWidget => CLOCK_WIDGETS.includes(w) && !seen.has(w) && !!seen.add(w))
      .slice(0, CORNER_ROOM)
  return { left: clean(corners.left), right: clean(corners.right) }
}
