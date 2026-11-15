import { useCallback, useEffect, useRef, useState } from 'react'
import type { MusicEntry, MusicPlace, MusicTags } from '../../../shared/types'
import { DEFAULT_CONTROLS, type Controls } from '../../../shared/controls'
import { focus, OWN_DIRECTION_EVENT, PLAYER_SKIP_EVENT, TRAP_CLOSE_EVENT, TRAP_TAB_EVENT, type Direction } from '../input/focus'
import { keepAwake } from '../input/idle'
import { play } from '../input/sounds'
import { cycleRepeat, current, next, playerState, playQueue, previous, seekBy, skipSeconds, stopMusic, subscribe, toggle, toggleShuffle, type PlayerState } from '../music/player'
import { Visualizer } from '../music/Visualizer'
import { ButtonIcon, DpadIcon, useControllerFamily } from './ButtonIcon'
import { errorText } from './GooglePhotos'
import { ICONS, PlayerButton, ShortcutsPanel, stepAlong } from './PlayerControls'

// The Music app (its tile is in Apps): your own music from ~/Music, network shares (mounted
// under ~/Network) and drives. Places on the left, the folder on the right, as in Files: A on
// a song plays the folder from it; Play all and Shuffle at the top. Now playing is the
// visualizer, coloured from the cover, with the player's buttons along the foot (D-pad down
// to them, as in the video players). The music carries on when the screen closes.

/** AppTile fires this for the Music tile (detail: the tile, to come back to). */
export const MUSIC_EVENT = 'steamtv:music'

/** Tags asked for at a time, as the list fills in. */
const TAGS_AT_ONCE = 24
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

