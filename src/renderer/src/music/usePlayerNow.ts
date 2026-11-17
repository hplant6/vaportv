import { useSyncExternalStore } from 'react'
import { playerState, subscribe } from './player'

/** Whether the Music player has a song (playing or paused): redrawn only when that changes. */
export function usePlayerNow(): boolean {
  return useSyncExternalStore(subscribe, () => playerState().at >= 0)
}
