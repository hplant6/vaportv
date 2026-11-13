import { useCallback, useEffect, useRef, useState } from 'react'
import type Hls from 'hls.js'
import { DEFAULT_CONTROLS, type Controls } from '../../../shared/controls'
import type { EmbyPlayback } from '../../../shared/types'
import { focus, OWN_DIRECTION_EVENT, TRAP_CLOSE_EVENT, type Direction } from '../input/focus'
import { keepAwake } from '../input/idle'
import { ButtonIcon, DpadIcon, useControllerFamily } from './ButtonIcon'
import { EMBY_PLAY_EVENT, EMBY_WATCHED_EVENT } from './ContinueWatching'
import { MUSIC_HOLD_EVENT } from './MusicPreview'
import { toast } from './Toast'

// Plays a film or episode from Emby full screen, from where it was left: straight from the
// file when Chromium can, or as HLS that Emby converts (hls.js). A pauses, left and right skip
// back 10 seconds and on 30, B stops. Emby hears where it's got to as it plays, and where it
// stopped, so Continue watching (and Emby's own apps) pick up there.

const BACK_S = 10
const ON_S = 30
const BAR_MS = 3500
const REPORT_MS = 10_000

/** Mounted once (App): opens when a Continue watching card asks. */
export function EmbyPlayerHost() {
  const [itemId, setItemId] = useState<string | null>(null)
  useEffect(() => {
    const open = (event: Event): void => setItemId((event as CustomEvent<string>).detail)
    window.addEventListener(EMBY_PLAY_EVENT, open)
    return () => window.removeEventListener(EMBY_PLAY_EVENT, open)
  }, [])
  if (!itemId) return null
  return (
    <EmbyPlayer
      key={itemId}
      itemId={itemId}
      onClose={() => {
        setItemId(null)
        window.dispatchEvent(new Event(EMBY_WATCHED_EVENT))
      }}
    />
  )
}

function EmbyPlayer({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const self = useRef<HTMLButtonElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const [playback, setPlayback] = useState<EmbyPlayback | null>(null)
  const [paused, setPaused] = useState(false)
  const [time, setTime] = useState({ at: 0, length: 0 })
  const [barShown, setBarShown] = useState(true)
  const barTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [controls, setControls] = useState<Controls>(DEFAULT_CONTROLS)
  const family = useControllerFamily()
  const started = useRef(false)
  const [playing, setPlaying] = useState(false)

  const showBar = useCallback(() => {
    setBarShown(true)
    clearTimeout(barTimer.current)
    barTimer.current = setTimeout(() => setBarShown(false), BAR_MS)
  }, [])
  useEffect(() => () => clearTimeout(barTimer.current), [])

  // Asks Emby how to play it, then plays: hls.js for a converted stream, the file itself otherwise.
  useEffect(() => {
    window.steamtv.getSettings().then((s) => setControls(s.controls))
    if (self.current) focus(self.current)
    showBar()
    let hls: Hls | null = null
    let cancelled = false
    window.steamtv.emby
      .playback(itemId)
      .then(async (info) => {
        if (cancelled || !video.current) return
        setPlayback(info)
        const el = video.current
        const begin = (): void => {
          if (info.startSeconds > 5) el.currentTime = info.startSeconds
          el.play().catch(() => undefined)
        }
        if (info.hls) {
          const { default: HlsPlayer } = await import('hls.js')
          if (cancelled) return
          // No worker: the page's content policy doesn't allow blob: workers, and one stream doesn't need it.
          hls = new HlsPlayer({ enableWorker: false, startPosition: info.startSeconds > 5 ? info.startSeconds : -1 })
          hls.on(HlsPlayer.Events.ERROR, (_event, data) => {
            if (!data.fatal) return
            console.error('steamtv: emby stream failed:', data.type, data.details)
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
        console.error('steamtv: emby playback:', err)
        toast(`Couldn’t play that: ${err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : err}`)
        onClose()
      })
    return () => {
      cancelled = true
      hls?.destroy()
    }
  }, [itemId])

  // Where it's got to, for Emby: as it starts, every few seconds, on pausing, and as it stops.
  const position = (): number => video.current?.currentTime ?? 0
  const report = useCallback(
    (event: 'start' | 'progress' | 'stop'): void => {
      if (!playback) return
      void window.steamtv.emby.report(event, playback, position(), video.current?.paused ?? false)
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

  // B stops; the music waits and the screensaver stays off while it's open.
  useEffect(() => {
    window.addEventListener(TRAP_CLOSE_EVENT, stop)
    return () => window.removeEventListener(TRAP_CLOSE_EVENT, stop)
  }, [stop])
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

  useEffect(() => {
    const onDirection = (event: Event): void => {
      const direction = (event as CustomEvent<Direction>).detail
      showBar()
      const el = video.current
      if (!el || (direction !== 'left' && direction !== 'right')) return
      const length = el.duration || playback?.durationSeconds || 0
      el.currentTime = Math.max(0, Math.min(length - 1, el.currentTime + (direction === 'right' ? ON_S : -BACK_S)))
    }
    window.addEventListener(OWN_DIRECTION_EVENT, onDirection)
    return () => window.removeEventListener(OWN_DIRECTION_EVENT, onDirection)
  }, [showBar, playback])

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
    <div className="emby-player" data-focus-trap="">
      <button
        ref={self}
        className={`files-viewer${barShown || paused ? ' bar-shown' : ''}`}
        tabIndex={-1}
        data-focusable=""
        data-own-directions=""
        data-select-sound="move"
        onClick={toggle}
      >
        {/* Its picture while it loads. */}
        {!playing && playback?.backdrop && <img className="files-viewer-media emby-player-poster" src={playback.backdrop} alt="" />}
        <video
          ref={video}
          className="files-viewer-media"
          playsInline
          onPlaying={() => {
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
          onSeeked={tick}
        />
        <div className="files-viewer-bar">
          <div className="files-viewer-line">
            <span className="files-viewer-name display">{playback?.title ?? 'Loading…'}</span>
            <span className="files-viewer-count">{playback?.subtitle}</span>
          </div>
          <div className="files-viewer-line">
            <span className="files-viewer-time">{clock(time.at)}</span>
            <span className="files-progress">
              <span className="files-progress-fill" style={{ width: `${length ? (time.at / length) * 100 : 0}%` }} />
            </span>
            <span className="files-viewer-time">{clock(length)}</span>
          </div>
          <div className="files-viewer-hints">
            <span className="files-hint">
              <ButtonIcon button={controls.select} family={family} /> {paused ? 'Play' : 'Pause'}
            </span>
            <span className="files-hint">
              <DpadIcon /> Back {BACK_S} s / on {ON_S} s
            </span>
            <span className="files-hint">
              <ButtonIcon button={controls.back} family={family} /> Stop
            </span>
          </div>
        </div>
      </button>
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