function Browser({ player, onClose, onPlaying }: { player: PlayerState; onClose: () => void; onPlaying: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [places, setPlaces] = useState<MusicPlace[] | null>(null)
  const [trail, setTrail] = useState<MusicEntry[]>(lastTrail)
  const [entries, setEntries] = useState<MusicEntry[] | null>(null)
  const [tags, setTags] = useState<Record<string, MusicTags>>({})
  const [error, setError] = useState<string | null>(null)
  const returnTo = useRef<string | null>(null)
  const here = trail[trail.length - 1] ?? null
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

  useEffect(() => {
    const first = root.current?.querySelector<HTMLElement>('.files-place.active, .files-place')
    if (first) focus(first)
  }, [places])

  // The folder, then its songs' tags a screenful at a time.
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
        const paths = found.filter((e) => e.kind === 'track').map((e) => e.path)
        for (let i = 0; i < paths.length && live; i += TAGS_AT_ONCE) {
          const got = await window.steamtv.music.tags(paths.slice(i, i + TAGS_AT_ONCE)).catch(() => [] as MusicTags[])
          if (!live) return
          setTags((was) => ({ ...was, ...Object.fromEntries(got.map((t) => [t.path, t])) }))
        }
      })
      .catch((err: unknown) => live && setError(errorText(err)))
    return () => {
      live = false
    }
  }, [here])

  // Back out of a folder: the cursor on it. Into one: its first row (if the cursor was in the list).
  useEffect(() => {
    if (!entries) return
    const back = returnTo.current && list.current?.querySelector<HTMLElement>(`[data-path="${CSS.escape(returnTo.current)}"]`)
    returnTo.current = null
    if (back) return focus(back)
    if (list.current?.contains(document.activeElement) || !root.current?.contains(document.activeElement)) {
      const first = list.current?.querySelector<HTMLElement>('[data-focusable]')
      if (first) focus(first)
      else root.current?.querySelector<HTMLElement>('.files-place.active')?.focus()
    }
  }, [entries])

  const songsHere = (): MusicTags[] => tracks.map((t) => tags[t.path] ?? { path: t.path, title: t.name.replace(/\.[^.]+$/, '') })

  const start = (at: number, shuffle = false): void => {
    if (!tracks.length) return
    if (shuffle !== playerState().shuffle) toggleShuffle()
    playQueue(songsHere(), shuffle ? Math.floor(Math.random() * tracks.length) : at)
    onPlaying()
  }

  // B: up a folder, then to the places, then closes (the music carries on).
  useEffect(() => {
    const onBack = (): void => {
      const inList = list.current?.contains(document.activeElement)
      if (inList && trail.length > 1) {
        returnTo.current = here!.path
        return setTrail((t) => t.slice(0, -1))
      }
      const place = root.current?.querySelector<HTMLElement>('.files-place.active')
      if (inList && place) return focus(place)
      onClose()
    }
    window.addEventListener(TRAP_CLOSE_EVENT, onBack)
    return () => window.removeEventListener(TRAP_CLOSE_EVENT, onBack)
  })

  const playingPath = current()?.path
  return (
    <div className="files-app music-app" ref={root} data-focus-trap="">
      <div className="settings-scrim" aria-hidden="true" />
      <div className="settings-sidebar files-sidebar">
        <h2 className="settings-title display">Music</h2>
        <div className="settings-categories files-places" data-nav-scope="">
          {player.at >= 0 && (
            <button className="settings-category files-place music-now display" tabIndex={-1} data-focusable="" data-select-sound="move" data-nav-right=".files-list [data-focusable]" onClick={onPlaying}>
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
              data-nav-right=".files-list [data-focusable]"
              onFocus={() => {
                if (trail[0]?.path !== p.path) setTrail([{ name: p.name, path: p.path, kind: 'folder' }])
              }}
              onClick={() => {
                const first = list.current?.querySelector<HTMLElement>('[data-focusable]')
                if (first) focus(first)
              }}
            >
              <span className="files-place-name">{p.name}</span>
            </button>
          ))}
          {places && places.length === 0 && <p className="settings-help">No music folders yet: put songs in ~/Music, or plug in a drive.</p>}
        </div>
      </div>

      <div className="files-pane">
        <div className="settings-group files-group">
          <h3 className="settings-heading display">{here?.name ?? 'Music'}</h3>
          <p className="settings-help files-path">
            {here ? `${trail.map((t) => t.name).join(' / ')}${entries ? ` · ${tracks.length} ${tracks.length === 1 ? 'song' : 'songs'}` : ''}` : ''}
          </p>
          <div className="files-list browse-list music-list" ref={list} data-nav-scope="" data-nav-left=".files-place.active">
            {tracks.length > 0 && (
              <div className="music-actions">
                <button className="files-action display" tabIndex={-1} data-focusable="" data-select-sound="move" onClick={() => start(0)}>
                  Play all
                </button>
                <button className="files-action display" tabIndex={-1} data-focusable="" data-select-sound="move" onClick={() => start(0, true)}>
                  Shuffle
                </button>
              </div>
            )}
            {error && <p className="settings-help">{error}</p>}
            {!entries && !error && <p className="settings-help">Loading…</p>}
            {entries && entries.length === 0 && !error && <p className="settings-help">No songs or folders here.</p>}
            {entries?.map((e) => {
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
                  onClick={() => {
                    if (e.kind === 'folder') return setTrail((was) => [...was, e])
                    start(tracks.indexOf(e))
                  }}
                >
                  {e.kind === 'folder' ? (
                    <svg className="files-icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.2l2 2h8.8A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" />
                    </svg>
                  ) : t?.cover ? (
                    <img className="music-thumb" src={t.cover} alt="" />
                  ) : (
                    <span className="music-thumb music-thumb-empty" aria-hidden="true">
                      ♪
                    </span>
                  )}
                  <span className="music-row-text">
                    <span className="setting-name display">{e.kind === 'folder' ? e.name : (t?.title ?? e.name.replace(/\.[^.]+$/, ''))}</span>
                    {e.kind === 'track' && (t?.artist || t?.album) && <span className="music-row-sub">{[t.artist, t.album].filter(Boolean).join(' · ')}</span>}
                  </span>
                  {e.kind === 'track' && t?.duration !== undefined && <span className="setting-detail">{clock(t.duration)}</span>}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Now playing: the visualizer, the song, and the player's buttons. */
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
      <Visualizer cover={song?.cover} />
      <div className={`files-viewer music-viewer${barShown || !player.playing || onButtons ? ' bar-shown' : ''}`}>
        <div className="music-song">
          <p className="music-song-title display">{song?.title ?? ''}</p>
          {(song?.artist || song?.album) && <p className="music-song-sub">{[song?.artist, song?.album].filter(Boolean).join(' · ')}</p>}
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
        {queueText && <p className="music-queue-count">{queueText}</p>}
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
