import { useEffect, useRef, useState } from 'react'

/** A wet city street at night in the rain, its lights in a puddle. Calls onUnavailable if it can't run. */
export function CityRainBackground({ onUnavailable }: { onUnavailable: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  // Hidden until the city and street are loaded and the first frame is drawn, then faded in.
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let stop: (() => void) | null = null
    let cancelled = false
    const fail = (err: unknown): void => {
      console.error('steamtv: city rain backdrop unavailable:', err)
      onUnavailable()
    }
    // Loaded on demand: three.js and the HDR loader.
    import('./cityrain/scene')
      .then(({ startCityRain }) => {
        if (!cancelled) stop = startCityRain(canvas.current!, () => setReady(true), fail)
      })
      .catch(fail)
    return () => {
      cancelled = true
      stop?.()
    }
  }, [onUnavailable])

  return <canvas className="stage-canvas" ref={canvas} style={{ opacity: ready ? 1 : 0, transition: 'opacity 1.2s ease' }} />
}
