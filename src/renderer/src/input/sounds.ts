import favoriteUrl from '../assets/sounds/favorite.wav'
import launchUrl from '../assets/sounds/launch.wav'
import moveUrl from '../assets/sounds/move.wav'

export type Sound = 'move' | 'launch' | 'favorite'

const URLS: Record<Sound, string> = { move: moveUrl, launch: launchUrl, favorite: favoriteUrl }

// Web Audio rather than <audio>: decoded buffers start without the element's
// latency, which matters for a sound on every focus move.
const context = new AudioContext()
const buffers = new Map<Sound, AudioBuffer>()
const playing = new Map<Sound, AudioBufferSourceNode>()

for (const [name, url] of Object.entries(URLS) as [Sound, string][]) {
  fetch(url)
    .then((response) => response.arrayBuffer())
    .then((data) => context.decodeAudioData(data))
    .then((buffer) => buffers.set(name, buffer))
    .catch((err) => console.error(`steamtv: couldn't load ${name} sound:`, err))
}

export function play(name: Sound): void {
  const buffer = buffers.get(name)
  if (!buffer) return
  if (context.state === 'suspended') context.resume()
  // Restart rather than layer, so holding a direction doesn't pile sounds up.
  playing.get(name)?.stop()
  const source = context.createBufferSource()
  source.buffer = buffer
  source.connect(context.destination)
  source.onended = () => {
    if (playing.get(name) === source) playing.delete(name)
  }
  source.start()
  playing.set(name, source)
}
