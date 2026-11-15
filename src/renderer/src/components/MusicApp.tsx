import { useCallback, useEffect, useRef, useState } from 'react'
import type { MusicEntry, MusicFolder, MusicPlace, MusicTags } from '../../../shared/types'
import { DEFAULT_CONTROLS, type Controls } from '../../../shared/controls'
import { focus, OWN_DIRECTION_EVENT, PLAYER_SKIP_EVENT, TRAP_CLOSE_EVENT, TRAP_TAB_EVENT, type Direction } from '../input/focus'
import { keepAwake } from '../input/idle'
import { play } from '../input/sounds'
import { cycleRepeat, current, next, playerState, playQueue, previous, seekBy, skipSeconds, stopMusic, subscribe, toggle, toggleShuffle, type PlayerState } from '../music/player'
import { FloatingCover } from '../music/FloatingCover'
import { ButtonIcon, DpadIcon, useControllerFamily } from './ButtonIcon'
import { errorText } from './GooglePhotos'
import { ICONS, PlayerButton, ShortcutsPanel, stepAlong } from './PlayerControls'

// The Music app (its tile is in Apps): your own music from ~/Music, network shares (mounted
// under ~/Network) and drives. Places on the left; on the right a folder's folders as a grid of
// covers (as the console tabs show games), and its songs as an album: the cover, Play all and
// Shuffle, then the songs. A on a song plays the folder from it. Now playing is the
// cover floating over the backdrop, the song beside it, and the player's buttons along the foot (D-pad down
// to them, as in the video players). The music carries on when the screen closes.

/** AppTile fires this for the Music tile (detail: the tile, to come back to). */
export const MUSIC_EVENT = 'steamtv:music'

/** Tags asked for at a time, as the list fills in. */
const TAGS_AT_ONCE = 24
/** Folders' covers asked for at a time, as the grid fills in. */
const FOLDERS_AT_ONCE = 10
/** Now playing: the bar fades this long after the last press, unless the cursor's on the buttons. */
const BAR_MS = 5000

