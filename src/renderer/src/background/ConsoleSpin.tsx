import { useEffect, useRef, useState } from 'react'
import { PRODUCTS } from './products'
import { BACKDROP_CHANGED_EVENT } from './SeaBackground'

/** Settings → Backdrop → Spinning consoles, kept current as it's changed. Null until read. */
export function useSpinningConsoles(): boolean | null {
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
 * `tab`'s console turning slowly (product/spin.ts), faded in once drawn: in the left bar, and on
 * the More screen's tile under the cursor (`className` sizes it). Nothing if it has no model (or
 * not in this build), WebGL fails, or Spinning consoles is off.
 */
export function ConsoleSpin({
  tab,
  className = 'side-bar-model',
  onReady,
  turnSeconds
}: {
  tab: string
  className?: string
  onReady?: () => void
  /** Seconds for one turn (spin.ts's own, unhurried, by default). */
  turnSeconds?: number
}) {
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
        if (!cancelled && canvas.current) stop = startSpin(
          canvas.current,
          product,
          () => {
            setReady(true)
            onReady?.()
          },
          fail,
          undefined,
          turnSeconds
        )
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
  return <canvas className={`${className}${product.spin?.tall ? ' tall' : ''}${ready ? ' ready' : ''}`} ref={canvas} aria-hidden="true" />
}

// ── Stills: each console as it first stands in the turning view, for the More screen's tiles ──
//
// Every tile spinning would be a WebGL context each (Chromium keeps about sixteen before it
// drops the oldest) and the GPU drawing them all every frame. So each console is drawn once,
// one at a time, copied to a picture, and its context let go; only the tile under the cursor
// turns. The pictures are kept (in this browser's storage) so they're drawn once, not each visit.

/** The pictures' size, in stage pixels (a tile's console area); drawn at up to the screen's pixels. */
export const STILL_SIZE = { width: 356, height: 170 }
const STORE_PREFIX = 'vaportv:console-still:'
declare const __BUILD_ID__: string
/** This build's: a new build draws them again (its models may have changed), and drops the last one's. */
const BUILD_PREFIX = `${STORE_PREFIX}${__BUILD_ID__}:`

let pruned = false
function pruneOldStills(): void {
  if (pruned) return
  pruned = true
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(STORE_PREFIX) && !key.startsWith(BUILD_PREFIX)) localStorage.removeItem(key)
  } catch {
    // No storage here.
  }
}

const stills = new Map<string, Promise<string | null>>()
/** One drawn at a time: each queues behind the last. */
let queue: Promise<unknown> = Promise.resolve()

function storeKey(tab: string): string {
  return `${BUILD_PREFIX}${PRODUCTS[tab]?.model}:${STILL_SIZE.width}x${STILL_SIZE.height}`
}

function drawStill(tab: string): Promise<string | null> {
  const product = PRODUCTS[tab]
  if (!product) return Promise.resolve(null)
  pruneOldStills()
  try {
    const kept = localStorage.getItem(storeKey(tab))
    if (kept) return Promise.resolve(kept)
  } catch {
    // No storage here: draw it.
  }
  const next = queue.then(
    () =>
      new Promise<string | null>((resolve) => {
        const canvas = document.createElement('canvas')
        let stop: (() => void) | null = null
        const done = (url: string | null): void => {
          stop?.()
          resolve(url)
        }
        // The stage's scale to the screen (spin.ts draws at the screen's pixels, at most one per stage pixel).
        const scale = window.innerWidth / 1920
        import('./product/spin')
          .then(({ startSpin }) => {
            stop = startSpin(
              canvas,
              product,
              () => {
                const url = canvas.toDataURL('image/webp', 0.9)
                try {
                  localStorage.setItem(storeKey(tab), url)
                } catch {
                  // Full or unavailable: it's drawn again next time.
                }
                // Let go of its context after this frame, not inside it.
                setTimeout(() => done(url))
              },
              (err) => {
                console.error(`steamtv: ${product.model} still unavailable:`, err)
                done(null)
              },
              { ...STILL_SIZE, scale }
            )
          })
          .catch(() => done(null))
      })
  )
  queue = next
  return next
}

/** `tab`'s console as a picture (a data URL), drawn once and kept; null with no model, or until it's drawn. */
export function useConsoleStill(tab: string): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!PRODUCTS[tab]) return
    let current = true
    let still = stills.get(tab)
    if (!still) {
      still = drawStill(tab)
      stills.set(tab, still)
    }
    void still.then((got) => current && setUrl(got))
    return () => {
      current = false
    }
  }, [tab])
  return url
}
