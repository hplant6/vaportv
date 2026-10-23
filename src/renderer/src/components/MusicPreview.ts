// Settings → Music → Songs: hearing a song before choosing it. One plays at a time, for up to
// PREVIEW_MS; the background music and ambience hold (fade out and pause) until it stops.

/** Fired when a preview starts or stops (detail: true while one plays). BackgroundMusic listens. */
export const MUSIC_HOLD_EVENT = 'steamtv:music-hold'
/** Fired with the file previewing, or null when none is. Settings' buttons listen. */
export const PREVIEW_EVENT = 'steamtv:preview'

const PREVIEW_MS = 30_000
const VOLUME = 0.45

let audio: HTMLAudioElement | null = null
let playing: string | null = null
let timer: ReturnType<typeof setTimeout> | undefined

export function previewing(): string | null {
  return playing
}

const announce = (): void => {
  window.dispatchEvent(new CustomEvent(PREVIEW_EVENT, { detail: playing }))
}

/** Plays `file`, or stops it if it's the one playing. */
export async function togglePreview(file: string): Promise<void> {
  if (playing === file) return stopPreview()
  const wasHolding = playing !== null
  halt()
  playing = file
  announce()
  if (!wasHolding) window.dispatchEvent(new CustomEvent(MUSIC_HOLD_EVENT, { detail: true }))
  const url = await window.steamtv.musicTrackUrl(file)
  // Another press while the address came back.
  if (playing !== file) return
  audio = new Audio(url)
  audio.volume = VOLUME
  audio.addEventListener('ended', stopPreview)
  audio.play().catch(stopPreview)
  timer = setTimeout(stopPreview, PREVIEW_MS)
}

function halt(): void {
  clearTimeout(timer)
  audio?.pause()
  audio = null
}

/** Stops any preview and lets the background music play again. */
export function stopPreview(): void {
  if (playing === null) return
  halt()
  playing = null
  announce()
  window.dispatchEvent(new CustomEvent(MUSIC_HOLD_EVENT, { detail: false }))
}

// A game or app coming to the front ends a preview, as it pauses the music.
window.addEventListener('blur', stopPreview)
