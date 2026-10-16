import { useEffect, useRef, useState } from 'react'
import type { ScreensaverPhoto, ScreensaverStyle } from '../../../shared/types'
import { idleMs, onScreensaver, screensaverUp, setScreensaverUp } from '../input/idle'
import { useNow } from './useNow'

/** Settings fires this after changing the delay, or to preview the screensaver (detail: 'preview'). */
export const SCREENSAVER_EVENT = 'steamtv:screensaver'

const CHECK_MS = 5000
const SLIDE_MS = 12000
const FADE_MS = 2000
/** Taller than this (height / width) is shown whole over a blurred copy, not cropped to fill. */
const PORTRAIT = 1.05
/** Ken Burns: each photo drifts towards one of these corners while it zooms. */
const ORIGINS = ['20% 20%', '80% 20%', '20% 80%', '80% 80%', '50% 50%']

interface Slide {
  id: number
  photo: ScreensaverPhoto
  whole: boolean
  origin: string
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Loads a photo fully before it's shown, so it never draws in halfway through a fade. */
async function prepare(photo: ScreensaverPhoto, id: number): Promise<Slide | null> {
  const img = new Image()
  img.src = photo.url
  try {
    await img.decode()
  } catch {
    return null
  }
  // Your photos in portrait are shown whole; game art and screenshots always fill the screen.
  const whole = photo.kind === 'photo' && img.naturalHeight / img.naturalWidth > PORTRAIT
  return { id, photo, whole, origin: ORIGINS[Math.floor(Math.random() * ORIGINS.length)] }
}

/** Starts after the delay set in Settings with no input while vaporTV is in front; any input ends it. */
export function Screensaver() {
  const [up, setUp] = useState(screensaverUp())
  const [photos, setPhotos] = useState<ScreensaverPhoto[]>([])
  const [style, setStyle] = useState<ScreensaverStyle>('slideshow')
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
      if (delay.current > 0 && inFront && !screensaverUp() && idleMs() > delay.current * 60_000) start()
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
        <DriftingClock />
      </div>
    )
  }
  // No pictures to show (or the clock style): the clock and weather on black.
  return <div className="screensaver">{style === 'slideshow' && photos.length ? <Slideshow photos={photos} /> : <DriftingClock />}</div>
}

function Slideshow({ photos }: { photos: ScreensaverPhoto[] }) {
  // The newest slide fades in over the one before it.
  const [slides, setSlides] = useState<Slide[]>([])

  useEffect(() => {
    let cancelled = false
    let next = 0
    let timer: ReturnType<typeof setTimeout>
    const show = async (): Promise<void> => {
      // Skip photos that fail to load, but give up after a full pass.
      for (let tries = 0; tries < photos.length; tries++) {
        const slide = await prepare(photos[next % photos.length], next)
        next++
        if (cancelled) return
        if (slide) {
          setSlides((current) => [...current.slice(-1), slide])
          break
        }
      }
      if (photos.length > 1) timer = setTimeout(show, SLIDE_MS)
    }
    show()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [photos])

  return (
    <>
      {slides.map((slide) => (
        <div
          key={slide.id}
          className="screensaver-slide"
          style={{ animationDuration: `${FADE_MS}ms, ${SLIDE_MS + FADE_MS * 2}ms`, transformOrigin: slide.origin }}
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
      <Caption photo={slides.at(-1)?.photo} key={slides.at(-1)?.id} />
      <ScreensaverClock className="screensaver-clock" />
    </>
  )
}

const randomSpot = (): React.CSSProperties => ({ left: `${10 + Math.random() * 55}%`, top: `${10 + Math.random() * 60}%` })

/** The game a picture comes from: its logo where there is one, else its name. */
function Caption({ photo }: { photo?: ScreensaverPhoto }) {
  if (!photo?.logo && !photo?.caption) return null
  return (
    <div className="screensaver-caption">
      {photo.logo ? <img src={photo.logo} alt={photo.caption ?? ''} /> : <span className="display">{photo.caption}</span>}
    </div>
  )
}

/** The time, date and temperature, moving every minute so it can't burn into the screen. */
const WEATHER_REFRESH_MS = 15 * 60 * 1000

function DriftingClock() {
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
  return <ScreensaverClock className="screensaver-clock drifting" style={position.current} temperature={temperature} />
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
