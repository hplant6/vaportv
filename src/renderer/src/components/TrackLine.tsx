import { useEffect, useState } from 'react'
import type { MusicTrack } from '../../../shared/types'

// A track's second line, under its name: who made an included one (and its licence), or for one of
// yours its artist and album (from the file and folder names), "Your file" and how long it is.

/** Lengths read so far, by file: each file's read once (null: couldn't be). */
const lengths = new Map<string, Promise<number | null>>()
/** Reads waiting their turn: a long list opening doesn't start hundreds at once. */
const queue: (() => void)[] = []
let reading = 0
const AT_ONCE = 3

function readLength(file: string): Promise<number | null> {
  let length = lengths.get(file)
  if (!length) {
    length = new Promise((resolve) => {
      const run = (): void => {
        reading++
        const done = (seconds: number | null): void => {
          reading--
          resolve(seconds)
          queue.shift()?.()
        }
        window.steamtv
          .musicTrackUrl(file)
          .then((url) => {
            const audio = new Audio()
            audio.preload = 'metadata'
            const timer = setTimeout(() => done(null), 10_000)
            audio.onloadedmetadata = () => {
              clearTimeout(timer)
              done(Number.isFinite(audio.duration) ? audio.duration : null)
              audio.removeAttribute('src')
            }
            audio.onerror = () => {
              clearTimeout(timer)
              done(null)
            }
            audio.src = url
          })
          .catch(() => done(null))
      }
      if (reading < AT_ONCE) run()
      else queue.push(run)
    })
    lengths.set(file, length)
  }
  return length
}

const clock = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`

/** How long one of your files is, once read ("4:32"). */
function useLength(file: string, wanted: boolean): string | undefined {
  const [length, setLength] = useState<string>()
  useEffect(() => {
    if (!wanted) return
    let live = true
    readLength(file).then((seconds) => live && seconds !== null && setLength(clock(seconds)))
    return () => {
      live = false
    }
  }, [file, wanted])
  return length
}

export function TrackLine({ track }: { track: MusicTrack }) {
  const length = useLength(track.file, !track.builtIn)
  if (track.builtIn) return <>{track.credit}</>
  return <>{[track.artist, track.album, 'Your file', length].filter(Boolean).join(' · ')}</>
}

export type SongRow = { heading: 'Yours' | 'Included'; track?: undefined; i?: undefined } | { heading?: undefined; track: MusicTrack; i: number }

/**
 * Tracks in two groups, yours first and then the ones that come with vaporTV, each under its heading (only when
 * there are both). `i` numbers the tracks through both, for their rows' ids.
 */
export function songGroups(tracks: MusicTrack[]): SongRow[] {
  const yours = tracks.filter((t) => !t.builtIn)
  const included = tracks.filter((t) => t.builtIn)
  const both = yours.length > 0 && included.length > 0
  const rows: SongRow[] = []
  let i = 0
  if (both) rows.push({ heading: 'Yours' })
  for (const track of yours) rows.push({ track, i: i++ })
  if (both) rows.push({ heading: 'Included' })
  for (const track of included) rows.push({ track, i: i++ })
  return rows
}
