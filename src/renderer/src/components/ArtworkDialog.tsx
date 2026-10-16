import { useEffect, useRef, useState } from 'react'
import { focus, OPTIONS_EVENT, TRAP_CLOSE_EVENT } from '../input/focus'
import { toast } from './Toast'

// Fixing a console game's art by hand. X on a card opens it: first where the cover comes
// from (Automatic to undo a choice, RetroArch's box art, a web image search, or which
// SteamGridDB game this is), then which picture to use.

/** Cards whose art comes from Steam itself rather than SteamGridDB. */
const STEAM_ART = /^(steam|shortcut):/

interface Match {
  id: number
  name: string
  year?: number
}

/** A picture from the web or the libretro thumbnails. */
interface Picture {
  url: string
  thumb: string
  width?: number
  height?: number
  /** Its site (web) or its name (libretro). */
  label?: string
}

type PictureSource = 'web' | 'libretro'
type Step = { kind: 'matches' } | { kind: 'covers'; match: Match } | { kind: PictureSource }

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
  const [webQuery, setWebQuery] = useState('')
  const [webSource, setWebSource] = useState('')
  const [libretro, setLibretro] = useState(false)
  const [sgdb, setSgdb] = useState(true)
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<Match[] | null>(null)
  const [covers, setCovers] = useState<{ url: string; thumb: string }[] | null>(null)
  const [pictures, setPictures] = useState<Picture[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.steamtv.art
      .search(id)
      .then((r) => {
        setTitle(r.title)
        setWebQuery(r.webQuery)
        setWebSource(r.webSource)
        setLibretro(r.libretro)
        setSgdb(r.sgdb)
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

  const findPictures = (source: PictureSource, text: string): void => {
    setPictures(null)
    setError(null)
    const found: Promise<Picture[]> =
      source === 'web'
        ? window.steamtv.art.webSearch(text).then((r) => r.map((p) => ({ ...p, label: p.source })))
        : window.steamtv.art.libretro(id, text).then((r) => r.map((p) => ({ url: p.url, thumb: p.thumb, label: p.name })))
    found.then(setPictures).catch((err: unknown) => {
      setPictures([])
      setError(message(err))
    })
  }

  const openPictures = (source: PictureSource): void => {
    const text = source === 'web' ? webQuery : title
    setQuery(text)
    setStep({ kind: source })
    findPictures(source, text)
  }

  // B: from a picture step back to the first; from the first, close.
  useEffect(() => {
    const back = (): void => {
      if (saving) return
      if (step.kind !== 'matches') {
        setError(null)
        setStep({ kind: 'matches' })
      } else onClose()
    }
    window.addEventListener(TRAP_CLOSE_EVENT, back)
    return () => window.removeEventListener(TRAP_CLOSE_EVENT, back)
  }, [step, saving, onClose])

  // The cursor starts on the first choice of each step, once it has loaded (on a picture
  // step, the first picture, so the search box doesn't take it).
  const loaded = step.kind === 'matches' ? matches !== null : step.kind === 'covers' ? covers !== null : pictures !== null
  useEffect(() => {
    const first =
      (step.kind !== 'matches' && panel.current?.querySelector<HTMLElement>('.artwork-cover')) ||
      panel.current?.querySelector<HTMLElement>('[data-focusable]')
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

  const done = (job: Promise<void>, note: string): void => {
    setSaving(true)
    setError(null)
    job
      .then(() => {
        toast(note)
        onClose()
      })
      .catch((err: unknown) => {
        setSaving(false)
        setError(message(err))
      })
  }

  const heading =
    step.kind === 'covers'
      ? step.match.name
      : step.kind === 'web'
        ? 'Search the web'
        : step.kind === 'libretro'
          ? 'RetroArch box art'
          : `Artwork for ${title || '…'}`

  return (
    <div className="dialog-backdrop">
      <div className="dialog-panel artwork-panel" ref={panel} data-focus-trap="">
        <h2 className="section-label display">{heading}</h2>
        {error && <p className="dialog-message">{error}</p>}

        {step.kind === 'matches' && (
          <>
            <p className="dialog-message">Which game is this?</p>
            {!matches && !error && <p className="dialog-message">Searching SteamGridDB…</p>}
            <div className="artwork-list" ref={list}>
              {matches && (
                <>
                  <button
                    className="setting-row"
                    tabIndex={-1}
                    data-focusable=""
                    data-select-sound="move"
                    onFocus={(e) => reveal(e.currentTarget)}
                    onClick={() => done(window.steamtv.art.reset(id), 'Artwork set back to automatic')}
                  >
                    <span className="setting-name display">Automatic</span>
                    <span className="setting-detail">Let vaporTV pick</span>
                  </button>
                  {libretro && (
                    <button
                      className="setting-row"
                      tabIndex={-1}
                      data-focusable=""
                      data-select-sound="move"
                      onFocus={(e) => reveal(e.currentTarget)}
                      onClick={() => openPictures('libretro')}
                    >
                      <span className="setting-name display">RetroArch box art</span>
                      <span className="setting-detail">The libretro thumbnails</span>
                    </button>
                  )}
                  <button
                    className="setting-row"
                    tabIndex={-1}
                    data-focusable=""
                    data-select-sound="move"
                    onFocus={(e) => reveal(e.currentTarget)}
                    onClick={() => openPictures('web')}
                  >
                    <span className="setting-name display">Search the web</span>
                    <span className="setting-detail">Any picture · {webSource}</span>
                  </button>
                </>
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
              {matches?.length === 0 && (
                <p className="dialog-message">
                  {sgdb ? 'SteamGridDB has nothing by that name.' : 'Add a SteamGridDB key in Settings → Artwork to see its matches here.'}
                </p>
              )}
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
                  onClick={() => done(window.steamtv.art.choose(id, step.match.id, c.url), 'Artwork updated')}
                >
                  <img src={c.thumb} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          </>
        )}

        {(step.kind === 'web' || step.kind === 'libretro') && (
          <>
            <input
              className="setting-row setting-input artwork-query"
              data-focusable=""
              aria-label="Search for"
              spellCheck={false}
              value={query}
              disabled={saving}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && query.trim()) findPictures(step.kind as PictureSource, query.trim())
              }}
            />
            <p className="dialog-message">
              {saving
                ? 'Saving…'
                : pictures === null
                  ? 'Searching…'
                  : 'Pick a picture; it’s cropped to fit the card. Up to edit the search.'}
            </p>
            {pictures?.length === 0 && !error && <p className="dialog-message">Nothing found. Edit the search and press Enter.</p>}
            <div className="artwork-covers" ref={list}>
              {pictures?.map((picture) => (
                <button
                  key={picture.url}
                  className="artwork-cover"
                  tabIndex={-1}
                  data-focusable=""
                  data-select-sound="move"
                  disabled={saving}
                  aria-label={picture.label ?? 'Picture'}
                  onFocus={(e) => reveal(e.currentTarget)}
                  onClick={() => done(window.steamtv.art.chooseWeb(id, picture.url, picture.thumb), 'Artwork updated')}
                >
                  <img src={picture.thumb} alt="" loading="lazy" />
                  {step.kind === 'web' && picture.width && picture.height ? (
                    <span className="artwork-size">
                      {picture.width}×{picture.height}
                    </span>
                  ) : step.kind === 'libretro' && picture.label ? (
                    <span className="artwork-size">{picture.label.match(/\(([^)]+)\)/)?.[1] ?? ''}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
