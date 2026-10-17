import { useEffect, useRef, useState } from 'react'
import type { PlaceMatch } from '../../../shared/types'
import { focus, TRAP_CLOSE_EVENT } from '../input/focus'
import { toast } from './Toast'

/** Fired after the weather's place or units change; the date bar and the sea refresh. */
export const WEATHER_CHANGED_EVENT = 'steamtv:weather-changed'

/**
 * Picking where the weather is for: type a town (Steam + X brings up the keyboard),
 * Enter, then choose from what matches; or Automatic, to guess from the connection.
 */
export function LocationDialog({ onClose }: { onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [places, setPlaces] = useState<PlaceMatch[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.addEventListener(TRAP_CLOSE_EVENT, onClose)
    return () => window.removeEventListener(TRAP_CLOSE_EVENT, onClose)
  }, [onClose])

  // The search box first; once places are found, the first of them.
  useEffect(() => {
    const first = places?.length ? panel.current?.querySelector<HTMLElement>('.place-row') : input.current
    if (first) focus(first)
  }, [places])

  const search = (): void => {
    if (!query.trim()) return
    setSearching(true)
    setError(null)
    window.steamtv.location
      .search(query.trim())
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
      <div className="dialog-panel artwork-panel" ref={panel} data-focus-trap="">
        <h2 className="section-label display">Weather location</h2>
        <input
          ref={input}
          className="setting-row setting-input artwork-query"
          data-focusable=""
          aria-label="Town or city"
          placeholder="Type a town or city, then Enter"
          spellCheck={false}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') search()
          }}
        />
        <p className="dialog-message">
          {error ?? (searching ? 'Searching…' : places?.length === 0 ? 'Nowhere by that name. Try another spelling.' : 'Steam + X brings up the keyboard.')}
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
            <span className="setting-detail">From your internet connection</span>
          </button>
        </div>
      </div>
    </div>
  )
}
