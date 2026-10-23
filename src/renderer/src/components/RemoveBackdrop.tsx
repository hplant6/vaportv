import { useEffect, useRef, useState } from 'react'
import type { CustomBackdrop } from '../../../shared/types'
import { focus, TRAP_CLOSE_EVENT } from '../input/focus'
import { errorText, OverStage } from './GooglePhotos'
import { toast } from './Toast'

/** A row that removes one of your backdrops, after asking: the file is deleted from the folder. */
export function RemoveBackdropRow({ backdrop, onRemoved }: { backdrop: CustomBackdrop; onRemoved: () => void }) {
  const [asking, setAsking] = useState(false)
  const row = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button ref={row} className="setting-row" tabIndex={-1} data-focusable="" data-select-sound="move" onClick={() => setAsking(true)}>
        <span className="setting-name display">{backdrop.name}</span>
        <span className="setting-detail">A to remove</span>
      </button>
      {asking && (
        <OverStage>
          <Confirm
            backdrop={backdrop}
            onClose={(removed) => {
              setAsking(false)
              if (removed) onRemoved()
              else if (row.current) focus(row.current)
            }}
          />
        </OverStage>
      )}
    </>
  )
}

function Confirm({ backdrop, onClose }: { backdrop: CustomBackdrop; onClose: (removed: boolean) => void }) {
  const panel = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  // The cursor starts on Keep, so a stray A doesn't delete anything.
  useEffect(() => {
    const keep = panel.current?.querySelector<HTMLElement>('[data-keep]')
    if (keep) focus(keep)
  }, [])

  useEffect(() => {
    const onBack = (): void => onClose(false)
    window.addEventListener(TRAP_CLOSE_EVENT, onBack)
    return () => window.removeEventListener(TRAP_CLOSE_EVENT, onBack)
  }, [onClose])

  const remove = (): void => {
    window.steamtv
      .removeBackdrop(backdrop.file)
      .then(() => {
        toast(`Removed ${backdrop.name}`)
        onClose(true)
      })
      .catch((err: unknown) => setError(errorText(err)))
  }

  return (
    <div className="dialog-backdrop">
      <div className="dialog-panel artwork-panel" ref={panel} data-focus-trap="">
        <h2 className="section-label display">Remove {backdrop.kind === 'video' ? 'video' : 'picture'}</h2>
        <p className="dialog-message">Remove “{backdrop.name}”? It's deleted from ~/Pictures/vaporTV Backdrops.</p>
        {error && <p className="dialog-message">{error}</p>}
        <div className="artwork-list browse-list">
          <button className="setting-row" tabIndex={-1} data-focusable="" data-select-sound="move" data-keep="" onClick={() => onClose(false)}>
            <span className="setting-name display">Keep it</span>
          </button>
          <button className="setting-row" tabIndex={-1} data-focusable="" data-select-sound="move" onClick={remove}>
            <span className="setting-name display">Remove</span>
            <span className="setting-detail">Can't be undone</span>
          </button>
        </div>
      </div>
    </div>
  )
}
