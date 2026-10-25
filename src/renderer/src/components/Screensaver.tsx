import { useEffect, useRef, useState } from 'react'
import type { ScreensaverPhoto, ScreensaverClockSpot, ScreensaverStyle } from '../../../shared/types'
import { idleMs, keptAwake, onScreensaver, onScreensaverStep, screensaverUp, setScreensaverUp } from '../input/idle'
import { useNow } from './useNow'
import { AberrationLogo } from './AberrationLogo'

/** Settings fires this after changing the delay, or to preview the screensaver (detail: 'preview'). */
export const SCREENSAVER_EVENT = 'steamtv:screensaver'

const CHECK_MS = 5000
const SLIDE_MS = 12000
const FADE_MS = 2000
/** A quicker fade when the D-pad steps to another picture. */
const STEP_FADE_MS = 500
/** Taller than this (height / width) is shown whole over a blurred copy, not cropped to fill. */
const PORTRAIT = 1.05
/** Ken Burns: each photo drifts towards one of these corners while it zooms. */
const ORIGINS = ['20% 20%', '80% 20%', '20% 80%', '80% 80%', '50% 50%']

interface Slide {
  id: number
  photo: ScreensaverPhoto
  whole: boolean
  origin: string
  fadeMs: number
}

let slideIds = 0
/** Dates read from photos' EXIF (by URL), so each file is read once. */
const takenCache = new Map<string, Promise<string | null>>()

