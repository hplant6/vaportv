import { useCallback, useState } from 'react'
import { FilePicker } from './FilePicker'
import { OverStage } from './GooglePhotos'
import { toast } from './Toast'

/**
 * Settings → Backdrop → Add a picture or video: one from a home folder, USB drive or SD card,
 * copied into ~/Pictures/vaporTV Backdrops. `onAdded` gets its file name, to show it now.
 */
export function AddBackdropRow({ onAdded }: { onAdded: (file: string) => void }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => {
    setOpen(false)
    document.querySelector<HTMLElement>('#settings-add-backdrop')?.focus()
  }, [])
  return (
    <>
      <button id="settings-add-backdrop" className="setting-row" tabIndex={-1} data-focusable="" data-select-sound="move" onClick={() => setOpen(true)}>
        <span className="setting-name display">Add a picture or video</span>
        <span className="setting-detail">From a USB drive, SD card or this machine</span>
      </button>
      {open && (
        <OverStage>
          <FilePicker
            title="Add a backdrop"
            kind="backdrop"
            add={async (entry) => {
              const file = await window.steamtv.addBackdrop(entry.path)
              toast(`Added ${entry.name.replace(/\.[^.]+$/, '')} as your backdrop`)
              onAdded(file)
              close()
            }}
            onClose={close}
          />
        </OverStage>
      )}
    </>
  )
}