function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const s = Math.floor(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function centre(box: HTMLElement | null, row: HTMLElement): void {
  if (box) box.scrollTop = row.offsetTop - (box.clientHeight - row.offsetHeight) / 2
}

/** "1 h 12 min" or "48 min": an album's length. */
function albumLength(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`
}

/** "Aphex Twin - Syro" → "Syro" by "Aphex Twin" (as the main side splits a folder's name). */
function splitName(name: string): { artist?: string; title: string } {
  const at = name.search(/\s+[-–]\s+/)
  const rest = at > 0 ? name.slice(at).replace(/^\s+[-–]\s+/, '').trim() : ''
  return rest ? { artist: name.slice(0, at).trim(), title: rest } : { title: name }
}

function usePlayer(): PlayerState {
  const [state, setState] = useState(playerState)
  useEffect(() => subscribe(setState), [])
  return state
}

/** Mounted once in App; shows the screen while it's open. */
export function MusicApp() {
  const [from, setFrom] = useState<HTMLElement | null>(null)
  useEffect(() => {
    const onOpen = (event: Event): void => setFrom((event as CustomEvent<HTMLElement>).detail)
    window.addEventListener(MUSIC_EVENT, onOpen)
    return () => window.removeEventListener(MUSIC_EVENT, onOpen)
  }, [])
  const close = useCallback(() => {
    setFrom((tile) => {
      if (tile?.isConnected) requestAnimationFrame(() => focus(tile))
      return null
    })
  }, [])
  return from ? <Music onClose={close} /> : null
}

function Music({ onClose }: { onClose: () => void }) {
  const player = usePlayer()
  // Opening with music on: straight to Now playing.
  const [view, setView] = useState<'browse' | 'playing'>(() => (playerState().at >= 0 ? 'playing' : 'browse'))
  return view === 'playing' && player.at >= 0 ? (
    <NowPlaying player={player} onBack={() => setView('browse')} />
  ) : (
    <Browser player={player} onClose={onClose} onPlaying={() => setView('playing')} />
  )
}

/** Remembered while vaporTV runs: where you were. */
let lastTrail: MusicEntry[] = []

/** How a folder's folders are ordered: by name, by artist, or newest first. */
type Sort = 'name' | 'artist' | 'recent'
const SORTS: { id: Sort; name: string }[] = [
  { id: 'name', name: 'A–Z' },
  { id: 'artist', name: 'Artist' },
  { id: 'recent', name: 'Recently added' }
]
/** The order chosen, on this TV (losing it just means A–Z). */
const SORT_STORE = 'vaportv.musicSort'

function savedSort(): Sort {
  try {
    const saved = localStorage.getItem(SORT_STORE)
    return SORTS.some((s) => s.id === saved) ? (saved as Sort) : 'name'
  } catch {
    return 'name'
  }
}

const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

function Browser({ player, onClose, onPlaying }: { player: PlayerState; onClose: () => void; onPlaying: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [places, setPlaces] = useState<MusicPlace[] | null>(null)
  const [trail, setTrail] = useState<MusicEntry[]>(lastTrail)
  const [entries, setEntries] = useState<MusicEntry[] | null>(null)
  const [tags, setTags] = useState<Record<string, MusicTags>>({})
  const [cards, setCards] = useState<Record<string, MusicFolder>>({})
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<Sort>(savedSort)
  const returnTo = useRef<string | null>(null)
  const here = trail[trail.length - 1] ?? null
  const unsorted = entries?.filter((e) => e.kind === 'folder') ?? []
  const artistOf = (e: MusicEntry): string => cards[e.path]?.artist ?? splitName(e.name).artist ?? e.name
  const folders =
    sort === 'recent'
      ? [...unsorted].sort((a, b) => (b.modified ?? 0) - (a.modified ?? 0))
      : sort === 'artist'
        ? [...unsorted].sort((a, b) => byName.compare(artistOf(a), artistOf(b)) || byName.compare(a.name, b.name))
        : unsorted
  const tracks = entries?.filter((e) => e.kind === 'track') ?? []

  useEffect(() => {
    lastTrail = trail
  }, [trail])

  useEffect(() => {
    window.steamtv.music
      .places()
      .then((found) => {
        setPlaces(found)
        if (!lastTrail.length && found[0]) setTrail([{ name: found[0].name, path: found[0].path, kind: 'folder' }])
      })
      .catch((err: unknown) => setError(errorText(err)))
  }, [])

  // The folder, then its folders' covers and its songs' tags, a screenful at a time.
  useEffect(() => {
    if (!here) return
    let live = true
    setEntries(null)
    setError(null)
    window.steamtv.music
      .browse(here.path)
      .then(async (found) => {
        if (!live) return
        setEntries(found)
        const dirs = found.filter((e) => e.kind === 'folder').map((e) => e.path)
        const songs = found.filter((e) => e.kind === 'track').map((e) => e.path)
        const fillCards = async (): Promise<void> => {
          for (let i = 0; i < dirs.length && live; i += FOLDERS_AT_ONCE) {
            const got = await window.steamtv.music.folders(dirs.slice(i, i + FOLDERS_AT_ONCE)).catch(() => [] as MusicFolder[])
            if (live) setCards((was) => ({ ...was, ...Object.fromEntries(got.map((c) => [c.path, c])) }))
          }
        }
        const fillTags = async (): Promise<void> => {
          for (let i = 0; i < songs.length && live; i += TAGS_AT_ONCE) {
            const got = await window.steamtv.music.tags(songs.slice(i, i + TAGS_AT_ONCE)).catch(() => [] as MusicTags[])
            if (live) setTags((was) => ({ ...was, ...Object.fromEntries(got.map((t) => [t.path, t])) }))
          }
        }
        await Promise.all([fillTags(), fillCards()])
      })
      .catch((err: unknown) => live && setError(errorText(err)))
    return () => {
      live = false
    }
  }, [here])

  // Back out of a folder: the cursor on its card. Into one, or opening the app (back from Now
  // playing too): the song playing, else the album's Play all or the first card. Not when the
  // cursor's in the places, choosing one.
  useEffect(() => {
    if (!entries) return
    const back = returnTo.current && list.current?.querySelector<HTMLElement>(`[data-path="${CSS.escape(returnTo.current)}"]`)
    returnTo.current = null
    if (back) return focus(back)
    if (list.current?.contains(document.activeElement) || !root.current?.contains(document.activeElement)) {
      const first =
        list.current?.querySelector<HTMLElement>('.music-row.playing') ??
        list.current?.querySelector<HTMLElement>('.music-album [data-focusable], .music-card, .music-row') ??
        list.current?.querySelector<HTMLElement>('[data-focusable]')
      if (first) focus(first)
      else root.current?.querySelector<HTMLElement>('.files-place.active')?.focus()
    }
  }, [entries])

  const chooseSort = (next: Sort): void => {
    setSort(next)
    try {
      localStorage.setItem(SORT_STORE, next)
    } catch {
      // Not kept; it's A–Z next time.
    }
    if (list.current) list.current.scrollTop = 0
  }

  const songsHere = (): MusicTags[] => tracks.map((t) => tags[t.path] ?? { path: t.path, title: t.name.replace(/\.[^.]+$/, '') })

  const start = (at: number, shuffle = false): void => {
    if (!tracks.length) return
    if (shuffle !== playerState().shuffle) toggleShuffle()
    playQueue(songsHere(), shuffle ? Math.floor(Math.random() * tracks.length) : at)
    onPlaying()
  }

  // B: up a folder (wherever the cursor is), then from the top of a place to its name on the
  // left, then closes (the music carries on).
  useEffect(() => {
    const onBack = (): void => {
      if (trail.length > 1) {
        returnTo.current = here!.path
        return setTrail((t) => t.slice(0, -1))
      }
      const place = root.current?.querySelector<HTMLElement>('.files-place.active')
      if (list.current?.contains(document.activeElement) && place) return focus(place)
      onClose()
    }
    window.addEventListener(TRAP_CLOSE_EVENT, onBack)
    return () => window.removeEventListener(TRAP_CLOSE_EVENT, onBack)
  })

  const playingPath = current()?.path
  // A folder of songs is an album: its first song's tags name it, and the cover is the one most of its songs share.
  const first = tracks[0] && tags[tracks[0].path]
  const named = here ? splitName(here.name) : { title: '' }
  const album = {
    title: first?.album ?? (trail.length > 1 ? named.title : (here?.name ?? '')),
    artist: first?.artist ?? (trail.length > 1 ? named.artist : undefined),
    cover: tracks.map((t) => tags[t.path]?.cover).find(Boolean)
  }
  const totalSeconds = tracks.reduce((sum, t) => sum + (tags[t.path]?.duration ?? 0), 0)
  const sameArtist = (t: MusicTags | undefined): boolean => !t?.artist || t.artist === album.artist
  const where = here ? trail.map((t) => t.name).join(' / ') : ''
  const counts = entries
    ? [folders.length && `${folders.length} ${folders.length === 1 ? 'folder' : 'folders'}`, tracks.length && `${tracks.length} ${tracks.length === 1 ? 'song' : 'songs'}`]
        .filter(Boolean)
        .join(' · ')
    : ''

  return (
    <div className="files-app music-app" ref={root} data-focus-trap="">
      <div className="settings-scrim" aria-hidden="true" />
      <div className="settings-sidebar files-sidebar">
        <h2 className="settings-title display">Music</h2>
        <div className="settings-categories files-places" data-nav-scope="">
          {player.at >= 0 && (
            <button className="settings-category files-place music-now display" tabIndex={-1} data-focusable="" data-select-sound="move" data-nav-right=".music-scroll [data-focusable]" onClick={onPlaying}>
              <span className="music-now-bars" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span className="files-place-name">Now playing</span>
            </button>
          )}
          {places?.map((p) => (
            <button
              key={p.path}
              className={`settings-category files-place display${trail[0]?.path === p.path ? ' active' : ''}`}
              tabIndex={-1}
              data-focusable=""
              data-select-sound="move"
              data-nav-right=".music-scroll [data-focusable]"
              onFocus={() => {
                if (trail[0]?.path !== p.path) setTrail([{ name: p.name, path: p.path, kind: 'folder' }])
              }}
              onClick={() => {
                const firstInPane = list.current?.querySelector<HTMLElement>('[data-focusable]')
                if (firstInPane) focus(firstInPane)
              }}
            >
              <span className="files-place-name">{p.name}</span>
            </button>
          ))}
          {places && places.length === 0 && <p className="settings-help">No music folders yet: put songs in ~/Music, or plug in a drive.</p>}
        </div>
      </div>

      <div className="files-pane">
        <div className="settings-group files-group music-group">
          {tracks.length === 0 && <h3 className="settings-heading display">{here?.name ?? 'Music'}</h3>}
          <p className="settings-help files-path">{counts ? `${where} · ${counts}` : where}</p>
          <div className="files-list browse-list music-scroll" ref={list} data-nav-scope="" data-nav-left=".files-place.active">
            {error && <p className="settings-help">{error}</p>}
            {!entries && !error && <p className="settings-help">Loading…</p>}
            {entries && entries.length === 0 && !error && <p className="settings-help">No songs or folders here.</p>}

            {tracks.length > 0 && (
              <div className="music-album">
                {album.cover ? (
                  <img className="music-album-cover" src={album.cover} alt="" />
                ) : (
                  <span className="music-album-cover music-no-cover display" aria-hidden="true">
                    ♪
                  </span>
                )}
                <div className="music-album-text">
                  <h3 className="music-album-title display">{album.title}</h3>
                  {album.artist && <p className="music-album-artist">{album.artist}</p>}
                  <p className="music-album-facts">
                    {tracks.length} {tracks.length === 1 ? 'song' : 'songs'}
                    {totalSeconds > 0 && ` · ${albumLength(totalSeconds)}`}
                  </p>
                  <div className="music-actions">
                    <button className="files-action display" tabIndex={-1} data-focusable="" data-select-sound="move" onFocus={() => list.current && (list.current.scrollTop = 0)} onClick={() => start(0)}>
                      Play all
                    </button>
                    <button className="files-action display" tabIndex={-1} data-focusable="" data-select-sound="move" onFocus={() => list.current && (list.current.scrollTop = 0)} onClick={() => start(0, true)}>
                      Shuffle
                    </button>
                  </div>
                </div>
              </div>
            )}

            {tracks.length > 0 && (
              <div className="music-tracks">
                {tracks.map((e, i) => {
                  const t = tags[e.path]
                  return (
                    <button
                      key={e.path}
                      className={`setting-row files-row music-row${e.path === playingPath ? ' playing' : ''}`}
                      tabIndex={-1}
                      data-focusable=""
                      data-select-sound="move"
                      data-path={e.path}
                      onFocus={(event) => centre(list.current, event.currentTarget)}
                      onClick={() => start(i)}
                    >
                      <span className="music-track-no">
                        {e.path === playingPath ? (
                          <span className="music-now-bars" aria-hidden="true">
                            <i />
                            <i />
                            <i />
                          </span>
                        ) : (
                          (t?.track ?? i + 1)
                        )}
                      </span>
                      <span className="music-row-text">
                        <span className="setting-name display">{t?.title ?? e.name.replace(/\.[^.]+$/, '')}</span>
                        {!sameArtist(t) && <span className="music-row-sub">{t!.artist}</span>}
                      </span>
                      {t?.duration !== undefined && <span className="setting-detail">{clock(t.duration)}</span>}
                    </button>
                  )
                })}
              </div>
            )}

            {folders.length > 0 && (
              <>
                {tracks.length > 0 && <h4 className="music-section display">Folders</h4>}
                {folders.length > 1 && (
                  <div className="music-sorts" role="radiogroup" aria-label="Order">
                    {SORTS.map((o) => (
                      <button
                        key={o.id}
                        className={`files-action music-sort display${sort === o.id ? ' on' : ''}`}
                        tabIndex={-1}
                        role="radio"
                        aria-checked={sort === o.id}
                        data-focusable=""
                        data-select-sound="move"
                        onFocus={(event) => centre(list.current, event.currentTarget)}
                        onClick={() => chooseSort(o.id)}
                      >
                        {o.name}
                      </button>
                    ))}
                  </div>
                )}
                <div className="music-grid">
                  {folders.map((e) => {
                    const card = cards[e.path]
                    const title = card?.title ?? e.name
                    return (
                      <button
                        key={e.path}
                        className="recent-card music-card"
                        tabIndex={-1}
                        data-focusable=""
                        data-select-sound="move"
                        data-path={e.path}
                        aria-label={card?.artist ? `${title}, ${card.artist}` : title}
                        onFocus={(event) => centre(list.current, event.currentTarget)}
                        onClick={() => setTrail((was) => [...was, e])}
                      >
                        <div className="recent-art">
                          {card?.cover ? (
                            <img src={card.cover} alt="" loading="lazy" />
                          ) : (
                            <span className={`recent-no-art display${card ? '' : ' loading'}`}>
                              <span className="no-art-band">{title}</span>
                            </span>
                          )}
                        </div>
                        <div className="recent-footer">
                          <div className="recent-text">
                            <div className="recent-title">{title}</div>
                            <div className="recent-date">{card?.artist ?? ''}</div>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Now playing: the cover floating over the backdrop, the song beside it, and the player's buttons. */
function NowPlaying({ player, onBack }: { player: PlayerState; onBack: () => void }) {
  const self = useRef<HTMLButtonElement>(null)
  const buttonsRow = useRef<HTMLDivElement>(null)
  const playButton = useRef<HTMLButtonElement>(null)
  const [barShown, setBarShown] = useState(true)
  const barTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const onButtonsRef = useRef(false)
  const [onButtons, setOnButtonsState] = useState(false)
  const [keysShown, setKeysShown] = useState(false)
  const [controls, setControls] = useState<Controls>(DEFAULT_CONTROLS)
  const family = useControllerFamily()
  const song = current()

  const setOnButtons = (on: boolean): void => {
    onButtonsRef.current = on
    setOnButtonsState(on)
  }
  const toTop = useCallback((): void => {
    onButtonsRef.current = false
    setOnButtonsState(false)
    if (self.current) focus(self.current)
  }, [])
  const showBar = useCallback(() => {
    setBarShown(true)
    clearTimeout(barTimer.current)
    if (onButtonsRef.current) return
    barTimer.current = setTimeout(() => {
      setBarShown(false)
      setKeysShown(false)
    }, BAR_MS)
  }, [])
  useEffect(() => () => clearTimeout(barTimer.current), [])

  useEffect(() => {
    window.steamtv.getSettings().then((s) => setControls(s.controls))
    if (self.current) focus(self.current)
    showBar()
  }, [showBar])

  // The screensaver stays off while it plays.
  useEffect(() => {
    const holder = {}
    keepAwake(holder, player.playing)
    return () => keepAwake(holder, false)
  }, [player.playing])

  // B: the shortcuts panel, then back to browsing (the music carries on).
  useEffect(() => {
    const onClose = (): void => (keysShown ? setKeysShown(false) : onBack())
    window.addEventListener(TRAP_CLOSE_EVENT, onClose)
    return () => window.removeEventListener(TRAP_CLOSE_EVENT, onClose)
  }, [keysShown, onBack])

  // On the seek bar: left and right skip 10 seconds, down to the buttons. On the buttons: along them, up back.
  // L1 / R1: the song before or after. The triggers: 10 seconds back or on, as in the video players.
  useEffect(() => {
    const onDirection = (event: Event): void => {
      const direction = (event as CustomEvent<Direction>).detail
      showBar()
      if (onButtonsRef.current) {
        if (direction === 'up') return toTop()
        if (direction === 'down') return
        const nextButton = stepAlong(buttonsRow.current, direction)
        if (nextButton) {
          play('move')
          focus(nextButton)
        }
        return
      }
      if (direction === 'down') {
        setOnButtons(true)
        play('move')
        if (playButton.current) focus(playButton.current)
        return
      }
      if (direction === 'left') seekBy(-skipSeconds)
      if (direction === 'right') seekBy(skipSeconds)
    }
    const onTab = (event: Event): void => {
      showBar()
      if ((event as CustomEvent<number>).detail < 0) previous()
      else void next()
    }
    const onSkip = (event: Event): void => {
      showBar()
      seekBy((event as CustomEvent<number>).detail)
    }
    window.addEventListener(OWN_DIRECTION_EVENT, onDirection)
    window.addEventListener(TRAP_TAB_EVENT, onTab)
    window.addEventListener(PLAYER_SKIP_EVENT, onSkip)
    return () => {
      window.removeEventListener(OWN_DIRECTION_EVENT, onDirection)
      window.removeEventListener(TRAP_TAB_EVENT, onTab)
      window.removeEventListener(PLAYER_SKIP_EVENT, onSkip)
    }
  }, [showBar, toTop])

  const length = player.duration || song?.duration || 0
  const progress = length ? Math.min(100, (player.time / length) * 100) : 0
  const queueText = player.order.length > 1 ? `${player.at + 1} of ${player.order.length}` : ''
  return (
    <div className="media-player music-playing" data-focus-trap="" data-own-directions="">
      <div className="music-playing-scrim" aria-hidden="true" />
      <div className={`files-viewer music-viewer${barShown || !player.playing || onButtons ? ' bar-shown' : ''}`}>
        <div className="music-now-stage">
          <FloatingCover cover={song?.cover} playing={player.playing} />
          <div className="music-song">
            {queueText && <p className="music-song-queue">{queueText}</p>}
            <p className="music-song-title display">{song?.title ?? ''}</p>
            {song?.artist && <p className="music-song-artist">{song.artist}</p>}
            {song?.album && <p className="music-song-album">{song.album}</p>}
          </div>
        </div>
        <div className="files-viewer-bar media-controls-bar">
          <button ref={self} className="files-viewer-line media-seek" tabIndex={-1} data-focusable="" data-select-sound="move" onClick={() => (showBar(), toggle())}>
            <span className="files-viewer-time">{clock(player.time)}</span>
            <span className="files-progress media-progress">
              <span className="files-progress-fill" style={{ width: `${progress}%` }} />
              <span className="media-playhead" style={{ left: `${progress}%` }} />
            </span>
            <span className="files-viewer-time">{clock(length)}</span>
          </button>
          <div className="media-buttons" ref={buttonsRow}>
            <PlayerButton
              label="Stop"
              onClick={() => {
                stopMusic()
                onBack()
              }}
            >
              {ICONS.stop}
            </PlayerButton>
            <div className="media-buttons-middle">
              <PlayerButton label="Previous" onClick={() => (showBar(), previous())}>
                {ICONS.previous}
              </PlayerButton>
              <PlayerButton label={`Back ${skipSeconds} seconds`} onClick={() => (showBar(), seekBy(-skipSeconds))}>
                {ICONS.back(skipSeconds)}
              </PlayerButton>
              <PlayerButton label={player.playing ? 'Pause' : 'Play'} big buttonRef={playButton} onClick={() => (showBar(), toggle())}>
                {player.playing ? ICONS.pause : ICONS.play}
              </PlayerButton>
              <PlayerButton label={`On ${skipSeconds} seconds`} onClick={() => (showBar(), seekBy(skipSeconds))}>
                {ICONS.on(skipSeconds)}
              </PlayerButton>
              <PlayerButton label="Next" disabled={player.at + 1 >= player.order.length && player.repeat !== 'all'} onClick={() => (showBar(), void next())}>
                {ICONS.next}
              </PlayerButton>
            </div>
            <PlayerButton label={player.shuffle ? 'Shuffle: on' : 'Shuffle: off'} pressed={player.shuffle} onClick={() => (showBar(), toggleShuffle())}>
              {ICONS.shuffle}
            </PlayerButton>
            <PlayerButton label={player.repeat === 'off' ? 'Repeat: off' : player.repeat === 'all' ? 'Repeat: all' : 'Repeat: this song'} pressed={player.repeat !== 'off'} onClick={() => (showBar(), cycleRepeat())}>
              {player.repeat === 'one' ? ICONS.repeatOne : ICONS.repeat}
            </PlayerButton>
            <PlayerButton
              label="Controller shortcuts"
              pressed={keysShown}
              onClick={() => {
                showBar()
                setKeysShown((shown) => !shown)
              }}
            >
              {ICONS.controller}
            </PlayerButton>
          </div>
        </div>
        {player.loading && <p className="media-subs-loading">Loading…</p>}
      </div>
      {keysShown && (
        <ShortcutsPanel>
          <span className="files-hint">
            <ButtonIcon button={controls.select} family={family} /> Play / pause
          </span>
          <span className="files-hint">
            <DpadIcon leftRight /> {skipSeconds} seconds back / on (on the seek bar)
          </span>
          <span className="files-hint">
            <ButtonIcon button={controls.previousTab} family={family} />
            <ButtonIcon button={controls.nextTab} family={family} /> Previous / next song
          </span>
          <span className="files-hint">
            <DpadIcon /> Down to these buttons, up to the seek bar
          </span>
          <span className="files-hint">
            <ButtonIcon button={controls.back} family={family} /> Back to your music (it keeps playing)
          </span>
        </ShortcutsPanel>
      )}
    </div>
  )
}
