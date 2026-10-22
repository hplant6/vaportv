import { useEffect, useRef } from 'react'
import { introDone } from './Intro'

/** Settings fires this after changing the track or volume. */
export const MUSIC_CHANGED_EVENT = 'steamtv:music-changed'

const FADE_MS = 1200

/**
 * The background track chosen in Settings, looping quietly. It fades out and
 * pauses while a game or app is in front, and fades back in on return.
 */
export function BackgroundMusic() {
  const audio = useRef<HTMLAudioElement>(null)
  const target = useRef(0)

  useEffect(() => {
    const el = audio.current!
    let fade: ReturnType<typeof setInterval> | undefined

    const fadeTo = (volume: number, then?: () => void): void => {
      clearInterval(fade)
      const step = (volume - el.volume) / (FADE_MS / 50)
      fade = setInterval(() => {
        const next = el.volume + step
        if (Math.abs(volume - el.volume) <= Math.abs(step) || step === 0) {
          el.volume = Math.max(0, Math.min(1, volume))
          clearInterval(fade)
          then?.()
        } else {
          el.volume = Math.max(0, Math.min(1, next))
        }
      }, 50)
    }

    // Not over the intro video: it has its own sound.
    let introOver = false
    const start = (): void => {
      if (!introOver || !el.src || !document.hasFocus()) return
      el.play().then(() => fadeTo(target.current)).catch(() => {})
    }
    introDone.then(() => {
      introOver = true
      start()
    })

    const load = (): void => {
      window.steamtv.getMusic().then(({ url, volume }) => {
        target.current = volume
        if (!url) {
          fadeTo(0, () => {
            el.pause()
            el.removeAttribute('src')
          })
          return
        }
        // el.src reads back absolute; built-in tracks come as page-relative paths.
        const src = new URL(url, document.baseURI).href
        if (el.src !== src) {
          el.src = src
          el.volume = 0
        }
        start()
      })
    }

    const onBlur = (): void => fadeTo(0, () => el.pause())
    load()
    window.addEventListener(MUSIC_CHANGED_EVENT, load)
    window.addEventListener('focus', start)
    window.addEventListener('blur', onBlur)
    return () => {
      clearInterval(fade)
      window.removeEventListener(MUSIC_CHANGED_EVENT, load)
      window.removeEventListener('focus', start)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  return <audio ref={audio} loop preload="auto" />
}
