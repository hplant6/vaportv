import { useCallback, useEffect, useRef, useState } from 'react'
import type { MediaItem, MediaShow } from '../../../shared/types'
import { focus, trap, TRAP_CLOSE_EVENT, TRAP_TAB_EVENT } from '../input/focus'
import { play } from '../input/sounds'
import { usePageScroll } from '../screens/usePageScroll'
import { MEDIA_PLAY_EVENT, MEDIA_WATCHED_EVENT } from './ContinueWatching'
import { toast } from './Toast'

// A show's page on the Media tab (A on a show): its backdrop, name, years and summary, its
// seasons along the top, and the season's episodes as wide stills below. It opens on the
// season with the next episode to watch, the cursor on that episode. L1 and R1 step through
// the seasons; A plays an episode from where it was left; B goes back to the grid. Back from
// an episode, its progress and the next one are asked for again.

export function MediaShowPage({ source, id, title, onBack }: { source: string; id: string; title: string; onBack: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const scroll = usePageScroll()
  const [show, setShow] = useState<MediaShow | null>(null)
  const [season, setSeason] = useState<string | null>(null)
  const [episodes, setEpisodes] = useState<MediaItem[] | null>(null)
  // The episode just played: back from it, the cursor goes to it again, or (finished) to the next one.
  const played = useRef<string | null>(null)
  // Whether the cursor goes to an episode when they're in: on opening, L1/R1, and back from one;
  // not while it's moving along the seasons.
  const take = useRef(true)

  const loadShow = useCallback(() => {
    window.steamtv.media
      .show(source, id)
      .then((next) => {
        setShow(next)
        setSeason((was) => was ?? next.next?.seasonId ?? next.seasons.find((s) => (s.unwatched ?? 0) > 0)?.id ?? next.seasons.at(0)?.id ?? null)
      })
      .catch(() => {
        toast(`Couldn’t open ${title}`)
        onBack()
      })
  }, [source, id, title, onBack])
  useEffect(loadShow, [loadShow])

  const loadEpisodes = useCallback(() => {
    if (!season) return
    window.steamtv.media
      .episodes(source, id, season)
      .then(setEpisodes)
      .catch(() => setEpisodes([]))
  }, [source, id, season])
  useEffect(() => {
    setEpisodes(null)
    loadEpisodes()
  }, [loadEpisodes])

  // Once a season's episodes are in: the cursor on the episode just played if it isn't finished,
  // else the next one to watch if it's in this season, else the first not yet watched.
  useEffect(() => {
    if (!episodes || !take.current) return
    take.current = false
    const last = episodes.find((e) => e.id === played.current)
    played.current = null
    const target =
      (last && !last.watched ? last : undefined) ??
      episodes.find((e) => e.id === show?.next?.id) ??
      episodes.find((e) => !e.watched) ??
      episodes.at(0)
    const el = target && root.current?.querySelector<HTMLElement>(`[data-item-id="${target.id}"]`)
    if (el) focus(el)
    else {
      const first = root.current?.querySelector<HTMLElement>('[data-focusable]')
      if (first) focus(first)
    }
  }, [episodes])

  // Back from an episode: its progress, and the next one, again; the cursor back on it (or on the next).
  useEffect(() => {
    const playing = (event: Event): void => {
      played.current = (event as CustomEvent<{ id: string }>).detail.id
    }
    const watched = (): void => {
      take.current = true
      loadShow()
      loadEpisodes()
    }
    window.addEventListener(MEDIA_PLAY_EVENT, playing)
    window.addEventListener(MEDIA_WATCHED_EVENT, watched)
    return () => {
      window.removeEventListener(MEDIA_PLAY_EVENT, playing)
      window.removeEventListener(MEDIA_WATCHED_EVENT, watched)
    }
  }, [loadShow, loadEpisodes])

  // B goes back; L1 and R1 step through the seasons. Not while something's open over it (the player).
  useEffect(() => {
    const ours = (): boolean => trap() === root.current
    const back = (): void => {
      if (ours()) onBack()
    }
    const step = (event: Event): void => {
      if (!ours() || !show) return
      const at = show.seasons.findIndex((s) => s.id === season)
      const next = show.seasons.at(at + (event as CustomEvent<number>).detail)
      if (!next || at + (event as CustomEvent<number>).detail < 0) return
      play('move')
      take.current = true
      setSeason(next.id)
    }
    window.addEventListener(TRAP_CLOSE_EVENT, back)
    window.addEventListener(TRAP_TAB_EVENT, step)
    return () => {
      window.removeEventListener(TRAP_CLOSE_EVENT, back)
      window.removeEventListener(TRAP_TAB_EVENT, step)
    }
  }, [onBack, show, season])

  const seasonCount = show?.seasons.length ?? 0
  return (
    <div className="media-show" ref={root} data-focus-trap="">
      {show?.backdrop && <img className="media-show-backdrop" src={show.backdrop} alt="" />}
      <div className="page-viewport">
        <div className="page-scroll" {...scroll}>
          <div className="media-show-content">
            <h1 className="media-show-title display">{show?.title ?? title}</h1>
            <p className="media-show-meta">
              {[show?.years, seasonCount && `${seasonCount} season${seasonCount === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
            </p>
            {show?.overview && <p className="media-show-overview">{show.overview}</p>}
            <div className="media-seasons" role="tablist" data-focus-memory="media-seasons">
              {show?.seasons.map((s) => (
                <button
                  key={s.id}
                  className={`media-season${s.id === season ? ' active' : ''}`}
                  role="tab"
                  aria-selected={s.id === season}
                  tabIndex={-1}
                  data-focusable=""
                  data-select-sound="move"
                  onFocus={() => setSeason(s.id)}
                >
                  {s.name}
                  {(s.unwatched ?? 0) > 0 && <span className="media-season-count">{s.unwatched}</span>}
                </button>
              ))}
            </div>
            {episodes === null ? (
              <p className="empty-note">Loading…</p>
            ) : episodes.length === 0 ? (
              <p className="empty-note">No episodes in this season.</p>
            ) : (
              <div className="wide-grid media-episodes" data-focus-memory={`media-episodes:${season}`}>
                {episodes.map((e) => (
                  <EpisodeCard key={e.id} episode={e} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** An episode: its still, "5. Name", how long (or how much is left, or watched), a gold line for how far in. A plays it. */
function EpisodeCard({ episode }: { episode: MediaItem }) {
  const detail = episode.watched
    ? 'Watched'
    : episode.progress > 0 && episode.remainingMinutes !== undefined
      ? `${episode.remainingMinutes}m left`
      : episode.runtimeMinutes
        ? `${episode.runtimeMinutes}m`
        : ''
  const name = `${episode.episodeNumber !== undefined ? `${episode.episodeNumber}. ` : ''}${episode.episodeName ?? episode.title}`
  return (
    <button
      className="wide-card watch-card"
      tabIndex={-1}
      data-focusable=""
      data-select-sound="move"
      data-item-id={episode.id}
      aria-label={`${name}${detail ? `, ${detail}` : ''}`}
      onClick={() => window.dispatchEvent(new CustomEvent(MEDIA_PLAY_EVENT, { detail: { source: episode.source, id: episode.id } }))}
    >
      <span className="wide-card-art">
        {episode.wide && <img src={episode.wide} alt="" loading="lazy" />}
        {episode.watched && (
          <span className="media-badge media-watched" aria-hidden="true">
            ✓
          </span>
        )}
        <span className="watch-card-info">
          <span className="watch-card-title">{name}</span>
          {detail && <span className="watch-card-detail">{detail}</span>}
        </span>
        {episode.progress > 0 && !episode.watched && (
          <span className="watch-progress">
            <span className="watch-progress-fill" style={{ width: `${Math.round(episode.progress * 100)}%` }} />
          </span>
        )}
      </span>
    </button>
  )
}
