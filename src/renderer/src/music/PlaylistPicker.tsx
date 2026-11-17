import { useEffect, useRef, useState } from 'react'
import { focus, trap, TRAP_CLOSE_EVENT } from '../input/focus'
import { addToPlaylist, newPlaylist, PLAYLIST_PICK_EVENT, useMusicPlaylists, type PlaylistPick } from './playlists'

// Add to playlist (a song's menu, an album's page): a new playlist named after what's being
// added (rename it later), or one of yours. B closes it; the cursor goes back where it was.

/** Mounted once in App. */
export function PlaylistPicker() {
  const [pick, setPick] = useState<PlaylistPick | null>(null)
  useEffect(() => {
    const onPick = (event: Event): void => setPick((event as CustomEvent<PlaylistPick>).detail)
    window.addEventListener(PLAYLIST_PICK_EVENT, onPick)
    return () => window.removeEventListener(PLAYLIST_PICK_EVENT, onPick)
  }, [])
  return pick ? <Picker pick={pick} onClose={() => setPick(null)} /> : null
}

function Picker({ pick, onClose }: { pick: PlaylistPick; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  const playlists = useMusicPlaylists()
  const close = (): void => {
    onClose()
    if (pick.from?.isConnected) focus(pick.from)
  }
  useEffect(() => {
    const first = box.current?.querySelector<HTMLElement>('[data-focusable]')
    if (first) focus(first)
    const onBack = (): void => {
      if (trap() === box.current) close()
    }
    window.addEventListener(TRAP_CLOSE_EVENT, onBack)
    return () => window.removeEventListener(TRAP_CLOSE_EVENT, onBack)
  }, [])
  const count = `${pick.paths.length} ${pick.paths.length === 1 ? 'song' : 'songs'}`
  return (
    <div className="dialog-backdrop music-picker-backdrop">
      <div className="side-bar-sort-menu music-picker" ref={box} role="menu" data-focus-trap="" data-nav-scope="">
        <p className="music-song-menu-title">Add {count} to a playlist</p>
        <button
          className="side-bar-sort-option display"
          role="menuitem"
          tabIndex={-1}
          data-focusable=""
          data-select-sound="move"
          onClick={() => {
            close()
            void newPlaylist(pick.name, pick.paths)
          }}
        >
          ＋ New playlist: {pick.name}
        </button>
        {/* Not a playlist file: it's read-only. */}
        {playlists.filter((p) => !p.file).map((p) => (
          <button
            key={p.id}
            className="side-bar-sort-option display"
            role="menuitem"
            tabIndex={-1}
            data-focusable=""
            data-select-sound="move"
            onFocus={(event) => event.currentTarget.scrollIntoView({ block: 'nearest' })}
            onClick={() => {
              close()
              void addToPlaylist(p.id, pick.paths)
            }}
          >
            {p.name} ({p.songs.length})
          </button>
        ))}
      </div>
    </div>
  )
}
