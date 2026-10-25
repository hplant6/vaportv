import type { ClockCorners, ClockWidget } from './types'

/** Every layout a corner of the top bar can show, in the order Settings lists them. */
export const CLOCK_WIDGETS: ClockWidget[] = ['dateTemp', 'time', 'date', 'weather', 'battery', 'cpuUsage', 'cpuTemp', 'gpuUsage', 'gpuTemp']

/** A corner fits two before it runs into the bar's tabs. */
export const CORNER_ROOM = 2

/** The bar as it always was: temperature and date on the left, the time and battery on the right. */
export const DEFAULT_CLOCK_CORNERS: ClockCorners = { left: ['dateTemp'], right: ['time', 'battery'] }

/** Known layouts only, each in one corner at most, and no more than a corner holds. */
export function cleanClockCorners(corners: Partial<ClockCorners> | undefined): ClockCorners {
  if (!corners) return DEFAULT_CLOCK_CORNERS
  const seen = new Set<ClockWidget>()
  const clean = (list: unknown): ClockWidget[] =>
    (Array.isArray(list) ? list : [])
      .filter((w): w is ClockWidget => CLOCK_WIDGETS.includes(w) && !seen.has(w) && !!seen.add(w))
      .slice(0, CORNER_ROOM)
  return { left: clean(corners.left), right: clean(corners.right) }
}
