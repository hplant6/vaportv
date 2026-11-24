// Opening the Music screen on Now playing from elsewhere (an album's Play, its Now playing
// button, a station started): Back from Now playing then closes it, back where it was opened
// from (the album's page), rather than going on into the Music screen's own browser.

/** MusicApp's MUSIC_EVENT (named here too: MusicApp imports this module's users). */
const MUSIC_EVENT = 'steamtv:music'

let pending = false

/** Opens the Music screen on Now playing, coming back to `from` on Back. */
export function openNowPlaying(from: Element | null): void {
  pending = true
  window.dispatchEvent(new CustomEvent(MUSIC_EVENT, { detail: from }))
}

/** For MusicApp, as it opens: whether this opening was openNowPlaying's. */
export function takeNowPlaying(): boolean {
  const was = pending
  pending = false
  return was
}
