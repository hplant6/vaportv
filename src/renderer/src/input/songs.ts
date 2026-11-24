import { current, next, playerState, previous } from '../music/player'
import { toast } from '../components/Toast'
import { skipTrack } from '../components/BackgroundMusic'

// Next and previous song, from a controller button or a remote's key: whatever you hear,
// the Music player's song when it has a queue, else background music's.

export function nextSong(): void {
  if (playerState().at >= 0) {
    void next().then(announce)
  } else skipTrack('music', 1, true)
}

export function previousSong(): void {
  if (playerState().at >= 0) {
    previous()
    announce()
  } else skipTrack('music', -1, true)
}

function announce(): void {
  const now = current()
  if (now) toast(`♪ ${now.title}`)
}
