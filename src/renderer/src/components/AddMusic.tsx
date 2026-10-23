import { useCallback, useState } from 'react'
import type { MusicKind } from '../../../shared/types'
import { FilePicker } from './FilePicker'
import { OverStage } from './GooglePhotos'
import { toast } from './Toast'

// Settings → Music → Add your own: an audio file from a home folder, USB drive or SD card,
// copied into the music folder as music or ambience.

const KINDS = [
  { id: 'music', name: 'Music', detail: 'Songs and instrumentals, over the ambience' },
  { id: 'ambience', name: 'Ambience', detail: 'Sounds of a place: rain, waves, birdsong' }
]

/** The row in Settings that opens the browser. */
export function AddMusicRow({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => {
    setOpen(false)
    document.querySelector<HTMLElement>('#settings-add-music')?.focus()
  }, [])
  return (
    <>
      <button id="settings-add-music" className="setting-row" tabIndex={-1} data-focusable="" data-select-sound="move" onClick={() => setOpen(true)}>
        <span className="setting-name display">Add music or ambience</span>
        <span className="setting-detail">From a USB drive, SD card or this machine</span>
      </button>
      {open && (
        <OverStage>
          <FilePicker
            title="Add music or ambience"
            kind="audio"
            ask={{ question: (e) => `Is “${e.name}” music or ambience?`, choices: KINDS }}
            add={async (entry, choice) => {
              const kind = choice as MusicKind
              await window.steamtv.musicFiles.add(entry.path, kind)
              toast(`Added ${entry.name.replace(/\.[^.]+$/, '')} to ${kind === 'music' ? 'Music' : 'Ambience'}`)
              onAdded()
              close()
            }}
            onClose={close}
          />
        </OverStage>
      )}
    </>
  )
}
