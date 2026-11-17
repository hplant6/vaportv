import { useEffect, useState } from 'react'
import { MUSIC_CHANGED_EVENT } from '../components/BackgroundMusic'
import { toast } from '../components/Toast'
import { play } from '../input/sounds'

// Background music's choice, for the Music tab's Set as background music buttons and
// Settings → Music & sounds: the same setting from both, kept up to date.

let choice: string | null | undefined
const listeners = new Set<(c: string | null) => void>()

function load(): void {
  window.steamtv.getSettings().then((s) => {
    choice = s.music ?? null
    for (const l of listeners) l(choice)
  })
}
window.addEventListener(MUSIC_CHANGED_EVENT, load)

/** What background music is set to (null: none). */
export function useBackgroundChoice(): string | null {
  const [now, setNow] = useState<string | null>(choice ?? null)
  useEffect(() => {
    listeners.add(setNow)
    if (choice === undefined) load()
    else setNow(choice)
    return () => void listeners.delete(setNow)
  }, [])
  return now
}

/** Background music set to this (an album, a playlist, Liked songs…), named for the toast. */
export async function setBackground(next: string | null, name?: string): Promise<void> {
  await window.steamtv.setMusic('music', next)
  window.dispatchEvent(new Event(MUSIC_CHANGED_EVENT))
  play('favorite')
  if (name) toast(`${name} is the background music now`)
}
