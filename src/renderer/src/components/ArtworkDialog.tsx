import { useEffect, useRef, useState } from 'react'
import { focus, OPTIONS_EVENT, TRAP_CLOSE_EVENT } from '../input/focus'
import { toast } from './Toast'

// Fixing a console game's art by hand. X on a card opens it: first which SteamGridDB game
// this is (or Automatic, to undo a choice), then which of that game's covers to use.

/** Cards whose art comes from Steam itself rather than SteamGridDB. */
const STEAM_ART = /^(steam|shortcut):/

interface Match {
  id: number
  name: string
  year?: number
}

type Step = { kind: 'matches' } | { kind: 'covers'; match: Match }

const message = (err: unknown): string =>
  (err instanceof Error ? err.message : String(err)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

export function ArtworkDialog() {
  const [item, setItem] = useState<{ id: string; card: HTMLElement } | null>(null)

  useEffect(() => {
    const open = (event: Event): void => {
      const card = (event as CustomEvent<HTMLElement>).detail
      const id = card.dataset.itemId
      if (!id) return
      if (STEAM_ART.test(id)) return toast("Steam games use Steam's own artwork")
      setItem({ id, card })
    }
    window.addEventListener(OPTIONS_EVENT, open)
    return () => window.removeEventListener(OPTIONS_EVENT, open)
  }, [])

  if (!item) return null
  return (
    <Artwork
      id={item.id}
      onClose={() => {
        setItem(null)
        if (item.card.isConnected) focus(item.card)
      }}
    />
  )
}

function Artwork({ id, onClose }: { id: string; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState<Step>({ kind: 'matches' })
  const [title, setTitle] = useState('')
  const [matches, setMatches] = useState<Match[] | null>(null)
  const [covers, setCovers] = useState<{ url: string; thumb: string }[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.steamtv.art
      .search(id)
      .then((r) => {
        setTitle(r.title)
        setMatches(r.matches)
      })
      .catch((err: unknown) => setError(message(err)))
  }, [id])

  useEffect(() => {
    if (step.kind !== 'covers') return
    setCovers(null)
    window.steamtv.art
      .covers(id, step.match.id)
      .then(setCovers)
      .catch((err: unknown) => setError(message(err)))
  }, [id, step])

  // B: from the covers back to the games; from the games, close.
  useEffect(() => {
    const back = (): void => {
      if (saving) return
      if (step.kind === 'covers') setStep({ kind: 'matches' })
      else onClose()
    }
    window.addEventListener(TRAP_CLOSE_EVENT, back)
    return () => window.removeEventListener(TRAP_CLOSE_EVENT, back)
  }, [step, saving, onClose])

  // The cursor starts on the first choice of each step, once it has loaded.
  const loaded = step.kind === 'matches' ? matches !== null : covers !== null
  useEffect(() => {
    const first = panel.current?.querySelector<HTMLElement>('[data-focusable]')
    if (first) focus(first)
    if (list.current) list.current.scrollTop = 0
  }, [step, loaded])

  // Keep the focused choice in view, scrolling only the list.
  const reveal = (el: HTMLElement): void => {
    const box = list.current
    if (!box) return
    if (el.offsetTop < box.scrollTop) box.scrollTop = el.offsetTop
    else if (el.offsetTop + el.offsetHeight > box.scrollTop + box.clientHeight) {
      box.scrollTop = el.offsetTop + el.offsetHeight - box.clientHeight
    }
  }

  const choose = (match: Match, cover: string): void => {
    setSaving(true)
    window.steamtv.art
      .choose(id, match.id, cover)
      .then(() => {
        toast('Artwork updated')
        onClose()
      })
      .catch((err: unknown) => {
        setSaving(false)
        setError(message(err))
      })
  }

  const automatic = (): void => {
    window.steamtv.art
      .reset(id)
      .then(() => {
        toast('Artwork set back to automatic')
        onClose()
      })
      .catch((err: unknown) => setError(message(err)))
  }

  return (
    <div className="dialog-backdrop">
      <div className="dialog-panel artwork-panel" ref={panel} data-focus-trap="">
        <h2 className="section-label display">{step.kind === 'matches' ? `Artwork for ${title || '…'}` : step.match.name}</h2>
        {error && <p className="dialog-message">{error}</p>}

        {step.kind === 'matches' && (
          <>
            <p className="dialog-message">Which game is this?</p>
            {!matches && !error && <p className="dialog-message">Searching SteamGridDB…</p>}
            <div className="artwork-list" ref={list}>
              {matches && (
                <button
                  className="setting-row"
                  tabIndex={-1}
                  data-focusable=""
                  data-select-sound="move"
                  onFocus={(e) => reveal(e.currentTarget)}
                  onClick={automatic}
                >
                  <span className="setting-name display">Automatic</span>
                  <span className="setting-detail">Let vaporTV pick</span>
                </button>
              )}
              {matches?.map((m) => (
                <button
                  key={m.id}
                  className="setting-row"
                  tabIndex={-1}
                  data-focusable=""
                  data-select-sound="move"
                  onFocus={(e) => reveal(e.currentTarget)}
                  onClick={() => setStep({ kind: 'covers', match: m })}
                >
                  <span className="setting-name display">{m.name}</span>
                  {m.year && <span className="setting-detail">{m.year}</span>}
                </button>
              ))}
              {matches?.length === 0 && <p className="dialog-message">SteamGridDB has nothing by that name.</p>}
            </div>
          </>
        )}

        {step.kind === 'covers' && (
          <>
            <p className="dialog-message">{saving ? 'Saving…' : 'Pick a cover.'}</p>
            {!covers && !error && <p className="dialog-message">Loading covers…</p>}
            {covers?.length === 0 && <p className="dialog-message">No covers for this game yet; B to go back.</p>}
            <div className="artwork-covers" ref={list}>
              {covers?.map((c) => (
                <button
                  key={c.url}
                  className="artwork-cover"
                  tabIndex={-1}
                  data-focusable=""
                  data-select-sound="move"
                  disabled={saving}
                  onFocus={(e) => reveal(e.currentTarget)}
                  onClick={() => choose(step.match, c.url)}
                >
                  <img src={c.thumb} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
