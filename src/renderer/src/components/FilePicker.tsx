import { useEffect, useRef, useState } from 'react'
import type { BrowseEntry, BrowseKind } from '../../../shared/types'
import { focus, TRAP_CLOSE_EVENT } from '../input/focus'
import { errorText } from './GooglePhotos'

// Adding your own files (music, backdrops): find one in a home folder or on a USB drive or SD
// card, optionally answer a question about it (music or ambience?), and it's added.

export interface PickerChoice {
  id: string
  name: string
  detail: string
}

const DETAIL: Record<BrowseEntry['kind'], string> = { folder: 'Folder', drive: 'Drive', file: 'A to add' }

/**
 * The browser, as a dialog. B steps out of the question, then up a folder, then closes.
 * `add` does the adding (with the answer, if there's a question) and resolves with what to
 * say about it; it's shown while copying, and an error stays in the dialog.
 */
export function FilePicker({
  title,
  kind,
  ask,
  add,
  onClose
}: {
  title: string
  kind: BrowseKind
  ask?: { question: (entry: BrowseEntry) => string; choices: PickerChoice[] }
  add: (entry: BrowseEntry, choice: string | null) => Promise<void>
  onClose: () => void
}) {
  const panel = useRef<HTMLDivElement>(null)
  // The folders walked into, innermost last; empty for the places to start.
  const [trail, setTrail] = useState<BrowseEntry[]>([])
  const [entries, setEntries] = useState<BrowseEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<BrowseEntry | null>(null)
  const [copying, setCopying] = useState(false)
  // Coming back out of a folder, the cursor goes to that folder.
  const cameFrom = useRef<string | null>(null)
  const here = trail[trail.length - 1] ?? null

  useEffect(() => {
    setEntries(null)
    setError(null)
    window.steamtv
      .browseFiles(here?.path ?? null, kind)
      .then(setEntries)
      .catch((err: unknown) => setError(errorText(err)))
  }, [here, kind])

  // The cursor: on the folder just left, else the first row.
  useEffect(() => {
    if (copying) return
    const rows = panel.current?.querySelectorAll<HTMLElement>('[data-focusable]')
    if (!rows?.length) return
    const back = cameFrom.current && panel.current?.querySelector<HTMLElement>(`[data-path="${CSS.escape(cameFrom.current)}"]`)
    focus(back || rows[0])
    cameFrom.current = null
  }, [entries, picked, copying])

  useEffect(() => {
    const onBack = (): void => {
      if (copying) return
      if (picked) return setPicked(null)
      if (here) {
        cameFrom.current = here.path
        return setTrail((t) => t.slice(0, -1))
      }
      onClose()
    }
    window.addEventListener(TRAP_CLOSE_EVENT, onBack)
    return () => window.removeEventListener(TRAP_CLOSE_EVENT, onBack)
  }, [picked, here, copying, onClose])

  const finish = (entry: BrowseEntry, choice: string | null): void => {
    setPicked(entry)
    setCopying(true)
    add(entry, choice).catch((err: unknown) => {
      setCopying(false)
      setPicked(null)
      setError(errorText(err))
    })
  }

  const row = (key: string, name: string, detail: string, onClick: () => void, path?: string) => (
    <button
      key={key}
      className="setting-row"
      tabIndex={-1}
      data-focusable=""
      data-select-sound="move"
      {...(path ? { 'data-path': path } : {})}
      // The cursor stays near the middle of a long list, as in Settings.
      onFocus={(event) => event.currentTarget.scrollIntoView({ block: 'center' })}
      onClick={onClick}
    >
      <span className="setting-name display">{name}</span>
      <span className="setting-detail">{detail}</span>
    </button>
  )

  return (
    <div className="dialog-backdrop">
      <div className="dialog-panel artwork-panel" ref={panel} data-focus-trap="">
        <h2 className="section-label display">{title}</h2>
        {copying ? (
          <p className="dialog-message">Copying {picked?.name}…</p>
        ) : picked && ask ? (
          <>
            <p className="dialog-message">{ask.question(picked)}</p>
            <div className="artwork-list browse-list">{ask.choices.map((c) => row(c.id, c.name, c.detail, () => finish(picked, c.id)))}</div>
          </>
        ) : (
          <>
            <p className="dialog-message">{here ? here.path : 'Choose where to look. B goes back.'}</p>
            {error && <p className="dialog-message">{error}</p>}
            {entries && entries.length === 0 && !error && <p className="dialog-message">No folders or files to add here.</p>}
            {entries && entries.length > 0 && (
              <div className="artwork-list browse-list">
                {entries.map((e) =>
                  row(
                    e.path,
                    e.name,
                    DETAIL[e.kind],
                    () => (e.kind !== 'file' ? setTrail((t) => [...t, e]) : ask ? setPicked(e) : finish(e, null)),
                    e.path
                  )
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
