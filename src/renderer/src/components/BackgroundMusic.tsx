import { useEffect, useRef, useState } from 'react'
import type { MusicKind } from '../../../shared/types'
import { introDone } from './Intro'
import { MUSIC_HOLD_EVENT } from './MusicPreview'
import { SOUND_OFF_EVENT } from '../input/focus'
import { toast } from './Toast'
import { isFront, onFrontChange } from '../front'
import { registerDiagnostics } from '../diagnostics'

/** Settings fires this after changing a track or volume. */
export const MUSIC_CHANGED_EVENT = 'steamtv:music-changed'

/** Now playing changed on a layer (detail: its kind). */
export const NOW_PLAYING_EVENT = 'steamtv:now-playing'

/** Background music's songs and where it is in them (Turn it up takes over from there; the bar's second row shows the time); null with nothing loaded. */
let musicLayer: (() => { files: string[]; at: number; time: number; duration: number; playing: boolean } | null) | null = null
export function backgroundNow(): { files: string[]; at: number; time: number; duration: number; playing: boolean } | null {
  return musicLayer?.() ?? null
}
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
/** How often a layer that should be sounding is checked, and started again if it isn't (a missed return to the front, the box waking). */
const WATCH_MS = 3000

/**
 * Both sticks clicked in turn vaporTV's sound off: the music and ambience fade out, and
 * whatever else is playing (a song or video in Files, a preview) stops. Again, and the
 * music and ambience come back. Until then, nothing starts them (coming back from a game).
 */
let soundOff = false

function toggleSoundOff(): void {
  soundOff = !soundOff
  if (soundOff) {
    // Everything with its own sound; a backdrop's video is muted, and stays playing.
    for (const media of document.querySelectorAll<HTMLMediaElement>('audio, video')) if (!media.muted) media.pause()
  }
  toast(soundOff ? 'Sound off. Click both sticks again to turn it back on' : 'Sound on')
  window.dispatchEvent(new Event(SOUND_TOGGLED_EVENT))
}
const SOUND_TOGGLED_EVENT = 'steamtv:sound-toggled'

/** Background sound: the music chosen in Settings, with the ambience under it. */
export function BackgroundMusic() {
  useEffect(() => {
    window.addEventListener(SOUND_OFF_EVENT, toggleSoundOff)
    return () => window.removeEventListener(SOUND_OFF_EVENT, toggleSoundOff)
  }, [])
  return (
    <>
      <Layer kind="music" />
      <Layer kind="ambience" />
    </>
  )
}

