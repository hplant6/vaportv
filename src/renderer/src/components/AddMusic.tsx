import { useCallback, useEffect, useRef, useState } from 'react'
import type { BrowseEntry, MusicKind } from '../../../shared/types'
import { focus, TRAP_CLOSE_EVENT } from '../input/focus'
import { errorText, OverStage } from './GooglePhotos'
import { toast } from './Toast'

// Settings → Music → Add your own: find an audio file in a home folder or on a USB drive or
// SD card, say whether it's music or ambience, and vaporTV copies it into the music folder.

const KINDS: { id: MusicKind; name: string; detail: string }[] = [
  { id: 'music', name: 'Music', detail: 'Songs and instrumentals, over the ambience' },
  { id: 'ambience', name: 'Ambience', detail: 'Sounds of a place: rain, waves, birdsong' }
]

const DETAIL: Record<BrowseEntry['kind'], string> = { folder: 'Folder', drive: 'Drive', audio: 'A to add' }

/** The row in Settings that opens the browser. */
export function AddMusicRow({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => {
    setOpen(false)
    document.querySelector<HTMLElement>('#settings-add-music')?.focus()
  }, [])
  return (
    <>
      <button
        id="settings-add-music"
        className="setting-row"
        tabIndex={-1}
        data-focusable=""
        data-select-sound="move"
        onClick={() => setOpen(true)}
      >
        <span className="setting-name display">Add music or ambience</span>
        <span className="setting-detail">From a USB drive, SD card or this machine</span>
      </button>
      {open && (
        <OverStage>
          <AddMusicDialog
            onClose={close}
            onAdded={() => {
              onAdded()
              close()
            }}
          />
        </OverStage>
      )}
    </>
  )
}

function AddMusicDialog({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
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
    window.steamtv.musicFiles
      .browse(here?.path ?? null)
      .then(setEntries)
      .catch((err: unknown) => setError(errorText(err)))
  }, [here])

  // The cursor: on the folder just left, else the first row; on Music when asking the kind.
  useEffect(() => {
    if (copying) return
    const rows = panel.current?.querySelectorAll<HTMLElement>('[data-focusable]')
    if (!rows?.length) return
    const back = cameFrom.current && panel.current?.querySelector<HTMLElement>(`[data-path="${CSS.escape(cameFrom.current)}"]`)
    focus(back || rows[0])
    cameFrom.current = null
  }, [entries, picked, copying])

  // B: out of the question, then up a folder, then closed.
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

  const add = (kind: MusicKind): void => {
    if (!picked) return
    setCopying(true)
    window.steamtv.musicFiles
      .add(picked.path, kind)
      .then(() => {
        toast(`Added ${picked.name.replace(/\.[^.]+$/, '')} to ${kind === 'music' ? 'Music' : 'Ambience'}`)
        onAdded()
      })
      .catch((err: unknown) => {
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
      onFocus={(event) => event.currentTarget.scrollIntoView({ block: 'nearest' })}
      onClick={onClick}
    >
      <span className="setting-name display">{name}</span>
      <span className="setting-detail">{detail}</span>
    </button>
  )

  return (
    <div className="dialog-backdrop">
      <div className="dialog-panel artwork-panel" ref={panel} data-focus-trap="">
        <h2 className="section-label display">Add music or ambience</h2>
        {copying ? (
          <p className="dialog-message">Copying {picked?.name}…</p>
        ) : picked ? (
          <>
            <p className="dialog-message">Is “{picked.name}” music or ambience?</p>
            <div className="artwork-list">{KINDS.map((k) => row(k.id, k.name, k.detail, () => add(k.id)))}</div>
          </>
        ) : (
          <>
            <p className="dialog-message">{here ? here.path : 'Choose where to look. B goes back.'}</p>
            {error && <p className="dialog-message">{error}</p>}
            {entries && entries.length === 0 && !error && <p className="dialog-message">No folders or audio files here.</p>}
            {entries && entries.length > 0 && (
              <div className="artwork-list">
                {entries.map((e) =>
                  row(e.path, e.name, DETAIL[e.kind], () => (e.kind === 'audio' ? setPicked(e) : setTrail((t) => [...t, e])), e.path)
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
