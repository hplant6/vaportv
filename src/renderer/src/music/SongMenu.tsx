import { useEffect, useRef, useState } from 'react'
import type { MusicTags } from '../../../shared/types'
import { focus, SONG_MENU_EVENT, trap, TRAP_CLOSE_EVENT } from '../input/focus'
import { isLiked, startRadio, toggleDisliked, toggleLiked, useClaudeReady, useMusicFavorites } from './favorites'
import { pickPlaylist } from './playlists'

/** A playlist's page listens: detail is { path, action } (remove the song, or pick it up to move). */
export const PLAYLIST_SONG_EVENT = 'steamtv:music-playlist-song'

// A song's menu: the game-options button on a song's row (the Music tab's album and Liked
// songs pages, the folder browser) opens it beside the row. Like or Unlike, and with Claude
// Code on the box, Start radio (a station of songs like it). Thumbs down, or undo it. B closes it; either way the
// cursor goes back to the row.

/** Mounted once in App. */
export function SongMenu() {
  const [row, setRow] = useState<HTMLElement | null>(null)
  useEffect(() => {
    const onOpen = (event: Event): void => setRow((event as CustomEvent<HTMLElement>).detail)
    window.addEventListener(SONG_MENU_EVENT, onOpen)
    return () => window.removeEventListener(SONG_MENU_EVENT, onOpen)
  }, [])
  return row ? <Menu row={row} onClose={() => setRow(null)} /> : null
}

function Menu({ row, onClose }: { row: HTMLElement; onClose: () => void }) {
  const menu = useRef<HTMLDivElement>(null)
  const { disliked } = useMusicFavorites()
  const claudeReady = useClaudeReady()
  const path = row.dataset.songPath!
  const title = row.dataset.title ?? 'this song'
  const song: MusicTags = { path, title, artist: row.dataset.artist, album: row.dataset.album }
  const liked = isLiked(path)
  const close = (): void => {
    onClose()
    if (row.isConnected) focus(row)
  }

  useEffect(() => {
    const first = menu.current?.querySelector<HTMLElement>('[data-focusable]')
    if (first) focus(first)
    const onBack = (): void => {
      if (trap() === menu.current) close()
    }
    window.addEventListener(TRAP_CLOSE_EVENT, onBack)
    return () => window.removeEventListener(TRAP_CLOSE_EVENT, onBack)
  }, [])

  // Beside the row: under it, or over it near the screen's foot.
  const rect = row.getBoundingClientRect()
  const below = rect.bottom + 260 < window.innerHeight
  const style = { left: Math.max(36, rect.right - 560), ...(below ? { top: rect.bottom + 6, bottom: 'auto' } : { top: 'auto', bottom: window.innerHeight - rect.top + 6 }) }

  return (
    <div className="side-bar-sort-menu music-song-menu" role="menu" ref={menu} style={style} data-focus-trap="" data-nav-scope="">
      <p className="music-song-menu-title">{title}</p>
      <button
        className="side-bar-sort-option display"
        role="menuitem"
        tabIndex={-1}
        data-focusable=""
        data-select-sound="move"
        onClick={() => {
          void toggleLiked(path, title)
          close()
        }}
      >
        {liked ? '♥ Remove from Liked songs' : '♡ Add to Liked songs'}
      </button>
      <button
        className="side-bar-sort-option display"
        role="menuitem"
        tabIndex={-1}
        data-focusable=""
        data-select-sound="move"
        onClick={() => {
          onClose()
          pickPlaylist({ paths: [path], name: title, from: row })
        }}
      >
        ＋ Add to playlist…
      </button>
      {row.dataset.playlistId && (
        <>
          <button
            className="side-bar-sort-option display"
            role="menuitem"
            tabIndex={-1}
            data-focusable=""
            data-select-sound="move"
            onClick={() => {
              close()
              window.dispatchEvent(new CustomEvent(PLAYLIST_SONG_EVENT, { detail: { path, action: 'move' } }))
            }}
          >
            ↕ Move in this playlist
          </button>
          <button
            className="side-bar-sort-option display"
            role="menuitem"
            tabIndex={-1}
            data-focusable=""
            data-select-sound="move"
            onClick={() => {
              close()
              window.dispatchEvent(new CustomEvent(PLAYLIST_SONG_EVENT, { detail: { path, action: 'remove' } }))
            }}
          >
            − Remove from this playlist
          </button>
        </>
      )}
      <button
        className="side-bar-sort-option display"
        role="menuitem"
        tabIndex={-1}
        data-focusable=""
        data-select-sound="move"
        onClick={() => {
          void toggleDisliked(path, title)
          close()
        }}
      >
        {disliked.has(path) ? '👍 Undo thumbs down' : '👎 Thumbs down (never on radio)'}
      </button>
      {claudeReady && (
        <button
          className="side-bar-sort-option display"
          role="menuitem"
          tabIndex={-1}
          data-focusable=""
          data-select-sound="move"
          onClick={() => {
            close()
            void startRadio(song, row)
          }}
        >
          Start radio (Claude picks songs like it)
        </button>
      )}
    </div>
  )
}
