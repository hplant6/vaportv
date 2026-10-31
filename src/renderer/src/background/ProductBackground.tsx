import { useEffect, useRef, useState } from 'react'
import type { ConsoleBackdropQuality } from '../../../shared/types'
import type { Product } from './products'

/** A console's tab backdrop: the console in neon, the camera swinging round it. Calls onUnavailable if it can't run (or the model isn't in this build). */
export function ProductBackground({ product, quality, onUnavailable }: { product: Product; quality: ConsoleBackdropQuality; onUnavailable: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  // Hidden until the console is loaded and the first frame is drawn, then faded in.
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let stop: (() => void) | null = null
    let cancelled = false
    const fail = (err: unknown): void => {
      console.error(`steamtv: ${product.model} backdrop unavailable:`, err)
      onUnavailable()
    }
    // Loaded on demand: three.js and the glTF loader.
    import('./product/scene')
      .then(({ startProduct }) => {
        if (!cancelled) stop = startProduct(canvas.current!, product, quality, () => setReady(true), fail)
      })
      .catch(fail)
    return () => {
      cancelled = true
      stop?.()
    }
  }, [product, quality, onUnavailable])

  return <canvas className="stage-canvas" ref={canvas} style={{ opacity: ready ? 1 : 0, transition: 'opacity 1.2s ease' }} />
}
