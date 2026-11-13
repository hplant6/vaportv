import { useCallback, useEffect, useRef, useState } from 'react'
import { mediaKey } from '../../../shared/mediaKey'
import type { MediaItem, PlaylistPlace } from '../../../shared/types'
import calendar from '../assets/calendar.svg'
import clock from '../assets/clock.svg'
import trophy from '../assets/trophy.svg'
import { focus, MEDIA_DETAILS_EVENT, MEDIA_FAVORITE_EVENT, MEDIA_PLAYLIST_EVENT } from '../input/focus'
import { play } from '../input/sounds'
import { MEDIA_CHANGED_EVENT, MEDIA_PLAY_EVENT } from './ContinueWatching'
import { GamePanel, row, useCloseKeys, type Fact } from './GameDialog'
import { NewPlaylistButtons, NewPlaylistKeyboard, PlaylistChoices, usePlaylistCount } from './GamePlaylists'
import { MEDIA_SHOW_EVENT } from './MediaPoster'
import { toast } from './Toast'

// Start on a film, show or episode (anywhere: the Media tab, a show's page, Home's Continue
// watching): its details in the panel games use. Its poster, name, year, length and rating,
// its summary and genres, then what can be done: Resume or Play, Play from the start, Mark as
// watched (a show: every episode) or not, and favourite or not. Y on one does the last
// straight away. Both go to its server; the lists showing it patch it in and ask again.

type Card = { source: string; id: string; title: string; favorite: boolean }

/** Tells the lists showing it what changed, and has them ask the server again. */
function changed(source: string, id: string, patch: Partial<MediaItem>): void {
  window.dispatchEvent(new CustomEvent(MEDIA_CHANGED_EVENT, { detail: { source, id, patch } }))
}

/** Favourite on its server, or not; a toast says which. */
async function toggleFavorite(source: string, id: string, title: string, was: boolean): Promise<boolean> {
  try {
    const on = await window.steamtv.media.setFavorite(source, id, !was)
    play(on ? 'favorite' : 'move')
    toast(on ? `Added ${title} to Favorites` : `Removed ${title} from Favorites`)
    changed(source, id, { favorite: on || undefined })
    return on
  } catch {
    toast(`Couldn’t change ${title} on your server`)
    return was
  }
}

const cardOf = (el: HTMLElement): Card | null =>
  el.dataset.mediaSource && el.dataset.itemId
    ? {
        source: el.dataset.mediaSource,
        id: el.dataset.itemId,
        title: el.getAttribute('aria-label')?.split(',')[0] ?? 'That',
        favorite: !!el.querySelector('.media-star')
      }
    : null

/** Mounted once (App): the details on Start, and Y's favourite, for any media card. */
export function MediaDetailsHost() {
  const [open, setOpen] = useState<{ card: HTMLElement; source: string; id: string; start: Step } | null>(null)
  useEffect(() => {
    const opener = (start: Step) => (event: Event): void => {
      const el = (event as CustomEvent<HTMLElement>).detail
      const card = cardOf(el)
      if (card) setOpen({ card: el, source: card.source, id: card.id, start })
    }
    const details = opener('menu')
    const playlists = opener('playlists')
    const favorite = (event: Event): void => {
      const card = cardOf((event as CustomEvent<HTMLElement>).detail)
      if (card) void toggleFavorite(card.source, card.id, card.title, card.favorite)
    }
    window.addEventListener(MEDIA_DETAILS_EVENT, details)
    window.addEventListener(MEDIA_PLAYLIST_EVENT, playlists)
    window.addEventListener(MEDIA_FAVORITE_EVENT, favorite)
    return () => {
      window.removeEventListener(MEDIA_DETAILS_EVENT, details)
      window.removeEventListener(MEDIA_PLAYLIST_EVENT, playlists)
      window.removeEventListener(MEDIA_FAVORITE_EVENT, favorite)
    }
  }, [])
  if (!open) return null
  return (
    <MediaDetails
      key={`${open.source}:${open.id}`}
      source={open.source}
      id={open.id}
      start={open.start}
      onClose={() => {
        const card = open.card
        setOpen(null)
        // Back on the card it opened from, if it's still there.
        setTimeout(() => {
          if (card.isConnected) focus(card)
        })
      }}
    />
  )
}

/** The panel's steps: its details (Start), its playlists (X, or Playlists in the details), naming a new one. */
type Step = 'menu' | 'playlists' | 'newPlaylist'

