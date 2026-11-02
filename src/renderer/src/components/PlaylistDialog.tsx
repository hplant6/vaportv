import { useEffect, useRef, useState } from 'react'
import type { MusicTrack, Playlist } from '../../../shared/types'
import { focus, TRAP_CLOSE_EVENT } from '../input/focus'
import { PlayIcon, StopIcon } from './icons'
import { OnScreenKeyboard } from './Keyboard'
import { PREVIEW_EVENT, previewing, stopPreview, togglePreview } from './MusicPreview'
import { ToggleRow } from './ToggleRow'
import { songGroups, TrackLine } from './TrackLine'

// Settings → Music → Playlists: one playlist's name, whether it shuffles, and which tracks are in
// it (in the order they were put in), each with a button beside it to hear it first, as in the
// Songs list. Every change saves straight away; B closes. A new playlist starts by asking for its name.

export function PlaylistDialog({
  playlist,
  tracks,
  onSave,
  onDelete,
  onClose
}: {
  /** null: a new one, named first. */
  playlist: Playlist | null
  tracks: MusicTrack[]
  onSave: (playlist: Playlist) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const panel = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [current, setCurrent] = useState<Playlist | null>(playlist)
  const [naming, setNaming] = useState(!playlist)
  const [preview, setPreview] = useState<string | null>(previewing())

  // The preview button shows what's playing; closing the dialog stops it.
  useEffect(() => {
    const onPreview = (event: Event): void => setPreview((event as CustomEvent<string | null>).detail)
    window.addEventListener(PREVIEW_EVENT, onPreview)
    return () => {
      window.removeEventListener(PREVIEW_EVENT, onPreview)
      stopPreview()
    }
  }, [])

  useEffect(() => {
    if (naming) return
    window.addEventListener(TRAP_CLOSE_EVENT, onClose)
    return () => window.removeEventListener(TRAP_CLOSE_EVENT, onClose)
  }, [naming, onClose])

  // The cursor starts on the first row, and again after naming.
  useEffect(() => {
    if (naming) return
    const first = panel.current?.querySelector<HTMLElement>('[data-focusable]')
    if (first) focus(first)
  }, [naming])

  const save = (next: Playlist): void => {
    setCurrent(next)
    onSave(next)
  }

  const reveal = (el: HTMLElement): void => {
    const box = list.current
    if (!box) return
    if (el.offsetTop < box.scrollTop) box.scrollTop = el.offsetTop
    else if (el.offsetTop + el.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = el.offsetTop + el.offsetHeight - box.clientHeight
  }

  if (naming || !current)
    return (
      <OnScreenKeyboard
        title={current ? `Rename ${current.name}` : 'New playlist'}
        prompt={current ? undefined : 'What should it be called?'}
        initial={current?.name ?? ''}
        onDone={(text) => {
          const name = text.trim()
          if (!name) return current ? setNaming(false) : onClose()
          save(current ? { ...current, name } : { id: `p${Date.now().toString(36)}`, name, files: [], shuffle: false })
          setNaming(false)
        }}
        onCancel={() => (current ? setNaming(false) : onClose())}
      />
    )

  const toggleTrack = (file: string): void =>
    save({ ...current, files: current.files.includes(file) ? current.files.filter((f) => f !== file) : [...current.files, file] })

  return (
    <div className="dialog-backdrop">
      <div className="dialog-panel artwork-panel" ref={panel} data-focus-trap="">
        <h2 className="section-label display">{current.name}</h2>
        <div className="artwork-list" ref={list}>
          <button
            className="setting-row"
            tabIndex={-1}
            data-focusable=""
            data-select-sound="move"
            onFocus={(e) => reveal(e.currentTarget)}
            onClick={() => setNaming(true)}
          >
            <span className="setting-name display">Name</span>
            <span className="setting-detail">Change what it’s called</span>
          </button>
          <ToggleRow
            label="Shuffle"
            detail={current.shuffle ? 'Plays its tracks in a random order' : 'Plays its tracks in order'}
            on={current.shuffle}
            onToggle={() => save({ ...current, shuffle: !current.shuffle })}
            onFocus={reveal}
          />
          {songGroups(tracks).map(({ heading, track, i }) => {
            if (heading)
              return (
                <h4 key={heading} className="song-group-heading display">
                  {heading}
                </h4>
              )
            const at = current.files.indexOf(track.file)
            const playing = preview === track.file
            return (
              // A track with a button beside it to hear it first; Left from the button comes back to the track.
              <div key={track.file} id={`playlist-track-${i}`} className="song-row">
                <ToggleRow
                  label={track.name}
                  subtitle={<TrackLine track={track} />}
                  detail={at >= 0 ? `#${at + 1}` : undefined}
                  on={at >= 0}
                  onToggle={() => toggleTrack(track.file)}
                  onFocus={reveal}
                />
                <button
                  className={`song-preview${playing ? ' playing' : ''}`}
                  tabIndex={-1}
                  aria-label={playing ? `Stop ${track.name}` : `Preview ${track.name}`}
                  data-focusable=""
                  data-select-sound="move"
                  data-nav-left={`#playlist-track-${i} .setting-row`}
                  onFocus={(e) => reveal(e.currentTarget.parentElement!)}
                  onClick={() => togglePreview(track.file)}
                >
                  {playing ? <StopIcon className="song-preview-icon" /> : <PlayIcon className="song-preview-icon" />}
                </button>
              </div>
            )
          })}
          <button
            className="setting-row"
            tabIndex={-1}
            data-focusable=""
            data-select-sound="move"
            onFocus={(e) => reveal(e.currentTarget)}
            onClick={() => onDelete(current.id)}
          >
            <span className="setting-name display">Delete playlist</span>
            <span className="setting-detail">The tracks stay</span>
          </button>
        </div>
      </div>
    </div>
  )
}