/**
 * One layer, playing quietly: its track looping, a playlist's tracks in turn, or (shuffled)
 * a random track after each ends. It fades out and pauses while a game or app is in front, and fades back in on return (front.ts).
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
    /** Each track's loudness gain (null: not measured yet); the layer's volume. */
    let gains: (number | null)[] = []
    let base = 0
    let random = false
    /** Tracks played before this one, newest last, so Previous can go back in a shuffle too. */
    let history: string[] = []

    /**
     * The volume for the track that's on: the layer's, times its loudness gain, so a loud
     * master sits as quietly as the included music. Not known yet: asked for (measured once),
     * and faded to when it comes.
     */
    const level = (): void => {
      const at = playlist.indexOf(el.src)
      const gain = gains[at]
      target.current = Math.min(1, base * (gain ?? 1))
      if (gain === null && files[at]) {
        gains[at] = 1
        void window.steamtv.music.loudness(files[at]).then((g) => {
          if (g === null) return
          gains[at] = g
          if (playlist.indexOf(el.src) !== at) return
          target.current = Math.min(1, base * g)
          if (!el.paused) fadeTo(target.current)
        })
      }
    }

    const show = (): void => {
      level()
      publish(kind, {
        file: el.src ? (files[playlist.indexOf(el.src)] ?? null) : null,
        canSkip: playlist.length > 1
      })
    }
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
    /** The track that last wouldn't play (logged once). */
    let failed = ''
    const start = (): void => {
      if (!introOver || held || soundOff || !el.src || !isFront()) return
      el.play()
        .then(() => fadeTo(target.current))
        .catch((err: unknown) => {
          // Paused again before it began (an app opening) isn't a failure.
          if ((err as Error)?.name === 'AbortError' || failed === el.src) return
          // Once per track: the watch tries again every few seconds.
          failed = el.src
          console.error(`steamtv: ${kind}: couldn't play ${decodeURIComponent(el.src.split('/').pop() ?? '')}: ${(err as Error)?.name}: ${(err as Error)?.message}`)
        })
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
        base = volume
        target.current = volume
        gains = layers[kind].gains ?? urls.map(() => 1)
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
      // To this song's own level (a loud master quieter).
      el.play().then(() => fadeTo(target.current)).catch(() => {})
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
    const onSoundToggled = (): void => (soundOff ? fadeTo(0, () => el.pause(), HOLD_FADE_MS) : start())
    // Counted: the Music app can hold it while a video or Claude holds it too, and it comes back once all let go.
    let holders = 0
    const onHold = (event: Event): void => {
      holders = Math.max(0, holders + ((event as CustomEvent<boolean>).detail ? 1 : -1))
      const was = held
      held = holders > 0
      if (held && !was) fadeTo(0, () => el.pause(), HOLD_FADE_MS)
      else if (!held && was) start()
    }
    if (kind === 'music') {
      musicLayer = () => {
        const at = playlist.indexOf(el.src)
        return el.src && at >= 0 ? { files, at, time: el.currentTime, duration: Number.isFinite(el.duration) ? el.duration : 0, playing: !el.paused } : null
      }
    }
    load()
    // Report a problem's snapshot: why it is or isn't sounding. The song only as its kind.
    const stopDiagnostics = registerDiagnostics(`music.${kind}`, () => {
      const file = files[playlist.indexOf(el.src)] ?? null
      return {
        sounding: !el.paused,
        track: file === null ? null : file.startsWith('builtin:') ? file : file.startsWith('media:') ? '(from a media server)' : '(your own)',
        tracks: playlist.length,
        shuffle: random,
        volume: Number(el.volume.toFixed(2)),
        target: Number(target.current.toFixed(2)),
        introOver,
        held,
        holders,
        soundOff,
        front: isFront(),
        failedToPlay: failed !== '',
        readyState: el.readyState,
        networkState: el.networkState,
        mediaError: el.error?.code ?? null,
        seconds: Math.round(el.currentTime)
      }
    })
    // vaporTV on screen again (or gone behind a game or app).
    const stopFront = onFrontChange((front) => (front ? start() : onBlur()))
    // Should be sounding but isn't: started again.
    const watch = setInterval(() => {
      if (el.paused) start()
    }, WATCH_MS)
    // Waking from sleep: the sound output may have gone with it; paused, then the watch starts it afresh.
    const stopResume = window.steamtv.onResume(() => {
      if (!el.paused) el.pause()
    })
    el.addEventListener('ended', onEnded)
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    window.addEventListener(SKIP_EVENT, onSkip)
    window.addEventListener(MUSIC_CHANGED_EVENT, load)
    window.addEventListener(MUSIC_HOLD_EVENT, onHold)
    window.addEventListener(SOUND_TOGGLED_EVENT, onSoundToggled)
    return () => {
      if (kind === 'music') musicLayer = null
      window.removeEventListener(MUSIC_HOLD_EVENT, onHold)
      window.removeEventListener(SOUND_TOGGLED_EVENT, onSoundToggled)
      clearInterval(fade)
      el.removeEventListener('ended', onEnded)
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
      window.removeEventListener(SKIP_EVENT, onSkip)
      window.removeEventListener(MUSIC_CHANGED_EVENT, load)
      stopFront()
      stopResume()
      stopDiagnostics()
      clearInterval(watch)
    }
  }, [kind])

  return <audio ref={audio} preload="auto" />
}
