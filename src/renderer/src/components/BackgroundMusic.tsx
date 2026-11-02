import { useEffect, useRef, useState } from 'react'
import type { MusicKind } from '../../../shared/types'
import { introDone } from './Intro'
import { MUSIC_HOLD_EVENT } from './MusicPreview'
import { toast } from './Toast'

/** Settings fires this after changing a track or volume. */
export const MUSIC_CHANGED_EVENT = 'steamtv:music-changed'

/** Now playing changed on a layer (detail: its kind). */
const NOW_PLAYING_EVENT = 'steamtv:now-playing'
/** Settings asks a layer to move on, or back (detail: { kind, step }). */
const SKIP_EVENT = 'steamtv:music-skip'

/** What a layer has loaded: the track's file (null: nothing), whether it's sounding, and whether there's another to move to. */
export interface NowPlaying {
  file: string | null
  playing: boolean
  canSkip: boolean
}

const nowPlaying: Record<MusicKind, NowPlaying> = {
  music: { file: null, playing: false, canSkip: false },
  ambience: { file: null, playing: false, canSkip: false }
}

const publish = (kind: MusicKind, next: Partial<NowPlaying>): void => {
  nowPlaying[kind] = { ...nowPlaying[kind], ...next }
  window.dispatchEvent(new CustomEvent(NOW_PLAYING_EVENT, { detail: kind }))
}

/** What's on a layer, kept up to date (Settings → Music → Now playing). */
export function useNowPlaying(kind: MusicKind): NowPlaying {
  const [state, setState] = useState(nowPlaying[kind])
  useEffect(() => {
    const onChange = (event: Event): void => {
      if ((event as CustomEvent<MusicKind>).detail === kind) setState(nowPlaying[kind])
    }
    setState(nowPlaying[kind])
    window.addEventListener(NOW_PLAYING_EVENT, onChange)
    return () => window.removeEventListener(NOW_PLAYING_EVENT, onChange)
  }, [kind])
  return state
}

/**
 * Move a layer on to its next track (1) or back to the one before (-1). `announce`: say which, in a toast (the
 * controller's Next song, pressed with nothing on screen to show it).
 */
export function skipTrack(kind: MusicKind, step: 1 | -1, announce = false): void {
  if (announce && !nowPlaying[kind].canSkip) {
    toast(nowPlaying[kind].file ? 'Only one song to play' : 'No music playing')
    return
  }
  window.dispatchEvent(new CustomEvent(SKIP_EVENT, { detail: { kind, step, announce } }))
}

const FADE_MS = 1200
/** Skipping: the old track fades out this quickly before the next starts. */
const SKIP_FADE_MS = 250
/** Held (a preview, Files playing, voice search listening): out quickly, so it's quiet at once. */
const HOLD_FADE_MS = 300

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
 * One layer, playing quietly: its track looping, a playlist's tracks in turn, or (shuffled)
 * a random track after each ends. It fades out and pauses while a game or app is in front, and fades back in on return.
 */
function Layer({ kind }: { kind: MusicKind }) {
  const audio = useRef<HTMLAudioElement>(null)
  const target = useRef(0)

  useEffect(() => {
    const el = audio.current!
    let fade: ReturnType<typeof setInterval> | undefined
    let playlist: string[] = []
    let files: string[] = []
    let names: string[] = []
    let random = false
    /** Tracks played before this one, newest last, so Previous can go back in a shuffle too. */
    let history: string[] = []

    const show = (): void =>
      publish(kind, {
        file: el.src ? (files[playlist.indexOf(el.src)] ?? null) : null,
        canSkip: playlist.length > 1
      })
    const onPlay = (): void => publish(kind, { playing: true })
    const onPause = (): void => publish(kind, { playing: false })

    const fadeTo = (volume: number, then?: () => void, ms = FADE_MS): void => {
      clearInterval(fade)
      const step = (volume - el.volume) / (ms / 50)
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

    // Not over the intro video: it has its own sound. Nor over a song being previewed in Settings.
    let introOver = false
    let held = false
    const start = (): void => {
      if (!introOver || held || !el.src || !document.hasFocus()) return
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
        files = layers[kind].files
        names = layers[kind].names
        if (playlist.length === 0) {
          history = []
          fadeTo(0, () => {
            el.pause()
            el.removeAttribute('src')
            show()
          })
          return
        }
        // One track loops; several move on as each ends.
        el.loop = !shuffle && playlist.length === 1
        random = shuffle
        // Keep playing what's on if it's still in the list (a volume change, or Shuffle over the same track).
        if (!playlist.includes(el.src)) {
          history = []
          el.src = shuffle ? pick() : playlist[0]
          el.volume = 0
        }
        show()
        start()
      })
    }

    /** The track after this one: a random one when shuffled, else the next, round to the first again. */
    const following = (): string => (random ? pick() : playlist[(playlist.indexOf(el.src) + 1) % playlist.length])

    const onEnded = (): void => {
      if (el.loop || playlist.length === 0) return
      history.push(el.src)
      el.src = following()
      show()
      el.play().catch(() => {})
    }

    // Skipped from Settings: back goes to the last one played (else the one before in the list).
    const onSkip = (event: Event): void => {
      const { kind: which, step, announce } = (event as CustomEvent<{ kind: MusicKind; step: 1 | -1; announce: boolean }>).detail
      if (which !== kind || playlist.length < 2) return
      let next: string
      if (step === 1) {
        history.push(el.src)
        next = following()
      } else {
        const back = history.pop()
        next = back && playlist.includes(back) ? back : playlist[(playlist.indexOf(el.src) - 1 + playlist.length) % playlist.length]
      }
      history = history.slice(-50)
      const swap = (): void => {
        el.src = next
        el.volume = 0
        show()
        start()
        if (announce) toast(`♪ ${names[playlist.indexOf(next)] ?? 'Next song'}`)
      }
      // Fade out what's sounding first; a paused layer just changes track.
      if (el.paused) swap()
      else fadeTo(0, swap, SKIP_FADE_MS)
    }

    const onBlur = (): void => fadeTo(0, () => el.pause())
    const onHold = (event: Event): void => {
      held = (event as CustomEvent<boolean>).detail
      if (held) fadeTo(0, () => el.pause(), HOLD_FADE_MS)
      else start()
    }
    load()
    el.addEventListener('ended', onEnded)
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    window.addEventListener(SKIP_EVENT, onSkip)
    window.addEventListener(MUSIC_CHANGED_EVENT, load)
    window.addEventListener('focus', start)
    window.addEventListener('blur', onBlur)
    window.addEventListener(MUSIC_HOLD_EVENT, onHold)
    return () => {
      window.removeEventListener(MUSIC_HOLD_EVENT, onHold)
      clearInterval(fade)
      el.removeEventListener('ended', onEnded)
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
      window.removeEventListener(SKIP_EVENT, onSkip)
      window.removeEventListener(MUSIC_CHANGED_EVENT, load)
      window.removeEventListener('focus', start)
      window.removeEventListener('blur', onBlur)
    }
  }, [kind])

  return <audio ref={audio} preload="auto" />
}
