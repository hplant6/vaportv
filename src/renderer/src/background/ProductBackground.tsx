import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ConsoleBackdropQuality } from '../../../shared/types'
import type { Product } from './products'

/**
 * A console's tab backdrop: the console in neon, the camera swinging round it. Calls onUnavailable if it can't run (or the model isn't in this build).
 * The screensaver's Consoles style loads the next one with `show` false, then shows it when its turn comes; onReady says it's drawn.
 */
export function ProductBackground({
  product,
  quality,
  onUnavailable,
  show = true,
  onReady
}: {
  product: Product
  quality: ConsoleBackdropQuality
  onUnavailable: () => void
  show?: boolean
  onReady?: () => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  // Hidden until the console is loaded and the first frame is drawn, then faded in.
  const [ready, setReady] = useState(false)
  const readyCallback = useRef(onReady)
  useLayoutEffect(() => {
    readyCallback.current = onReady
  })

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
        if (!cancelled) stop = startProduct(
            canvas.current!,
            product,
            quality,
            () => {
              setReady(true)
              readyCallback.current?.()
            },
            fail
          )
      })
      .catch(fail)
    return () => {
      cancelled = true
      stop?.()
    }
  }, [product, quality, onUnavailable])

  return <canvas className="stage-canvas" ref={canvas} style={{ opacity: ready && show ? 1 : 0, transition: 'opacity 1.2s ease' }} />
}
