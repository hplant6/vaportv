import { useEffect, useState } from 'react'
import type { MusicTags } from '../../../shared/types'
import { backgroundNow, NOW_PLAYING_EVENT } from '../components/BackgroundMusic'
import { toast } from '../components/Toast'
import { playQueue, playerState, toggleShuffle } from './player'

// Background music's song, as a song (title, artist, cover): for the corner, which shows it
// for a few seconds as each one starts, and the Music tab's strip with Turn it up, which moves
// it into the Music player at full volume, same song, same moment, the rest of the list after it.

/** How long a new background song shows in the corner. */
const SHOWN_MS = 8000
const CHANGED = 'steamtv:background-song'

let song: MusicTags | null = null
let shownUntil = 0
let lastFile: string | null = null

window.addEventListener(NOW_PLAYING_EVENT, (event) => {
  if ((event as CustomEvent<string>).detail !== 'music') return
  const now = backgroundNow()
  const file = now ? now.files[now.at] : null
  if (file === lastFile) return void window.dispatchEvent(new Event(CHANGED))
  lastFile = file
  if (!file) {
    song = null
    return void window.dispatchEvent(new Event(CHANGED))
  }
  void window.steamtv.music.songs([file]).then(([got]) => {
    if (lastFile !== file) return
    song = got ?? null
    shownUntil = Date.now() + SHOWN_MS
    window.dispatchEvent(new Event(CHANGED))
    setTimeout(() => window.dispatchEvent(new Event(CHANGED)), SHOWN_MS + 50)
  })
})

/** The background song, and whether it's just started (the corner shows it then). */
export function useBackgroundSong(): { song: MusicTags | null; fresh: boolean } {
  const [, setVersion] = useState(0)
  useEffect(() => {
    const changed = (): void => setVersion((v) => v + 1)
    window.addEventListener(CHANGED, changed)
    return () => window.removeEventListener(CHANGED, changed)
  }, [])
  return { song, fresh: !!song && Date.now() < shownUntil }
}

/** Turn it up: background music's list from this song on (then the ones before), in the Music player from this moment; Now playing opens. */
export async function turnItUp(from: Element | null): Promise<void> {
  const now = backgroundNow()
  if (!now) return
  const order = [...now.files.slice(now.at), ...now.files.slice(0, now.at)]
  const songs = await window.steamtv.music.songs(order)
  if (!songs.length) return
  if (playerState().shuffle) toggleShuffle()
  playQueue(songs, 0, null, now.time)
  toast(`Turned up: ${songs[0].title}`)
  window.dispatchEvent(new CustomEvent('steamtv:music', { detail: from }))
}
