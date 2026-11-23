import type { CoverMotion, VisualizerLook, VisualizerPower } from '../../../shared/types'

// Now playing's choices, as Settings → Music and the player's own settings (the gear) show them.

export const VISUALIZERS: { id: VisualizerLook; name: string; detail: string }[] = [
  { id: 'orb', name: 'Orb', detail: 'A neon globe that breaks apart and swells with the music' },
  { id: 'wave', name: 'Wave', detail: 'A glowing ridge of the sound, bass in the middle, rolling back' },
  { id: 'ring', name: 'Ring', detail: 'A tilted ring of light, its band rising and falling with the sound' },
  { id: 'both', name: 'Mix', detail: 'Orb, Wave and Ring take turns, changing over on a beat' },
  { id: 'off', name: 'None', detail: 'Just the cover and the song' }
]

export const VISUALIZER_POWERS: { id: VisualizerPower; name: string; detail: string }[] = [
  { id: 'fast', name: 'Fast machine', detail: 'All of it: full detail, every frame' },
  { id: 'slow', name: 'Slow machine', detail: 'Lighter: half the resolution, 30 frames a second' },
  { id: 'off', name: 'Off', detail: 'No visualizer, just the cover' }
]

export const COVER_MOTIONS: { id: CoverMotion; name: string; detail: string }[] = [
  { id: 'lots', name: 'A lot', detail: 'It dances: striking a new pose on the beat' },
  { id: 'little', name: 'A little', detail: 'It sways gently with the music' },
  { id: 'still', name: 'None', detail: 'It stays still' }
]
