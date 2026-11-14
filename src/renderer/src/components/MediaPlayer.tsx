import { useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import type Hls from 'hls.js'
import { DEFAULT_CONTROLS, type Controls } from '../../../shared/controls'
import type { MediaChoice, MediaPlayback } from '../../../shared/types'
import { focus, OWN_DIRECTION_EVENT, PLAYER_SKIP_EVENT, PLAYER_TRACKS_EVENT, TRAP_CLOSE_EVENT, type Direction } from '../input/focus'
import { keepAwake } from '../input/idle'
import { play as playSound } from '../input/sounds'
import { ButtonIcon, DpadIcon, useControllerFamily } from './ButtonIcon'
import { MEDIA_PLAY_EVENT, MEDIA_WATCHED_EVENT } from './ContinueWatching'
import { Spinner } from './LaunchOverlay'
import { MUSIC_HOLD_EVENT } from './MusicPreview'
import { toast } from './Toast'

// Plays a film or episode from a media server (Emby, Jellyfin) full screen, from where it was
// left: straight from the file when Chromium can, or as HLS the server converts (hls.js). A pauses, left and right skip
// D-pad left and right scrub along the bar, the triggers skip back or on 10 seconds, Y opens
// Audio & subtitles, B stops. The figure eight spins while it loads or buffers. The server hears where it's
// got to as it plays, and where it stopped, so Continue watching (and its own apps) pick up there.
//
// The bar has two rows the cursor moves between: the seek bar (where it starts, so A and the
// D-pad work as above) and, D-pad down, the usual player buttons (stop, back 10, play/pause,
// on 10, audio & subtitles, and the controller icon, whose panel lists the buttons' shortcuts).
// Left and right step along the buttons; up goes back to the seek bar.

/** The triggers (L2 / R2 by default) skip this far; it comes with PLAYER_SKIP_EVENT. */
const SKIP_S = 10
/**
 * D-pad left and right scrub: each press moves a marker along the bar (this share of the
 * video, at least SCRUB_MIN_S), faster the longer it's held, and it jumps there once the
 * presses stop for SCRUB_SETTLE_MS (each jump has the server convert from there, so not per press).
 */
const SCRUB_SHARE = 1 / 120
const SCRUB_MIN_S = 10
const SCRUB_FASTEST = 4
const SCRUB_SETTLE_MS = 700
const BAR_MS = 3500
/** The cursor on the buttons: the bar stays up longer, as something's being picked. */
const BUTTONS_BAR_MS = 8000
const REPORT_MS = 10_000

/** Mounted once (App): opens when a Continue watching card asks. */
export function MediaPlayerHost() {
  const [item, setItem] = useState<{ source: string; id: string; fromStart?: boolean } | null>(null)
  useEffect(() => {
    const open = (event: Event): void => setItem((event as CustomEvent<{ source: string; id: string; fromStart?: boolean }>).detail)
    window.addEventListener(MEDIA_PLAY_EVENT, open)
    return () => window.removeEventListener(MEDIA_PLAY_EVENT, open)
  }, [])
  if (!item) return null
  return (
    <MediaPlayer
      key={`${item.source}:${item.id}`}
      source={item.source}
      itemId={item.id}
      fromStart={item.fromStart}
      onClose={() => {
        setItem(null)
        window.dispatchEvent(new Event(MEDIA_WATCHED_EVENT))
      }}
    />
  )
}

function MediaPlayer({ source, itemId, fromStart, onClose }: { source: string; itemId: string; fromStart?: boolean; onClose: () => void }) {
  const self = useRef<HTMLButtonElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const [playback, setPlayback] = useState<MediaPlayback | null>(null)
  const [paused, setPaused] = useState(false)
  const [time, setTime] = useState({ at: 0, length: 0 })
  const [barShown, setBarShown] = useState(true)
  const barTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [controls, setControls] = useState<Controls>(DEFAULT_CONTROLS)
  const family = useControllerFamily()
  const started = useRef(false)
  const [playing, setPlaying] = useState(false)
  // Loading or buffering (from opening until it plays, and while it catches up after a jump).
  const [loading, setLoading] = useState(true)
  // Where a scrub has the marker (seconds), until it settles and jumps there.
  const [scrub, setScrub] = useState<number | null>(null)
  // A trigger's skip, said under the spinner for a moment: seconds back (negative) or on, added up while pressed again.
  const [skipped, setSkipped] = useState<{ by: number; key: number } | null>(null)
  const skipTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const scrubbing = useRef<{ to: number; at: number; streak: number; timer?: ReturnType<typeof setTimeout> }>({ to: 0, at: 0, streak: 0 })
  // Audio & subtitles: the tracks picked (unset: the server's defaults), the menu, and where to pick up after a change.
  const [choice, setChoice] = useState<MediaChoice>({})
  const [menu, setMenu] = useState(false)
  const resumeAt = useRef<number | null>(null)
  const [cues, setCues] = useState<string | null>(null)
  /** The cursor on the buttons row (not the seek bar), and the shortcuts panel. */
  const [onButtons, setOnButtonsState] = useState(false)
  const onButtonsRef = useRef(false)
  const buttonsRow = useRef<HTMLDivElement>(null)
  const playButton = useRef<HTMLButtonElement>(null)
  const [keysShown, setKeysShown] = useState(false)
  const setOnButtons = (on: boolean): void => {
    onButtonsRef.current = on
    setOnButtonsState(on)
  }
  /** Back to the seek bar (the bar hid, a menu closed). */
  const toSeekBar = useCallback((): void => {
    onButtonsRef.current = false
    setOnButtonsState(false)
    if (self.current) focus(self.current)
  }, [])

  const showBar = useCallback(() => {
    setBarShown(true)
    clearTimeout(barTimer.current)
    barTimer.current = setTimeout(
      () => {
        setBarShown(false)
        setKeysShown(false)
        // Hidden with the cursor on a button: it goes back to the seek bar, so A and the D-pad do what they did.
        if (onButtonsRef.current && !video.current?.paused) toSeekBar()
      },
      onButtonsRef.current ? BUTTONS_BAR_MS : BAR_MS
    )
  }, [toSeekBar])
  useEffect(() => () => clearTimeout(barTimer.current), [])

  useEffect(() => {
    window.steamtv.getSettings().then((s) => setControls(s.controls))
    if (self.current) focus(self.current)
  }, [])

  // Asks the server how to play it (with the tracks picked), then plays: hls.js for a converted stream,
  // the file itself otherwise. A new pick plays again from where it had got to.
  useEffect(() => {
    showBar()
    let hls: Hls | null = null
    let cancelled = false
    window.steamtv.media
      .playback(source, itemId, choice)
      .then(async (info) => {
        if (cancelled || !video.current) return
        // Where it was left, unless asked to start over (Play from the start); a new track: where it had got to.
        const from = resumeAt.current ?? (!fromStart && info.startSeconds > 5 ? info.startSeconds : 0)
        resumeAt.current = null
        started.current = false
        setPlayback(info)
        const el = video.current
        const begin = (): void => {
          if (from) el.currentTime = from
          el.play().catch(() => undefined)
        }
        if (info.hls) {
          const { default: HlsPlayer } = await import('hls.js')
          if (cancelled) return
          // No worker: the page's content policy doesn't allow blob: workers, and one stream doesn't need it.
          hls = new HlsPlayer({ enableWorker: false, startPosition: from || -1 })
          hls.on(HlsPlayer.Events.ERROR, (_event, data) => {
            if (!data.fatal) return
            console.error('steamtv: media stream failed:', data.type, data.details)
            toast(`Couldn’t play ${info.title}`)
            onClose()
          })
          hls.loadSource(info.url)
          hls.attachMedia(el)
          hls.on(HlsPlayer.Events.MANIFEST_PARSED, () => el.play().catch(() => undefined))
        } else {
          el.src = info.url
          el.addEventListener('loadedmetadata', begin, { once: true })
        }
      })
      .catch((err) => {
        console.error('steamtv: media playback:', err)
        toast(`Couldn’t play that: ${err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : err}`)
        onClose()
      })
    return () => {
      cancelled = true
      hls?.destroy()
    }
  }, [source, itemId, choice])

  // Text subtitles: fetched as WebVTT and handed to the video as a track it draws.
  const subtitleUrl = playback?.subtitleUrl
  useEffect(() => {
    setCues(null)
    if (!subtitleUrl) return
    let url: string | null = null
    let cancelled = false
    fetch(subtitleUrl)
      .then((response) => (response.ok ? response.text() : Promise.reject(new Error(String(response.status)))))
      .then((text) => {
        if (cancelled) return
        url = URL.createObjectURL(new Blob([text], { type: 'text/vtt' }))
        setCues(url)
      })
      .catch((err) => {
        console.error('steamtv: media subtitles:', err)
        toast('Couldn’t load those subtitles')
      })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [subtitleUrl])

  /** Another audio track or subtitles: the server's told this play stopped here, and it plays again with them from here. */
  const pick = (next: MediaChoice): void => {
    setMenu(false)
    if (!playback) return
    const same = (next.audio ?? playback.audio) === playback.audio && (next.subtitle ?? playback.subtitleIndex) === playback.subtitleIndex
    setTimeout(toSeekBar)
    if (same) return
    resumeAt.current = video.current?.currentTime ?? 0
    if (started.current) report('stop')
    setChoice({ audio: next.audio ?? playback.audio, subtitle: next.subtitle ?? playback.subtitleIndex })
  }
  const hasTracks = !!playback && (playback.audioTracks.length > 1 || playback.subtitleTracks.length > 0)

  // Where it's got to, for the server: as it starts, every few seconds, on pausing, and as it stops.
  const position = (): number => video.current?.currentTime ?? 0
  const report = useCallback(
    (event: 'start' | 'progress' | 'stop'): void => {
      if (!playback) return
      void window.steamtv.media.report(event, playback, position(), video.current?.paused ?? false)
    },
    [playback]
  )
  useEffect(() => {
    if (!playback) return
    const timer = setInterval(() => started.current && report('progress'), REPORT_MS)
    return () => clearInterval(timer)
  }, [playback, report])

  const stop = useCallback((): void => {
    if (started.current) report('stop')
    onClose()
  }, [report, onClose])

  // Select + Start (held), as over a game: stops it.
  useEffect(() => window.steamtv.onCloseCombo(stop), [stop])

  // B closes Audio & subtitles, or stops; the music waits and the screensaver stays off while it's open.
  useEffect(() => {
    const onBack = (): void => {
      if (keysShown) return setKeysShown(false)
      if (!menu) return stop()
      setMenu(false)
      setTimeout(toSeekBar)
    }
    window.addEventListener(TRAP_CLOSE_EVENT, onBack)
    return () => window.removeEventListener(TRAP_CLOSE_EVENT, onBack)
  }, [stop, menu, keysShown, toSeekBar])
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(MUSIC_HOLD_EVENT, { detail: true }))
    return () => void window.dispatchEvent(new CustomEvent(MUSIC_HOLD_EVENT, { detail: false }))
  }, [])
  useEffect(() => {
    const holder = {}
    keepAwake(holder, !paused)
    return () => keepAwake(holder, false)
  }, [paused])
  // A game or app coming to the front pauses it.
  useEffect(() => {
    const onBlur = (): void => video.current?.pause()
    window.addEventListener('blur', onBlur)
    return () => window.removeEventListener('blur', onBlur)
  }, [])

  // On the seek bar, D-pad left/right scrub and down goes to the buttons; on the buttons, left and
  // right step along them and up goes back. The first press with the bar hidden only shows it,
  // unless it's a scrub (which shows it too).
  useEffect(() => {
    const onDirection = (event: Event): void => {
      const direction = (event as CustomEvent<Direction>).detail
      showBar()
      if (onButtonsRef.current) {
        if (direction === 'up') return toSeekBar()
        if (direction === 'down') return
        const buttons = [...(buttonsRow.current?.querySelectorAll<HTMLElement>('[data-focusable]') ?? [])]
        const next = buttons[buttons.indexOf(document.activeElement as HTMLElement) + (direction === 'right' ? 1 : -1)]
        if (next) {
          playSound('move')
          focus(next)
        }
        return
      }
      if (direction === 'down') {
        setOnButtons(true)
        playSound('move')
        if (playButton.current) focus(playButton.current)
        showBar()
        return
      }
      const el = video.current
      if (!el || (direction !== 'left' && direction !== 'right')) return
      const length = el.duration || playback?.durationSeconds || 0
      const s = scrubbing.current
      const now = performance.now()
      // Held (the presses repeat), each step bigger, up to SCRUB_FASTEST times.
      s.streak = now - s.at < 400 ? s.streak + 1 : 0
      s.at = now
      const from = s.timer ? s.to : el.currentTime
      const step = Math.max(SCRUB_MIN_S, length * SCRUB_SHARE) * Math.min(SCRUB_FASTEST, 1 + s.streak * 0.25)
      s.to = Math.max(0, Math.min(Math.max(0, length - 1), from + (direction === 'right' ? step : -step)))
      setScrub(s.to)
      clearTimeout(s.timer)
      s.timer = setTimeout(() => {
        s.timer = undefined
        if (video.current) video.current.currentTime = s.to
        setScrub(null)
      }, SCRUB_SETTLE_MS)
    }
    window.addEventListener(OWN_DIRECTION_EVENT, onDirection)
    return () => {
      window.removeEventListener(OWN_DIRECTION_EVENT, onDirection)
      clearTimeout(scrubbing.current.timer)
    }
  }, [showBar, playback, toSeekBar])

  // The triggers: back or on 10 seconds. Y: Audio & subtitles (again, closed).
  const skip = useCallback(
    (by: number): void => {
      showBar()
      const el = video.current
      if (!el) return
      const length = el.duration || playback?.durationSeconds || 0
      el.currentTime = Math.max(0, Math.min(Math.max(0, length - 1), el.currentTime + by))
      // Pressed again the same way soon after: one total ("Fast-forwarding 30 seconds").
      setSkipped((was) => ({ by: was && Math.sign(was.by) === Math.sign(by) ? was.by + by : by, key: (was?.key ?? 0) + 1 }))
      clearTimeout(skipTimer.current)
      skipTimer.current = setTimeout(() => setSkipped(null), 1400)
    },
    [showBar, playback]
  )
  const tracks = useCallback((): void => {
    if (!hasTracks) return toast('This has no other audio or subtitles')
    setKeysShown(false)
    setMenu((open) => {
      if (open) setTimeout(toSeekBar)
      return !open
    })
  }, [hasTracks, toSeekBar])
  useEffect(() => {
    const onSkip = (event: Event): void => skip((event as CustomEvent<number>).detail)
    const onTracks = (): void => tracks()
    window.addEventListener(PLAYER_SKIP_EVENT, onSkip)
    window.addEventListener(PLAYER_TRACKS_EVENT, onTracks)
    return () => {
      window.removeEventListener(PLAYER_SKIP_EVENT, onSkip)
      window.removeEventListener(PLAYER_TRACKS_EVENT, onTracks)
    }
  }, [skip, tracks])

  // Opening the menu puts the cursor on the audio track playing (or the first thing in it).
  useEffect(() => {
    if (!menu) return
    // The menu's drawn by now (effects run after it is).
    const el = document.querySelector<HTMLElement>('.media-tracks [aria-checked="true"], .media-tracks [data-focusable]')
    if (el) focus(el)
  }, [menu])

  const toggle = (): void => {
    showBar()
    const el = video.current
    if (!el) return
    if (el.paused) el.play().catch(() => undefined)
    else el.pause()
  }

  // The time shown: as it plays, and on any seek or pause (timeupdate alone can lag behind a skip).
  const tick = useCallback(() => {
    const el = video.current
    if (el) setTime({ at: el.currentTime, length: el.duration || 0 })
  }, [])
  useEffect(() => {
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [tick])

  const length = (Number.isFinite(time.length) && time.length) || playback?.durationSeconds || 0
  return (
    <div className="media-player" data-focus-trap="" {...(menu ? {} : { 'data-own-directions': '' })}>
      <div className={`files-viewer${barShown || paused ? ' bar-shown' : ''}${onButtons ? ' on-buttons' : ''}`}>
        {/* Its picture while it loads. */}
        {!playing && playback?.backdrop && <img className="files-viewer-media media-player-poster" src={playback.backdrop} alt="" />}
        <video
          ref={video}
          className="files-viewer-media"
          playsInline
          onWaiting={() => setLoading(true)}
          onSeeking={() => setLoading(true)}
          onCanPlay={() => setLoading(false)}
          onPlaying={() => {
            setLoading(false)
            if (!started.current) {
              started.current = true
              setPlaying(true)
              report('start')
            }
            setPaused(false)
          }}
          onPause={() => {
            tick()
            setPaused(true)
            if (started.current) report('progress')
          }}
          onEnded={stop}
          onTimeUpdate={tick}
          onLoadedMetadata={() => {
            // A new subtitles track starts hidden: show it.
            for (const track of Array.from(video.current?.textTracks ?? [])) track.mode = 'showing'
          }}
          onSeeked={tick}
        >
          {cues && (
            <track
              key={cues}
              kind="subtitles"
              src={cues}
              default
              onLoad={(event) => {
                event.currentTarget.track.mode = 'showing'
              }}
            />
          )}
        </video>
        {(loading || skipped) && (
          <div className="media-loading" aria-live="polite">
            <div className="media-loading-spin">{loading && <Spinner />}</div>
            {skipped && (
              <p key={skipped.key} className="media-skip display">
                {skipped.by < 0 ? 'Rewinding' : 'Fast-forwarding'} {Math.abs(skipped.by)} seconds
              </p>
            )}
          </div>
        )}
        <div className="files-viewer-bar">
          <div className="files-viewer-line">
            <span className="files-viewer-name display">{playback?.title ?? 'Loading…'}</span>
            <span className="files-viewer-count">{playback?.subtitle}</span>
          </div>
          {/* The seek bar: the cursor starts here (A plays or pauses, left and right scrub). */}
          <button ref={self} className="files-viewer-line media-seek" tabIndex={-1} data-focusable="" data-select-sound="move" onClick={toggle}>
            {/* Scrubbing, the marker and its time go where it'll jump to. */}
            <span className={`files-viewer-time${scrub !== null ? ' media-scrub-time' : ''}`}>{clock(scrub ?? time.at)}</span>
            {/* Where it's at: the fill and a playhead; scrubbing, a gold marker where it'll jump to, and the stretch between. */}
            <span className={`files-progress media-progress${scrub !== null ? ' media-scrubbing' : ''}`}>
              <span className="files-progress-fill" style={{ width: `${length ? (time.at / length) * 100 : 0}%` }} />
              {scrub !== null && length > 0 && (
                <span
                  className="media-scrub-span"
                  style={{ left: `${(Math.min(scrub, time.at) / length) * 100}%`, width: `${(Math.abs(scrub - time.at) / length) * 100}%` }}
                />
              )}
              <span className="media-playhead" style={{ left: `${length ? (time.at / length) * 100 : 0}%` }} />
              {scrub !== null && length > 0 && <span className="media-scrub-head" style={{ left: `${(scrub / length) * 100}%` }} />}
            </span>
            <span className="files-viewer-time">{clock(length)}</span>
          </button>
          <div className="media-buttons" ref={buttonsRow}>
            <PlayerButton label="Stop" onClick={stop}>
              <rect x="6" y="6" width="12" height="12" rx="1.5" className="fill" />
            </PlayerButton>
            <div className="media-buttons-middle">
              <PlayerButton label={`Back ${SKIP_S} seconds`} onClick={() => skip(-SKIP_S)}>
                <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" />
                <text x="12" y="15.5" className="media-button-num">
                  {SKIP_S}
                </text>
              </PlayerButton>
              <PlayerButton label={paused ? 'Play' : 'Pause'} big buttonRef={playButton} onClick={toggle}>
                {paused ? <path d="M8 5.5v13l10.5-6.5z" className="fill" /> : <path d="M7.5 5.5h3v13h-3zM13.5 5.5h3v13h-3z" className="fill" />}
              </PlayerButton>
              <PlayerButton label={`On ${SKIP_S} seconds`} onClick={() => skip(SKIP_S)}>
                <path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v4h-4" />
                <text x="12" y="15.5" className="media-button-num">
                  {SKIP_S}
                </text>
              </PlayerButton>
            </div>
            {hasTracks && (
              <PlayerButton label="Audio & subtitles" onClick={tracks}>
                <rect x="3" y="5.5" width="18" height="13" rx="2" />
                <path d="M7 14.5h4M13 14.5h4M7 11h2M11 11h6" />
              </PlayerButton>
            )}
            <PlayerButton
              label="Controller shortcuts"
              pressed={keysShown}
              onClick={() => {
                showBar()
                setKeysShown((shown) => !shown)
              }}
            >
              <path d="M7 8.5h10a4 4 0 0 1 3.9 4.9l-.8 3.4a2.2 2.2 0 0 1-3.8 1L14.6 16H9.4l-1.7 1.8a2.2 2.2 0 0 1-3.8-1l-.8-3.4A4 4 0 0 1 7 8.5z" />
              <path d="M8 11.2v2.6M6.7 12.5h2.6" />
              <circle cx="15.6" cy="11.8" r=".5" className="fill" />
              <circle cx="17" cy="13.2" r=".5" className="fill" />
            </PlayerButton>
          </div>
        </div>
        {keysShown && (
          <div className="media-keys" role="dialog" aria-label="Controller shortcuts">
            <h3 className="settings-heading display">Shortcuts</h3>
            <span className="files-hint">
              <ButtonIcon button={controls.select} family={family} /> Play / pause
            </span>
            <span className="files-hint">
              <DpadIcon leftRight /> Scrub (on the seek bar)
            </span>
            <span className="files-hint">
              <DpadIcon /> Down to these buttons, up to the seek bar
            </span>
            <span className="files-hint">
              <ButtonIcon button={controls.sideBar} family={family} />
              <ButtonIcon button={controls.controlsGuide} family={family} /> {SKIP_S} seconds back / on
            </span>
            {hasTracks && (
              <span className="files-hint">
                <ButtonIcon button={controls.favorite} family={family} /> Audio &amp; subtitles
              </span>
            )}
            <span className="files-hint">
              <ButtonIcon button={controls.back} family={family} /> Stop
            </span>
          </div>
        )}
      </div>
      {menu && playback && <TrackMenu playback={playback} onPick={pick} />}
    </div>
  )
}

