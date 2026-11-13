import { useEffect, useRef, useState } from 'react'
import { PRODUCTS } from './products'
import { BACKDROP_CHANGED_EVENT } from './SeaBackground'

/** Settings → Backdrop → Spinning consoles, kept current as it's changed. Null until read. */
function useSpinningConsoles(): boolean | null {
  const [on, setOn] = useState<boolean | null>(null)
  useEffect(() => {
    const read = (): void => {
      window.steamtv.getSettings().then((s) => setOn(s.spinningConsoles))
    }
    read()
    window.addEventListener(BACKDROP_CHANGED_EVENT, read)
    return () => window.removeEventListener(BACKDROP_CHANGED_EVENT, read)
  }, [])
  return on
}

/**
 * `tab`'s console turning slowly, in the left bar (product/spin.ts), faded in once drawn. Nothing
 * if it has no model (or not in this build), WebGL fails, or Spinning consoles is off.
 */
export function ConsoleSpin({ tab }: { tab: string }) {
  const product = PRODUCTS[tab]
  const on = useSpinningConsoles()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!product || !on) return
    let stop: (() => void) | null = null
    let cancelled = false
    const fail = (err: unknown): void => {
      console.error(`steamtv: ${product.model} spin unavailable:`, err)
      setFailed(true)
    }
    // Loaded on demand: three.js and the glTF loader.
    import('./product/spin')
      .then(({ startSpin }) => {
        if (!cancelled && canvas.current) stop = startSpin(canvas.current, product, () => setReady(true), fail)
      })
      .catch(fail)
    return () => {
      cancelled = true
      stop?.()
      setReady(false)
    }
  }, [product, on])

  // Still reading the setting: its space is kept, so the lists under it don't jump down when it's read.
  if (!product || on === false || failed) return null
  return <canvas className={`side-bar-model${product.spin?.tall ? ' tall' : ''}${ready ? ' ready' : ''}`} ref={canvas} aria-hidden="true" />
}
