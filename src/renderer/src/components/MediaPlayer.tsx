import { useCallback, useEffect, useRef, useState } from 'react'
import type Hls from 'hls.js'
import { DEFAULT_CONTROLS, type Controls } from '../../../shared/controls'
import type { MediaChoice, MediaPlayback } from '../../../shared/types'
import { focus, OWN_DIRECTION_EVENT, PLAYER_SKIP_EVENT, PLAYER_TRACKS_EVENT, TRAP_CLOSE_EVENT, type Direction } from '../input/focus'
import { keepAwake } from '../input/idle'
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

  const showBar = useCallback(() => {
    setBarShown(true)
    clearTimeout(barTimer.current)
    barTimer.current = setTimeout(() => setBarShown(false), BAR_MS)
  }, [])
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
    setTimeout(() => self.current && focus(self.current))
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
      if (!menu) return stop()
      setMenu(false)
      setTimeout(() => self.current && focus(self.current))
    }
    window.addEventListener(TRAP_CLOSE_EVENT, onBack)
    return () => window.removeEventListener(TRAP_CLOSE_EVENT, onBack)
  }, [stop, menu])
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

  // D-pad left/right: scrub. Up and down just show the bar.
  useEffect(() => {
    const onDirection = (event: Event): void => {
      const direction = (event as CustomEvent<Direction>).detail
      showBar()
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
  }, [showBar, playback])

  // The triggers: back or on 10 seconds. Y: Audio & subtitles (again, closed).
  useEffect(() => {
    const onSkip = (event: Event): void => {
      showBar()
      const el = video.current
      if (!el) return
      const by = (event as CustomEvent<number>).detail
      const length = el.duration || playback?.durationSeconds || 0
      el.currentTime = Math.max(0, Math.min(Math.max(0, length - 1), el.currentTime + by))
      // Pressed again the same way soon after: one total ("Fast-forwarding 30 seconds").
      setSkipped((was) => ({ by: was && Math.sign(was.by) === Math.sign(by) ? was.by + by : by, key: (was?.key ?? 0) + 1 }))
      clearTimeout(skipTimer.current)
      skipTimer.current = setTimeout(() => setSkipped(null), 1400)
    }
    const onTracks = (): void => {
      if (!hasTracks) return toast('This has no other audio or subtitles')
      setMenu((open) => {
        if (open) setTimeout(() => self.current && focus(self.current))
        return !open
      })
    }
    window.addEventListener(PLAYER_SKIP_EVENT, onSkip)
    window.addEventListener(PLAYER_TRACKS_EVENT, onTracks)
    return () => {
      window.removeEventListener(PLAYER_SKIP_EVENT, onSkip)
      window.removeEventListener(PLAYER_TRACKS_EVENT, onTracks)
    }
  }, [showBar, playback, hasTracks])

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
    <div className="media-player" data-focus-trap="">
      <button
        ref={self}
        className={`files-viewer${barShown || paused ? ' bar-shown' : ''}`}
        tabIndex={-1}
        data-focusable=""
        {...(menu ? {} : { 'data-own-directions': '' })}
        data-select-sound="move"
        onClick={toggle}
      >
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
          <div className="files-viewer-line">
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
          </div>
          <div className="files-viewer-hints">
            <span className="files-hint">
              <ButtonIcon button={controls.select} family={family} /> {paused ? 'Play' : 'Pause'}
            </span>
            <span className="files-hint">
              <DpadIcon leftRight /> Scrub
            </span>
            <span className="files-hint">
              <ButtonIcon button={controls.sideBar} family={family} />
              <ButtonIcon button={controls.controlsGuide} family={family} /> {SKIP_S} s back / on
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
        </div>
      </button>
      {menu && playback && <TrackMenu playback={playback} onPick={pick} />}
    </div>
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
