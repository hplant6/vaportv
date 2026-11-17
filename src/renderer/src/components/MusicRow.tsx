import { useRef, useState } from 'react'
import { useDrag } from '../input/drag'
import { playNow, useMusicFavorites } from '../music/favorites'
import { useScrollTilt } from '../scrollTilt'

// Home's Music row: Liked songs (a tile of four of their covers), then the favorite albums,
// newest first. A plays at once: Liked songs shuffled, an album from its start; Now playing
// opens. The Favorite button on an album takes it off the row. Not there until something's liked.

const CARD_W = 253.56
const CARD_GAP = 36
const FOCUS_SCALE = 1.2
const VIEWPORT_W = 1848

export function MusicRow() {
  const favorites = useMusicFavorites()
  const [offset, setOffset] = useState(0)
  const track = useRef<HTMLDivElement>(null)
  const drag = useDrag('x', offset, setOffset, () => Math.max(0, (track.current?.scrollWidth ?? 0) - VIEWPORT_W))
  useScrollTilt(track, 'x', offset, '--row-tilt')

  if (!favorites.songs.length && !favorites.albums.length) return null

  const reveal = (index: number): void => {
    const left = index * (CARD_W + CARD_GAP)
    const grow = (CARD_W * (FOCUS_SCALE - 1)) / 2
    setOffset((prev) => Math.max(0, Math.min(left - grow, Math.max(prev, left + CARD_W + grow - VIEWPORT_W))))
  }
  const covers = [...new Set(favorites.songs.map((s) => s.cover).filter((c): c is string => !!c))].slice(0, 4)
  const liked = favorites.songs.length > 0
  const at = (album: number): number => album + (liked ? 1 : 0)

  return (
    <section className="card-row music-home-row">
      <h2 className="section-label display">Music</h2>
      <div
        ref={track}
        className={`recents-track${drag.dragging ? ' dragging' : ''}`}
        data-focus-memory="music-home"
        style={{ transform: `translateX(${-offset}px)` }}
        {...drag.handlers}
      >
        {liked && (
          <button
            className="recent-card album-card liked-card"
            tabIndex={-1}
            data-focusable=""
            data-select-sound="move"
            aria-label={`Liked songs, ${favorites.songs.length} songs, shuffled`}
            onFocus={() => reveal(0)}
            onClick={(event) => playNow(favorites.songs, event.currentTarget, 0, true)}
          >
            <div className="recent-art">
              <span className={`music-mosaic${covers.length >= 4 ? ' four' : ''}${covers.length ? '' : ' music-no-cover'}`} aria-hidden="true">
                {(covers.length >= 4 ? covers : covers.slice(0, 1)).map((c) => (
                  <img key={c} src={c} alt="" loading="lazy" />
                ))}
              </span>
              <span className="liked-heart" aria-hidden="true">
                ♥
              </span>
            </div>
            <div className="recent-footer">
              <div className="recent-text">
                <div className="recent-title">Liked songs</div>
                <div className="recent-date">
                  {favorites.songs.length} {favorites.songs.length === 1 ? 'song' : 'songs'}
                </div>
              </div>
            </div>
          </button>
        )}
        {favorites.albums.map((album, i) => (
          <button
            key={album.id}
            className="recent-card album-card"
            tabIndex={-1}
            data-focusable=""
            data-select-sound="move"
            data-album-id={album.id}
            data-title={album.title}
            aria-label={album.artist ? `${album.title}, ${album.artist}` : album.title}
            onFocus={() => reveal(at(i))}
            onClick={(event) => {
              const from = event.currentTarget
              window.steamtv.music.albumSongs(album.id).then((songs) => playNow(songs, from))
            }}
          >
            <div className="recent-art">
              {album.cover ? (
                <img src={album.cover} alt="" loading="lazy" />
              ) : (
                <span className="recent-no-art display">
                  <span className="no-art-band">{album.title}</span>
                </span>
              )}
            </div>
            <div className="recent-footer">
              <div className="recent-text">
                <div className="recent-title">{album.title}</div>
                <div className="recent-date">{[album.artist, album.year].filter(Boolean).join(' · ')}</div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}