function MediaDetails({ source, id, start, onClose }: { source: string; id: string; start: Step; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  const [item, setItem] = useState<MediaItem | null>(null)
  const [step, setStep] = useState<Step>(start)
  const [newPlace, setNewPlace] = useState<PlaylistPlace>('home')
  // How a playlist keeps it, beside the games.
  const key = mediaKey(source, id)
  const inPlaylists = usePlaylistCount(key, step)
  // B on Playlists goes back to the details when it came from them; opened with X, it closes.
  const backToMenu = useCallback(() => setStep('menu'), [])
  useCloseKeys(onClose, step === 'playlists' && start === 'menu' ? backToMenu : undefined, step === 'newPlaylist')

  useEffect(() => {
    window.steamtv.media
      .details(source, id)
      .then(setItem)
      .catch(() => {
        toast('Couldn’t get that from your server')
        onClose()
      })
  }, [source, id, onClose])

  // The cursor on its first choice once it's in, and back on the menu (Playlists puts it on its own).
  const loaded = item !== null
  useEffect(() => {
    if (step !== 'menu') return
    const first = loaded && panel.current?.querySelector<HTMLElement>('.game-settings [data-focusable]')
    if (first) focus(first)
  }, [loaded, step])

  const playIt = useCallback(
    (fromStart: boolean) => {
      onClose()
      window.dispatchEvent(new CustomEvent(MEDIA_PLAY_EVENT, { detail: { source, id, fromStart } }))
    },
    [source, id, onClose]
  )

  if (!item) return <GamePanel panel={panel} title="Loading…" heading="Details" />
  if (step === 'newPlaylist')
    return <NewPlaylistKeyboard gameId={key} gameTitle={item.title} place={newPlace} onDone={(made) => (made ? onClose() : setStep('playlists'))} />
  if (step === 'playlists')
    return (
      <GamePanel
        panel={panel}
        title={item.title}
        cover={item.cover ?? item.wide}
        wide={!item.cover}
        heading="Playlists"
        footer={
          <NewPlaylistButtons
            gameId={key}
            onNew={(place) => {
              setNewPlace(place)
              setStep('newPlaylist')
            }}
          />
        }
      >
        <PlaylistChoices gameId={key} gameTitle={item.title} />
      </GamePanel>
    )

  const show = item.kind === 'series'
  const year = item.released?.slice(0, 4) || (/^\d{4}$/.test(item.subtitle) ? item.subtitle : '')
  const facts: Fact[] = [
    ...(year ? [[calendar, 'Year', year] as Fact] : []),
    ...(item.runtimeMinutes ? [[clock, 'Runtime', length(item.runtimeMinutes)] as Fact] : []),
    ...(item.rating || item.officialRating
      ? [[trophy, 'Rating', [item.rating ? `${item.rating.toFixed(1)} ★` : '', item.officialRating].filter(Boolean).join(' · ')] as Fact]
      : [])
  ]
  const partWay = !show && !item.watched && item.progress > 0
  const markWatched = async (): Promise<void> => {
    const on = !item.watched
    try {
      await window.steamtv.media.setWatched(source, id, on)
      toast(on ? `Marked ${item.title} as watched` : `Marked ${item.title} as unwatched`)
      setItem({ ...item, watched: on || undefined, progress: 0, remainingMinutes: undefined, unwatched: on ? 0 : item.unwatched })
      changed(source, id, { watched: on || undefined, progress: 0, remainingMinutes: undefined, ...(show ? { unwatched: on ? 0 : undefined } : {}) })
    } catch {
      toast(`Couldn’t change ${item.title} on your server`)
    }
  }
  const favorite = async (): Promise<void> => {
    const on = await toggleFavorite(source, id, item.title, !!item.favorite)
    setItem({ ...item, favorite: on || undefined })
  }

  return (
    <GamePanel
      panel={panel}
      title={item.kind === 'episode' ? `${item.title}: ${item.episodeName ?? ''}` : item.title}
      cover={item.cover ?? item.wide}
      wide={!item.cover}
      facts={facts}
      heading={show ? 'Show' : item.kind === 'episode' ? item.subtitle : 'Film'}
    >
      {(item.overview || item.genres) && (
        <p className="media-details-overview">
          {item.genres && <span className="media-details-genres">{item.genres.slice(0, 3).join(' · ')}</span>}
          {item.overview}
        </p>
      )}
      {show &&
        row('Open', 'Its seasons and episodes', () => {
          onClose()
          // Its page opens on the Media tab; anywhere else there's nothing to open it in.
          if (window.dispatchEvent(new CustomEvent(MEDIA_SHOW_EVENT, { detail: { source, id, title: item.title }, cancelable: true })))
            toast(`Open ${item.title} from the Media tab`)
        })}
      {partWay && row('Resume', item.remainingMinutes ? `${length(item.remainingMinutes)} left` : '', () => playIt(false))}
      {!show && row(partWay ? 'Play from the start' : 'Play', item.runtimeMinutes ? length(item.runtimeMinutes) : '', () => playIt(true))}
      {row(
        show ? (item.watched ? 'Mark all as unwatched' : 'Mark all as watched') : item.watched ? 'Mark as unwatched' : 'Mark as watched',
        show ? 'Every episode' : '',
        () => void markWatched()
      )}
      {row(item.favorite ? 'Remove from favorites' : 'Add to favorites', 'Y on it does this too', () => void favorite())}
      {row(
        'Playlists',
        inPlaylists === null ? '' : inPlaylists ? `In ${inPlaylists === 1 ? '1 playlist' : `${inPlaylists} playlists`}` : 'Add it to one · X on it does this too',
        () => setStep('playlists')
      )}
    </GamePanel>
  )
}

/** "1h 52m", "44m". */
function length(minutes: number): string {
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m` : `${minutes}m`
}
