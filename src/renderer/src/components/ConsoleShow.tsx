import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ConsoleBackdropQuality } from '../../../shared/types'
import { ProductBackground } from '../background/ProductBackground'
import { PRODUCTS, type Product } from '../background/products'
import { tabOrder, useTabArrangement } from '../availableTabs'

/** How long each console is on screen, from when it starts to fade in. */
const HOLD_MS = 5000
/** The next one starts loading this long before its turn, so it's ready to fade straight in. */
const PRELOAD_MS = 2000
/** ProductBackground's fade: the one underneath goes once the new one is fully up. */
const FADE_MS = 1200

/** Tabs with a backdrop of their own that isn't a console (the Apps tab's VHS tapes). */
const NOT_CONSOLES = new Set(['apps'])

/** One console's turn: loading out of sight until `show`. */
interface Shot {
  key: number
  id: string
  show: boolean
}

let shotKeys = 0

/** The consoles you have tabs for, in the bar's order, each once (the 32X shares the Genesis). */
function yourConsoles(): string[] {
  const seen = new Set<Product>()
  return tabOrder().filter((id) => {
    const product = PRODUCTS[id]
    if (!product || NOT_CONSOLES.has(id) || seen.has(product)) return false
    seen.add(product)
    return true
  })
}

/**
 * The Consoles screensaver: each of your consoles' tab backdrops in turn, from a random one on, each
 * fading in over the last. One that can't load (no model in this build, no WebGL) is skipped.
 */
export function ConsoleShow() {
  const arrangement = useTabArrangement()
  const [quality, setQuality] = useState<ConsoleBackdropQuality | null>(null)
  const [down, setDown] = useState<string[]>([])
  // `arrangement` changes when the tabs do; tabOrder() reads it.
  const consoles = useMemo(() => yourConsoles().filter((id) => !down.includes(id)), [arrangement, down])
  const [shots, setShots] = useState<Shot[]>([])
  const [ready, setReady] = useState<number[]>([])
  /** The current one's time is up: the next shows as soon as it's ready. */
  const [due, setDue] = useState(false)

  useEffect(() => {
    window.steamtv.getBackdrop().then((backdrop) => setQuality(backdrop.consoleBackdropQuality))
  }, [])

  const current = [...shots].reverse().find((shot) => shot.show)
  const pending = shots.find((shot) => !shot.show)
  const currentReady = !!current && ready.includes(current.key)
  const following = (id: string): string => consoles[(consoles.indexOf(id) + 1) % consoles.length]
  const queue = (after: string): void =>
    setShots((list) => (list.some((shot) => !shot.show) ? list : [...list, { key: shotKeys++, id: following(after), show: false }]))

  // To start (and again if every one shown so far has failed): a random console.
  useEffect(() => {
    if (shots.length === 0 && consoles.length > 0) {
      setShots([{ key: shotKeys++, id: consoles[Math.floor(Math.random() * consoles.length)], show: true }])
    }
  }, [consoles, shots.length])

  // Once it's drawn: the next one loads near the end of its time, and takes over at the end.
  useEffect(() => {
    if (!current || !currentReady || consoles.length < 2) return
    setDue(false)
    const load = setTimeout(() => queue(current.id), HOLD_MS - PRELOAD_MS)
    const turn = setTimeout(() => setDue(true), HOLD_MS)
    return () => {
      clearTimeout(load)
      clearTimeout(turn)
    }
  }, [current?.key, currentReady, consoles.length])

  // Its turn: shown when loaded (or a new one queued, if the one loading failed).
  useEffect(() => {
    if (!due || !current) return
    if (!pending) {
      if (consoles.length > 1) queue(current.id)
      return
    }
    if (!ready.includes(pending.key)) return
    setDue(false)
    setShots((list) => list.map((shot) => (shot.key === pending.key ? { ...shot, show: true } : shot)))
  }, [due, pending?.key, ready, consoles.length])

  // When the new one has faded up, the ones under it go (and their WebGL with them).
  useEffect(() => {
    if (!current || !currentReady) return
    const keep = current.key
    const timer = setTimeout(() => setShots((list) => list.filter((shot) => !shot.show || shot.key === keep)), FADE_MS)
    return () => clearTimeout(timer)
  }, [current?.key, currentReady])

  const onReady = (key: number): void => setReady((keys) => [...keys, key])
  const onFail = (failed: Shot): void => {
    setDown((ids) => [...ids, failed.id])
    setShots((list) => {
      const rest = list.filter((shot) => shot.key !== failed.key)
      // The one on screen failed with nothing under it: the one loading takes over, else start again.
      if (failed.show && !rest.some((shot) => shot.show)) {
        const next = rest.find((shot) => !shot.show)
        return next ? rest.map((shot) => (shot === next ? { ...shot, show: true } : shot)) : []
      }
      return rest
    })
  }

  if (!quality) return null
  return (
    <>
      {shots.map((shot) => (
        <ShotView key={shot.key} shot={shot} quality={quality} onReady={() => onReady(shot.key)} onFail={() => onFail(shot)} />
      ))}
    </>
  )
}

/** One console, with steady callbacks (ProductBackground restarts its scene when onUnavailable changes). */
function ShotView({ shot, quality, onReady, onFail }: { shot: Shot; quality: ConsoleBackdropQuality; onReady: () => void; onFail: () => void }) {
  const fail = useRef(onFail)
  useLayoutEffect(() => {
    fail.current = onFail
  })
  const unavailable = useCallback(() => fail.current(), [])
  return <ProductBackground product={PRODUCTS[shot.id]!} quality={quality} show={shot.show} onReady={onReady} onUnavailable={unavailable} />
}
