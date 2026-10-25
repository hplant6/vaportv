import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import type { ClockWidget } from '../../../shared/types'
import { CLOCK_WIDGETS, CORNER_ROOM } from '../../../shared/clock'
import { focus, GRAB_CANCEL_EVENT, GRAB_MOVE_EVENT, type Direction } from '../input/focus'
import { CLOCK_CHANGED_EVENT } from './ClockCorner'
import { toast } from './Toast'
import { MoveIcon } from './icons'

type Place = 'left' | 'right' | 'off'
type Places = Record<Place, ClockWidget[]>

const PLACES: Place[] = ['left', 'right', 'off']
const ROOM: Record<Place, number> = { left: CORNER_ROOM, right: CORNER_ROOM, off: Infinity }
const FULL = 'A corner holds one'

const WIDGETS: Record<ClockWidget, { name: string; detail: string }> = {
  dateTemp: { name: 'Temperature & date', detail: 'The weather small, then the date' },
  time: { name: 'Time', detail: 'With am or pm' },
  date: { name: 'Date', detail: 'Month and day' },
  weather: { name: 'Weather', detail: 'The temperature, with the time and town' },
  battery: { name: 'Battery', detail: 'Only on a device with one' },
  cpuUsage: { name: 'CPU use', detail: 'With its temperature' },
  cpuTemp: { name: 'CPU temperature', detail: "In the weather's units" },
  gpuUsage: { name: 'GPU use', detail: 'How busy the graphics are' },
  gpuTemp: { name: 'GPU temperature', detail: 'With how busy it is' }
}

/**
 * One step up or down for a picked-up layout: within its place, or over the edge into the
 * next one (the end of the one above, the start of the one below). Moving up into a full
 * corner pushes its last layout down to take its spot; moving down into a full one can't.
 * Null if it can't go, or a message if it's full. (As Settings → Tabs.)
 */
function step(places: Places, id: ClockWidget, direction: 'up' | 'down'): Places | string | null {
  const from = PLACES.find((p) => places[p].includes(id))!
  const list = places[from]
  const i = list.indexOf(id)
  const j = direction === 'up' ? i - 1 : i + 1
  if (j >= 0 && j < list.length) {
    const next = list.filter((w) => w !== id)
    next.splice(j, 0, id)
    return { ...places, [from]: next }
  }
  const to = PLACES[PLACES.indexOf(from) + (direction === 'up' ? -1 : 1)]
  if (!to) return null
  if (places[to].length >= ROOM[to]) {
    if (direction === 'down') return FULL
    const bumped = places[to][places[to].length - 1]
    return { ...places, [to]: [...places[to].slice(0, -1), id], [from]: [bumped, ...list.filter((w) => w !== id)] }
  }
  return {
    ...places,
    [from]: list.filter((w) => w !== id),
    [to]: direction === 'up' ? [...places[to], id] : [id, ...places[to]]
  }
}

/**
 * Settings → Home: what each corner of the top bar shows. A picks a layout up, Up
 * and Down move it (over into the next corner, or Off, at either end), A puts it down and
 * saves, B puts it back.
 */
export function ClockSettings() {
  const [places, setPlaces] = useState<Places | null>(null)
  const [grab, setGrab] = useState<{ id: ClockWidget; before: Places } | null>(null)

  useEffect(() => {
    window.steamtv.clock.get().then(({ left, right }) => setPlaces({ left, right, off: CLOCK_WIDGETS.filter((w) => !left.includes(w) && !right.includes(w)) }))
  }, [])

  // A layout moving into another place is a new row there: keep the cursor on it.
  useLayoutEffect(() => {
    if (!grab) return
    const row = document.querySelector<HTMLElement>(`.tab-row[data-widget-id="${grab.id}"]`)
    if (row && document.activeElement !== row) focus(row)
  }, [grab, places])

  const save = useCallback((next: Places) => {
    window.steamtv.clock.set({ left: next.left, right: next.right }).then(() => window.dispatchEvent(new Event(CLOCK_CHANGED_EVENT)))
  }, [])

  useEffect(() => {
    if (!grab || !places) return
    const onMove = (event: Event): void => {
      const direction = (event as CustomEvent<Direction>).detail
      if (direction !== 'up' && direction !== 'down') return
      const next = step(places, grab.id, direction)
      if (typeof next === 'string') toast(next)
      else if (next) setPlaces(next)
    }
    const onCancel = (): void => {
      setPlaces(grab.before)
      setGrab(null)
    }
    window.addEventListener(GRAB_MOVE_EVENT, onMove)
    window.addEventListener(GRAB_CANCEL_EVENT, onCancel)
    return () => {
      window.removeEventListener(GRAB_MOVE_EVENT, onMove)
      window.removeEventListener(GRAB_CANCEL_EVENT, onCancel)
    }
  }, [grab, places])

  const press = (id: ClockWidget): void => {
    if (!places) return
    if (grab?.id === id) {
      setGrab(null)
      save(places)
    } else setGrab({ id, before: places })
  }

  const row = (id: ClockWidget) => {
    const moving = grab?.id === id
    return (
      <button
        key={id}
        className={`setting-row tab-row${moving ? ' grabbed' : ''}`}
        tabIndex={-1}
        aria-label={WIDGETS[id].name}
        aria-pressed={moving}
        data-widget-id={id}
        data-focusable=""
        data-select-sound="move"
        {...(moving ? { 'data-grabbed': '' } : {})}
        onClick={() => press(id)}
      >
        <MoveIcon className="tab-grip" />
        <span className="setting-name display">{WIDGETS[id].name}</span>
        <span className="setting-detail">{moving ? 'Up or down to move · A to put down · B to cancel' : WIDGETS[id].detail}</span>
      </button>
    )
  }

  const group = (place: Place, heading: string, help: string) => (
    <div className="settings-group" key={place}>
      <h3 className="settings-heading display">{heading}</h3>
      <p className="settings-help">{help}</p>
      <div className="setting-list" data-focus-memory={`settings-clock-${place}`}>
        {places![place].map(row)}
        {places![place].length === 0 && <p className="settings-help tab-empty">Nothing here.</p>}
      </div>
    </div>
  )

  if (!places) return null
  return (
    <>
      {group('left', 'Top left', 'One layout. A picks it up; up and down move it into the other corner or Off.')}
      {group('right', 'Top right', 'One layout. Moving one up into a full corner swaps them.')}
      {group('off', 'Off', "Layouts you don't use.")}
    </>
  )
}