/** One of the player's buttons: an icon (SVG children, 24-unit box), its name shown while it has the cursor. */
function PlayerButton({
  label,
  big = false,
  pressed,
  buttonRef,
  onClick,
  children
}: {
  label: string
  big?: boolean
  pressed?: boolean
  buttonRef?: Ref<HTMLButtonElement>
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      ref={buttonRef}
      className={`media-button${big ? ' big' : ''}`}
      tabIndex={-1}
      data-focusable=""
      data-select-sound="move"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {children}
      </svg>
      <span className="media-button-label">{label}</span>
    </button>
  )
}

/** Audio & subtitles: a list of each, the ones playing ticked. A picks one. */
function TrackMenu({ playback, onPick }: { playback: MediaPlayback; onPick: (choice: MediaChoice) => void }) {
  const row = (key: string, name: string, checked: boolean, onClick: () => void) => (
    <button key={key} className="setting-row media-track" role="menuitemradio" aria-checked={checked} tabIndex={-1} data-focusable="" data-select-sound="move" onClick={onClick}>
      <span className="setting-name">{name}</span>
      {checked && <span className="media-track-check">✓</span>}
    </button>
  )
  return (
    <div className="media-tracks" role="menu">
      {playback.audioTracks.length > 0 && (
        <div className="media-tracks-column" data-nav-scope="">
          <h3 className="settings-heading display">Audio</h3>
          {playback.audioTracks.map((t) => row(`a${t.index}`, t.name, t.index === playback.audio, () => onPick({ audio: t.index })))}
        </div>
      )}
      <div className="media-tracks-column" data-nav-scope="">
        <h3 className="settings-heading display">Subtitles</h3>
        {row('s-off', 'Off', playback.subtitleIndex === -1, () => onPick({ subtitle: -1 }))}
        {playback.subtitleTracks.map((t) => row(`s${t.index}`, t.name, t.index === playback.subtitleIndex, () => onPick({ subtitle: t.index })))}
      </div>
    </div>
  )
}

/** "1:02:05", "4:09". */
function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}
