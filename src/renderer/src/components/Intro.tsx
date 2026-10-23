import { useCallback, useEffect, useRef, useState } from 'react'
import { focus, focusDefault, TRAP_CLOSE_EVENT } from '../input/focus'

// The intro video as vaporTV opens (Settings → General → Intro). It covers the page while
// the library loads, any button skips it, and it fades out into Home. Background music
// and the welcome tour wait for it (introDone).

/** Settings → General → Intro: Play now. */
export const PLAY_INTRO_EVENT = 'steamtv:play-intro'

const FADE_MS = 600

let finish: () => void = () => {}
/** Resolves once the opening intro has played (or straight away, with none). */
export const introDone = new Promise<void>((resolve) => (finish = resolve))

export function Intro() {
  const [url, setUrl] = useState<string | null>(null)
  // Black from the first frame until main says whether there's an intro, so Home never
  // shows for a moment before the video starts.
  const [deciding, setDeciding] = useState(true)

  useEffect(() => {
    window.steamtv.intro
      .opening()
      .then((opening) => {
        if (opening) setUrl(opening)
        else finish()
      })
      .catch(() => finish())
      .finally(() => setDeciding(false))
    const playNow = (): void => {
      window.steamtv.intro.get().then((intro) => intro.url && setUrl(intro.url))
    }
    window.addEventListener(PLAY_INTRO_EVENT, playNow)
    return () => window.removeEventListener(PLAY_INTRO_EVENT, playNow)
  }, [])

  const done = useCallback(() => {
    setUrl(null)
    finish()
  }, [])

  if (url) return <Player url={url} onDone={done} />
  return deciding ? <div className="intro" aria-hidden="true" /> : null
}

function Player({ url, onDone }: { url: string; onDone: () => void }) {
  const skip = useRef<HTMLButtonElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const [leaving, setLeaving] = useState(false)
  // The cursor goes back where it was when a preview (Play now) ends; at startup, to Home's first card.
  const before = useRef<Element | null>(document.activeElement)

  const end = useCallback(() => {
    if (leaving) return
    setLeaving(true)
    setTimeout(() => {
      onDone()
      const was = before.current
      if (was instanceof HTMLElement && was.isConnected && was.hasAttribute('data-focusable')) focus(was)
      else focusDefault()
    }, FADE_MS)
  }, [leaving, onDone])

  // A (or OK) presses the hidden Skip button; B closes the trap, as any dialog's. Home
  // loading underneath moves the cursor to its first card: it comes straight back, so
  // a press never reaches a card hidden behind the video.
  useEffect(() => {
    if (skip.current) focus(skip.current)
    const keep = (event: FocusEvent): void => {
      if (skip.current && event.target !== skip.current) skip.current.focus({ preventScroll: true })
    }
    window.addEventListener(TRAP_CLOSE_EVENT, end)
    document.addEventListener('focusin', keep)
    return () => {
      window.removeEventListener(TRAP_CLOSE_EVENT, end)
      document.removeEventListener('focusin', keep)
    }
  }, [end])

  // Fading out takes the sound down with it.
  useEffect(() => {
    if (!leaving || !video.current) return
    const el = video.current
    const step = el.volume / (FADE_MS / 50)
    const timer = setInterval(() => (el.volume = Math.max(0, el.volume - step)), 50)
    return () => clearInterval(timer)
  }, [leaving])

  return (
    <div className={`intro${leaving ? ' leaving' : ''}`} data-focus-trap="">
      <video ref={video} src={url} autoPlay playsInline onEnded={end} onError={end} />
      <button ref={skip} className="intro-skip" tabIndex={-1} data-focusable="" data-select-sound="move" aria-label="Skip intro" onClick={end} />
    </div>
  )
}
