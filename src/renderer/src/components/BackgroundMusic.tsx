import { useEffect, useRef } from 'react'
import type { MusicKind } from '../../../shared/types'
import { introDone } from './Intro'

/** Settings fires this after changing a track or volume. */
export const MUSIC_CHANGED_EVENT = 'steamtv:music-changed'

const FADE_MS = 1200

/** Background sound: the music chosen in Settings, with the ambience under it. */
export function BackgroundMusic() {
  return (
    <>
      <Layer kind="music" />
      <Layer kind="ambience" />
    </>
  )
}

/**
 * One layer, playing quietly: its track looping, or (shuffled) a random track after each
 * ends. It fades out and pauses while a game or app is in front, and fades back in on return.
 */
function Layer({ kind }: { kind: MusicKind }) {
  const audio = useRef<HTMLAudioElement>(null)
  const target = useRef(0)

  useEffect(() => {
    const el = audio.current!
    let fade: ReturnType<typeof setInterval> | undefined
    let playlist: string[] = []

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

    // el.src reads back absolute; built-in tracks come as page-relative paths.
    const absolute = (url: string): string => new URL(url, document.baseURI).href
    /** A random track from the playlist, not the one just played if there's a choice. */
    const pick = (): string => {
      const others = playlist.length > 1 ? playlist.filter((url) => url !== el.src) : playlist
      return others[Math.floor(Math.random() * others.length)]
    }

    const load = (): void => {
      window.steamtv.getMusic().then((layers) => {
        const { urls, shuffle, volume } = layers[kind]
        target.current = volume
        playlist = urls.map(absolute)
        if (playlist.length === 0) {
          fadeTo(0, () => {
            el.pause()
            el.removeAttribute('src')
          })
          return
        }
        el.loop = !shuffle
        // Keep playing what's on if it's still in the list (a volume change, or Shuffle over the same track).
        if (!playlist.includes(el.src)) {
          el.src = shuffle ? pick() : playlist[0]
          el.volume = 0
        }
        start()
      })
    }

    // Shuffled: on to another track.
    const onEnded = (): void => {
      if (el.loop || playlist.length === 0) return
      el.src = pick()
      el.play().catch(() => {})
    }

    const onBlur = (): void => fadeTo(0, () => el.pause())
    load()
    el.addEventListener('ended', onEnded)
    window.addEventListener(MUSIC_CHANGED_EVENT, load)
    window.addEventListener('focus', start)
    window.addEventListener('blur', onBlur)
    return () => {
      clearInterval(fade)
      el.removeEventListener('ended', onEnded)
      window.removeEventListener(MUSIC_CHANGED_EVENT, load)
      window.removeEventListener('focus', start)
      window.removeEventListener('blur', onBlur)
    }
  }, [kind])

  return <audio ref={audio} preload="auto" />
}
