import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import type { HideableTab } from '../../../shared/types'
import { BAR_TABS, MORE_TABS, TAB_LIST } from '../../../shared/tabs'
import { focus, GRAB_CANCEL_EVENT, GRAB_MOVE_EVENT, type Direction } from '../input/focus'
import { refreshTabs } from '../availableTabs'
import { toast } from './Toast'
import { MoveIcon } from './icons'

type Place = 'bar' | 'more' | 'off'
type Places = Record<Place, HideableTab[]>

const PLACES: Place[] = ['bar', 'more', 'off']
/** How many each place holds (the bar's ten include Home). */
const ROOM: Record<Place, number> = { bar: BAR_TABS - 1, more: MORE_TABS, off: Infinity }
const FULL: Record<Place, string> = { bar: `The bar holds ${BAR_TABS} tabs with Home`, more: `More holds ${MORE_TABS} tabs`, off: '' }

const label = (id: HideableTab | 'home'): string => TAB_LIST.find((t) => t.id === id)?.label ?? id

/**
 * One step up or down for a picked-up tab: within its place, or over the edge into the next
 * place (the end of the one above, the start of the one below). Moving up into a full place
 * pushes that place's last tab down to take its spot (a full bar's last tab goes to More);
 * moving down into a full one can't. Null if it can't go, or a message if it's full.
 */
function step(places: Places, id: HideableTab, direction: 'up' | 'down'): Places | string | null {
  const from = PLACES.find((p) => places[p].includes(id))!
  const list = places[from]
  const i = list.indexOf(id)
  const j = direction === 'up' ? i - 1 : i + 1
  if (j >= 0 && j < list.length) {
    const next = list.filter((t) => t !== id)
    next.splice(j, 0, id)
    return { ...places, [from]: next }
  }
  const to = PLACES[PLACES.indexOf(from) + (direction === 'up' ? -1 : 1)]
  if (!to) return null
  if (places[to].length >= ROOM[to]) {
    if (direction === 'down') return FULL[to]
    const bumped = places[to][places[to].length - 1]
    return { ...places, [to]: [...places[to].slice(0, -1), id], [from]: [bumped, ...list.filter((t) => t !== id)] }
  }
  return {
    ...places,
    [from]: list.filter((t) => t !== id),
    [to]: direction === 'up' ? [...places[to], id] : [id, ...places[to]]
  }
}

/**
 * Settings → Tabs: where each tab goes (the top bar, More's row, or off) and in what order.
 * A picks a tab up, Up and Down move it (over into the next place at either end), A puts it
 * down and saves, B puts it back. Home always comes first in the bar.
 */
export function TabsSettings() {
  const [places, setPlaces] = useState<Places | null>(null)
  // The tab being moved, and where everything was when it was picked up (for B).
  const [grab, setGrab] = useState<{ id: HideableTab; before: Places } | null>(null)

  useEffect(() => {
    window.steamtv.tabs.get().then(({ bar, more, off }) => setPlaces({ bar, more, off }))
  }, [])

  // A tab moving into another place is a new row there: keep the cursor on it.
  useLayoutEffect(() => {
    if (!grab) return
    const row = document.querySelector<HTMLElement>(`.tab-row[data-tab-id="${grab.id}"]`)
    if (row && document.activeElement !== row) focus(row)
  }, [grab, places])

  const save = useCallback((next: Places) => {
    window.steamtv.tabs.set({ bar: next.bar, more: next.more }, next.off).then(refreshTabs)
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

  const press = (id: HideableTab): void => {
    if (!places) return
    if (grab?.id === id) {
      setGrab(null)
      save(places)
    } else setGrab({ id, before: places })
  }

  const row = (id: HideableTab) => {
    const moving = grab?.id === id
    return (
      <button
        key={id}
        className={`setting-row tab-row${moving ? ' grabbed' : ''}`}
        tabIndex={-1}
        aria-label={label(id)}
        aria-pressed={moving}
        data-tab-id={id}
        data-focusable=""
        data-select-sound="move"
        {...(moving ? { 'data-grabbed': '' } : {})}
        onClick={() => press(id)}
      >
        <MoveIcon className="tab-grip" />
        <span className="setting-name display">{label(id)}</span>
        <span className="setting-detail">{moving ? 'Up or down to move · A to put down · B to cancel' : 'A to move'}</span>
      </button>
    )
  }

  const group = (place: Place, heading: string, help: string, rows: HideableTab[], lead?: React.ReactNode) => (
    <div className="settings-group">
      <h3 className="settings-heading display">{heading}</h3>
      <p className="settings-help">{help}</p>
      <div className="setting-list" data-focus-memory={`settings-tabs-${place}`}>
        {lead}
        {rows.map(row)}
        {!lead && rows.length === 0 && <p className="settings-help tab-empty">Nothing here yet.</p>}
      </div>
    </div>
  )

  if (!places) return null
  return (
    <>
      {group(
        'bar',
        'Top bar',
        `Up to ${BAR_TABS} tabs, with Home always first. A picks a tab up; up and down move it, here or into More or Off. Moving one up into a full bar sends its last tab to More.`,
        places.bar,
        <div className="setting-row tab-row fixed">
          <MoveIcon className="tab-grip" />
          <span className="setting-name display">Home</span>
          <span className="setting-detail">Always first</span>
        </div>
      )}
      {group('more', 'More', `Up to ${MORE_TABS} tabs, in a second row that More opens. More shows once anything is here.`, places.more)}
      {group('off', 'Off', "Tabs you don't use. Consoles appear in this list once they have games.", places.off)}
    </>
  )
}
