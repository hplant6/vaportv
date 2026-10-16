// L2 / R2 change the system volume. Steps run one at a time, so holding a trigger
// can't pile up more changes than wpctl keeps pace with.

export const VOLUME_EVENT = 'steamtv:volume'

let busy = false
let queued = 0

export function stepVolume(direction: 1 | -1): void {
  if (busy) {
    queued = Math.max(-3, Math.min(3, queued + direction))
    return
  }
  busy = true
  window.steamtv
    .stepVolume(direction)
    .then((volume) => {
      if (volume) window.dispatchEvent(new CustomEvent(VOLUME_EVENT, { detail: volume }))
    })
    .finally(() => {
      busy = false
      if (queued === 0) return
      const next = queued > 0 ? 1 : -1
      queued -= next
      stepVolume(next)
    })
}
