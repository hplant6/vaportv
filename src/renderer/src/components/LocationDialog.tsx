import { useEffect, useRef, useState } from 'react'
import type { PlaceMatch } from '../../../shared/types'
import { focus, TRAP_CLOSE_EVENT } from '../input/focus'
import { TextRow } from './TextRow'
import { toast } from './Toast'

/** Fired after the weather's place or units change; the date bar and the sea refresh. */
export const WEATHER_CHANGED_EVENT = 'steamtv:weather-changed'

/**
 * Picking where the weather is for: type a town on vaporTV's keyboard, then choose from what
 * matches; or Automatic, to guess from the connection.
 */
export function LocationDialog({ onClose }: { onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  /** The keyboard is up: it has the cursor and B, not this dialog. */
  const [typing, setTyping] = useState(false)
  const [places, setPlaces] = useState<PlaceMatch[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (typing) return
    window.addEventListener(TRAP_CLOSE_EVENT, onClose)
    return () => window.removeEventListener(TRAP_CLOSE_EVENT, onClose)
  }, [onClose, typing])

  // The search row first; once places are found, the first of them.
  useEffect(() => {
    const first = panel.current?.querySelector<HTMLElement>(places?.length ? '.place-row' : '.text-row')
    if (first) focus(first)
  }, [places])

  const search = (text: string): void => {
    setQuery(text)
    if (!text.trim()) return
    setSearching(true)
    setError(null)
    setPlaces(null)
    window.steamtv.location
      .search(text.trim())
      .then(setPlaces)
      .catch((err: unknown) => setError(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err)))
      .finally(() => setSearching(false))
  }

  const choose = (place: PlaceMatch | null): void => {
    window.steamtv.location.set(place).then(() => {
      window.dispatchEvent(new Event(WEATHER_CHANGED_EVENT))
      toast(place ? `Weather for ${place.name}` : 'Weather location set to automatic')
      onClose()
    })
  }

  return (
    <div className="dialog-backdrop">
      <div className="dialog-panel artwork-panel" ref={panel} {...(typing ? {} : { 'data-focus-trap': '' })}>
        <h2 className="section-label display">Weather location</h2>
        <TextRow
          label="Town or city"
          value={query}
          placeholder="Type a town or city"
          title="Weather location"
          prompt="Which town or city?"
          className="artwork-query"
          onDone={search}
          onTyping={setTyping}
        />
        <p className="dialog-message">
          {error ?? (searching ? 'Searching…' : places?.length === 0 ? 'Nowhere by that name. Try another spelling.' : places ? 'Choose one.' : 'Press A to type where you are.')}
        </p>
        <div className="artwork-list">
          {places?.map((place) => (
            <button
              key={`${place.latitude},${place.longitude}`}
              className="setting-row place-row"
              tabIndex={-1}
              data-focusable=""
              data-select-sound="move"
              onClick={() => choose(place)}
            >
              <span className="setting-name display">{place.name}</span>
            </button>
          ))}
          <button className="setting-row" tabIndex={-1} data-focusable="" data-select-sound="move" onClick={() => choose(null)}>
            <span className="setting-name display">Automatic</span>
            <span className="setting-detail">Guessed from your internet address by ipwho.is</span>
          </button>
        </div>
      </div>
    </div>
  )
}
