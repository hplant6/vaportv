import { useSyncExternalStore } from 'react'
import type { MusicTags } from '../../../shared/types'
import { useBackgroundSong } from '../music/backgroundSong'
import { next, playerState, previous, subscribe } from '../music/player'
import { skipTrack } from './BackgroundMusic'
import { NextIcon, PreviousIcon } from './icons'

// The bar's second row, while music plays: Up next on the left, Now playing on the right with
// its time and back / next buttons. The Music player's queue when it has one (it knows what's
// next and how far in), else background music's song (Now playing only, still skippable).

function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const s = Math.floor(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const name = (song: MusicTags): string => (song.artist ? `${song.artist} - ${song.title}` : song.title)

/** The player's state, redrawn as it changes (including the time, a few times a second). */
const usePlayer = () => useSyncExternalStore(subscribe, playerState)

/** Whether the row has anything to show: the bar opens its second row for it. */
export function useNowPlayingShown(): boolean {
  const queued = useSyncExternalStore(subscribe, () => playerState().at >= 0)
  const background = useBackgroundSong()
  return queued || !!background.song
}

/** The class Down from the bar steps to (the row's buttons). */
export const NOW_PLAYING_BUTTON = 'nav-now-button'

export function NowPlayingRow() {
  const state = usePlayer()
  const background = useBackgroundSong()
  const queued = state.at >= 0
  const song = queued ? (state.queue[state.order[state.at]] ?? null) : background.song
  if (!song) return null
  // After this one: the next in play order, or with repeat all, round to the first.
  const after = queued ? (state.order[state.at + 1] ?? (state.repeat === 'all' ? state.order[0] : undefined)) : undefined
  const upNext = after !== undefined ? state.queue[after] : null
  const back = (): void => (queued ? previous() : skipTrack('music', -1))
  const skip = (): void => (queued ? void next() : skipTrack('music', 1))
  const button = (label: string, onClick: () => void, icon: React.ReactNode) => (
    <button className={`nav-tab nav-icon-tab ${NOW_PLAYING_BUTTON}`} tabIndex={-1} aria-label={label} data-focusable="" data-select-sound="move" onClick={onClick}>
      {icon}
    </button>
  )
  return (
    <div className="nav-now">
      <span className="nav-now-part">
        {upNext && (
          <>
            <span className="nav-now-label display">Up next:</span>
            <span className="nav-now-song">{name(upNext)}</span>
          </>
        )}
      </span>
      <span className="nav-now-part">
        <span className="nav-now-label display">Now playing:</span>
        <span className="nav-now-song">{name(song)}</span>
        {queued && state.duration > 0 && (
          <span className="nav-now-time">
            {clock(state.time)}/{clock(state.duration)}
          </span>
        )}
        {button('Previous song', back, <PreviousIcon className="nav-now-icon" />)}
        {button('Next song', skip, <NextIcon className="nav-now-icon" />)}
      </span>
    </div>
  )
}