function taken(photo: ScreensaverPhoto): Promise<string | null> {
  if (photo.taken) return Promise.resolve(photo.taken)
  let date = takenCache.get(photo.url)
  if (!date) {
    date = window.steamtv.photoTaken(photo.url).catch(() => null)
    takenCache.set(photo.url, date)
  }
  return date
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Loads a photo fully before it's shown, so it never draws in halfway through a fade;
 * with `details`, finds when your photo was taken too.
 */
async function prepare(photo: ScreensaverPhoto, fadeMs: number, details: boolean): Promise<Slide | null> {
  const img = new Image()
  img.src = photo.url
  const date = details && photo.kind === 'photo' ? taken(photo) : Promise.resolve(null)
  try {
    await img.decode()
  } catch {
    return null
  }
  // Your photos in portrait are shown whole; game art and screenshots always fill the screen.
  const whole = photo.kind === 'photo' && img.naturalHeight / img.naturalWidth > PORTRAIT
  const shown = { ...photo, taken: (await date) ?? undefined }
  return { id: slideIds++, photo: shown, whole, origin: ORIGINS[Math.floor(Math.random() * ORIGINS.length)], fadeMs }
}

/** Starts after the delay set in Settings with no input while vaporTV is in front; any input ends it. */
export function Screensaver() {
  const [up, setUp] = useState(screensaverUp())
  const [photos, setPhotos] = useState<ScreensaverPhoto[]>([])
  const [style, setStyle] = useState<ScreensaverStyle>('slideshow')
  const [clockSpot, setClockSpot] = useState<ScreensaverClockSpot>('moving')
  const [details, setDetails] = useState(true)
  const delay = useRef(0)

  useEffect(() => onScreensaver(setUp), [])

  useEffect(() => {
    const loadDelay = (): void => {
      window.steamtv.getScreensaver().then((data) => (delay.current = data.delayMinutes))
    }
    // Fresh photos each time, so new ones show up without a restart.
    const start = (): void => {
      window.steamtv.getScreensaver().then((data) => {
        setPhotos(shuffle(data.photos))
        setStyle(data.style)
        setClockSpot(data.clockSpot)
        setDetails(data.photoDetails)
        setScreensaverUp(true)
      })
    }
    const onEvent = (event: Event): void => {
      if ((event as CustomEvent).detail === 'preview') start()
      else loadDelay()
    }
    loadDelay()
    const timer = setInterval(() => {
      // Only over vaporTV itself: never on top of a game or app.
      const inFront = document.visibilityState === 'visible' && document.hasFocus()
      if (delay.current > 0 && inFront && !screensaverUp() && !keptAwake() && idleMs() > delay.current * 60_000) start()
    }, CHECK_MS)
    window.addEventListener(SCREENSAVER_EVENT, onEvent)
    return () => {
      clearInterval(timer)
      window.removeEventListener(SCREENSAVER_EVENT, onEvent)
    }
  }, [])

  // Living backdrop: the stage hides everything but the backdrop while it's up.
  const backdrop = up && style === 'backdrop'
  useEffect(() => {
    const stage = document.querySelector('.stage')
    stage?.classList.toggle('saver-backdrop', backdrop)
    return () => stage?.classList.remove('saver-backdrop')
  }, [backdrop])

  if (!up) return null
  if (style === 'backdrop') {
    return (
      <div className="screensaver over-backdrop">
        <DriftingClock spot={clockSpot} />
        <ScreensaverLogo />
      </div>
    )
  }
  // No pictures to show (or the clock style): the clock and weather on black.
  return (
    <div className="screensaver">
      {style === 'slideshow' && photos.length ? <Slideshow photos={photos} details={details} /> : <DriftingClock spot={clockSpot} />}
      <ScreensaverLogo />
    </div>
  )
}

/** The pictures in turn, each fading in over the last; the D-pad steps back (left, up) or on (right, down). */
function Slideshow({ photos, details }: { photos: ScreensaverPhoto[]; details: boolean }) {
  // The newest slide fades in over the one before it.
  const [slides, setSlides] = useState<Slide[]>([])

  useEffect(() => {
    let cancelled = false
    /** Where in `photos` the picture on screen is. */
    let position = -1
    /** Bumped by each step, so a slower load that's been overtaken is dropped. */
    let request = 0
    let timer: ReturnType<typeof setTimeout>
    const show = async (step: 1 | -1, fadeMs: number): Promise<void> => {
      clearTimeout(timer)
      const mine = ++request
      // Skip photos that fail to load, but give up after a full pass.
      for (let tries = 1; tries <= photos.length; tries++) {
        const at = (((position + step * tries) % photos.length) + photos.length) % photos.length
        const slide = await prepare(photos[at], fadeMs, details)
        if (cancelled || mine !== request) return
        if (slide) {
          position = at
          setSlides((current) => [...current.slice(-1), slide])
          break
        }
      }
      if (photos.length > 1) timer = setTimeout(() => show(1, FADE_MS), SLIDE_MS)
    }
    show(1, FADE_MS)
    const unstep = onScreensaverStep((direction) => show(direction === 'left' || direction === 'up' ? -1 : 1, STEP_FADE_MS))
    return () => {
      cancelled = true
      clearTimeout(timer)
      unstep()
    }
  }, [photos, details])

  const current = slides.at(-1)
  return (
    <>
      {slides.map((slide) => (
        <div
          key={slide.id}
          className="screensaver-slide"
          style={{ animationDuration: `${slide.fadeMs}ms, ${SLIDE_MS + FADE_MS * 2}ms`, transformOrigin: slide.origin }}
        >
          {slide.whole ? (
            <>
              <img className="screensaver-blur" src={slide.photo.url} alt="" />
              <img className="screensaver-whole" src={slide.photo.url} alt="" />
            </>
          ) : (
            <img className="screensaver-fill" src={slide.photo.url} alt="" />
          )}
        </div>
      ))}
      {current && <Caption photo={current.photo} details={details} fadeMs={current.fadeMs} key={current.id} />}
      <ScreensaverClock className="screensaver-clock" />
    </>
  )
}

// On the right half it stays below the logo in the top-right corner.
const randomSpot = (): React.CSSProperties => {
  const left = 10 + Math.random() * 55
  const top = left > 40 ? 20 + Math.random() * 50 : 10 + Math.random() * 60
  return { left: `${left}%`, top: `${top}%` }
}

/** How far the logo may wander from its corner, in px: too little to see, enough not to burn in. */
const LOGO_SHIFT = 8

/** vaporTV's logo (the chromatic-aberration one) in the top-right corner, nudged every minute so it never sits still on the panel. */
function ScreensaverLogo() {
  const now = useNow()
  const shift = useRef({ x: 0, y: 0 })
  const minute = useRef(now.getMinutes())
  if (minute.current !== now.getMinutes()) {
    minute.current = now.getMinutes()
    const step = (): number => Math.round((Math.random() * 2 - 1) * LOGO_SHIFT)
    shift.current = { x: step(), y: step() }
  }
  return (
    <div className="screensaver-logo" style={{ transform: `translate(${shift.current.x}px, ${shift.current.y}px)` }}>
      <AberrationLogo />
    </div>
  )
}

/** The game a picture comes from: its logo where there is one, else its name. */
/** When your photo was taken, e.g. "April 25, 2025". */
function photoDate(taken: string): string {
  const date = new Date(taken)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
}

/** The game a picture comes from (its logo or name), or, with `details`, your photo's date and album. */
function Caption({ photo, details, fadeMs }: { photo: ScreensaverPhoto; details: boolean; fadeMs: number }) {
  const style = { animationDuration: `${fadeMs}ms` }
  if (photo.kind === 'photo') {
    const date = details && photo.taken ? photoDate(photo.taken) : ''
    const album = details ? photo.album : undefined
    if (!date && !album) return null
    return (
      <div className="screensaver-caption photo-details" style={style}>
        {date && <span className="display">{date}</span>}
        {album && <small>{album}</small>}
      </div>
    )
  }
  if (!photo.logo && !photo.caption) return null
  return (
    <div className="screensaver-caption" style={style}>
      {photo.logo ? <img src={photo.logo} alt={photo.caption ?? ''} /> : <span className="display">{photo.caption}</span>}
    </div>
  )
}

/** The time, date and temperature, moving every minute so it can't burn into the screen. */
const WEATHER_REFRESH_MS = 15 * 60 * 1000

/** Held-still spots for the big clock; the centre one is centred on itself. */
const CLOCK_SPOTS: Record<Exclude<ScreensaverClockSpot, 'moving'>, React.CSSProperties> = {
  topLeft: { left: '64px', top: '56px' },
  center: { left: '50%', top: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }
}

/** The big clock: in a new random spot every minute (so it can't burn in), or held where Settings says. */
function DriftingClock({ spot }: { spot: ScreensaverClockSpot }) {
  const now = useNow()
  const [temperature, setTemperature] = useState<number | null>(null)
  useEffect(() => {
    const load = (): void => {
      window.steamtv.getWeather().then((w) => setTemperature(w ? Math.round(w.temperature) : null))
    }
    load()
    const timer = setInterval(load, WEATHER_REFRESH_MS)
    return () => clearInterval(timer)
  }, [])
  const position = useRef(randomSpot())
  const minute = useRef(now.getMinutes())
  if (minute.current !== now.getMinutes()) {
    minute.current = now.getMinutes()
    position.current = randomSpot()
  }
  const style = spot === 'moving' ? position.current : CLOCK_SPOTS[spot]
  return <ScreensaverClock className="screensaver-clock drifting" style={style} temperature={temperature} />
}

function ScreensaverClock({
  className,
  style,
  temperature = null
}: {
  className: string
  style?: React.CSSProperties
  temperature?: number | null
}) {
  const now = useNow()
  const hours = now.getHours()
  return (
    <div className={`${className} display`} style={style}>
      <div className="screensaver-time">
        {hours % 12 || 12}:{String(now.getMinutes()).padStart(2, '0')}
        <span className="meridiem">{hours < 12 ? 'am' : 'pm'}</span>
      </div>
      <div className="screensaver-date">
        {now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        {temperature !== null && ` · ${temperature}°`}
      </div>
    </div>
  )
}
