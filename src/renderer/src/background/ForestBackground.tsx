import { useEffect, useRef, useState } from 'react'

/** A walk round a grassy clearing in a forest, following the time of day. Calls onUnavailable if it can't run. */
export function ForestBackground({ onUnavailable }: { onUnavailable: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  // Hidden until the trees are grown and the first frame is drawn, then faded in.
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let stop: (() => void) | null = null
    let cancelled = false
    const fail = (err: unknown): void => {
      console.error('steamtv: forest backdrop unavailable:', err)
      onUnavailable()
    }
    // Loaded on demand: three.js and EZ-Tree (with its bark and leaf textures) are large.
    import('./forest/scene')
      .then(({ startForest }) => {
        if (!cancelled) stop = startForest(canvas.current!, () => setReady(true), fail)
      })
      .catch(fail)
    return () => {
      cancelled = true
      stop?.()
    }
  }, [onUnavailable])

  return <canvas className="stage-canvas" ref={canvas} style={{ opacity: ready ? 1 : 0, transition: 'opacity 1.2s ease' }} />
}
