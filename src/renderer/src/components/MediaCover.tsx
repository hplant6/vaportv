import { useEffect, useRef, useState } from 'react'
import type { MediaCoverChoice, MediaItem } from '../../../shared/types'
import { coverQuery } from './coverQuery'
import { focus, TRAP_CLOSE_EVENT } from '../input/focus'
import { TextRow } from './TextRow'

// A film's or show's poster, chosen by hand (Cover, in its details): one of the posters its
// server's metadata sources have (TheMovieDb, Fanart.tv…), or any picture from a web search,
// for what they couldn't identify (a home video, a file named oddly). The pick is saved on the
// server, so its own apps show it too.

/** A picture from the web search. */
interface Picture {
  url: string
  thumb: string
  width?: number
  height?: number
  source?: string
}

const message = (err: unknown): string =>
  (err instanceof Error ? err.message : String(err)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

export function MediaCover({ item, source, onDone, onBack }: { item: MediaItem; source: string; onDone: () => void; onBack: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [choices, setChoices] = useState<MediaCoverChoice[] | null>(null)
  const [web, setWeb] = useState(false)
  const [query, setQuery] = useState(() => coverQuery(item))
  const [pictures, setPictures] = useState<Picture[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  /** The keyboard is up for the search: it has the cursor and B, not this. */
  const [typing, setTyping] = useState(false)

  const search = (text: string): void => {
    setPictures(null)
    setError(null)
    window.steamtv.art
      .webSearch(text)
      .then(setPictures)
      .catch((err: unknown) => {
        setPictures([])
        setError(message(err))
      })
  }
  const openWeb = (): void => {
    setWeb(true)
    search(query)
  }

  // The server's posters first; with none (it couldn't tell what this is), straight to the web.
  useEffect(() => {
    window.steamtv.media
      .coverChoices(source, item.id)
      .catch(() => [] as MediaCoverChoice[])
      .then((found) => {
        setChoices(found)
        if (!found.length) openWeb()
      })
  }, [source, item.id])

  // B: from the web search back to the server's posters (if there were any), else back to the details.
  useEffect(() => {
    const back = (): void => {
      if (saving) return
      if (web && choices?.length) {
        setError(null)
        setWeb(false)
      } else onBack()
    }
    if (typing) return
    window.addEventListener(TRAP_CLOSE_EVENT, back)
    return () => window.removeEventListener(TRAP_CLOSE_EVENT, back)
  }, [web, choices, saving, onBack, typing])

  // The cursor on the first picture once they're in (on the web step, so the search box doesn't take it).
  const loaded = web ? pictures !== null : choices !== null
  useEffect(() => {
    const first = panel.current?.querySelector<HTMLElement>(web ? '.artwork-cover' : '[data-focusable]') ?? panel.current?.querySelector<HTMLElement>('[data-focusable]')
    if (first) focus(first)
    if (list.current) list.current.scrollTop = 0
  }, [web, loaded])

  // Keep the focused choice in view, scrolling only the list.
  const reveal = (el: HTMLElement): void => {
    const box = list.current
    if (!box) return
    if (el.offsetTop < box.scrollTop) box.scrollTop = el.offsetTop
    else if (el.offsetTop + el.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = el.offsetTop + el.offsetHeight - box.clientHeight
  }

  const choose = (pick: { url: string; thumb?: string; provider?: string }): void => {
    setSaving(true)
    setError(null)
    window.steamtv.media
      .setCover(source, item.id, pick)
      .then(onDone)
      .catch((err: unknown) => {
        setSaving(false)
        const why = message(err)
        setError(/^40[13]\b/.test(why) ? 'Your server didn’t let this account change pictures. Sign in with one that can manage its library.' : `Couldn’t save it: ${why}`)
      })
  }

  const cover = (key: string, thumb: string, label: string | undefined, size: string | null, pick: () => void) => (
    <button
      key={key}
      className="artwork-cover"
      tabIndex={-1}
      data-focusable=""
      data-select-sound="move"
      disabled={saving}
      aria-label={label ?? 'Picture'}
      onFocus={(e) => reveal(e.currentTarget)}
      onClick={pick}
    >
      <img src={thumb} alt="" loading="lazy" />
      {size && <span className="artwork-size">{size}</span>}
    </button>
  )

  return (
    <div className="dialog-backdrop">
      <div className="dialog-panel artwork-panel" ref={panel} {...(typing ? {} : { 'data-focus-trap': '' })}>
        <h2 className="section-label display">{web ? 'Search the web' : `Cover for ${item.title}`}</h2>
        {error && <p className="dialog-message">{error}</p>}
        {!web ? (
          <>
            <p className="dialog-message">{saving ? 'Saving…' : choices === null ? 'Asking your server…' : 'Pick a poster from your server’s sources, or search the web.'}</p>
            <button className="setting-row" tabIndex={-1} data-focusable="" data-select-sound="move" disabled={saving} onClick={openWeb}>
              <span className="setting-name display">Search the web</span>
              <span className="setting-detail">Any picture</span>
            </button>
            <div className="artwork-covers" ref={list}>
              {choices?.map((c) => cover(c.url, c.thumb, c.provider, c.width && c.height ? `${c.width}×${c.height}` : c.provider, () => choose(c)))}
            </div>
          </>
        ) : (
          <>
            <TextRow
              label="Search for"
              value={query}
              placeholder="What to search for"
              title="Search for a poster"
              className="artwork-query"
              onDone={(text) => {
                setQuery(text)
                if (text.trim() && !saving) search(text.trim())
              }}
              onTyping={setTyping}
            />
            <p className="dialog-message">
              {saving ? 'Saving…' : pictures === null ? 'Searching…' : 'Pick a picture; it’s cropped to a poster. Up, then A, to change the search.'}
            </p>
            {pictures?.length === 0 && !error && <p className="dialog-message">Nothing found. Up, then A, to change the search.</p>}
            <div className="artwork-covers" ref={list}>
              {pictures?.map((p) =>
                cover(p.url, p.thumb, p.source, p.width && p.height ? `${p.width}×${p.height}` : null, () => choose({ url: p.url, thumb: p.thumb }))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
