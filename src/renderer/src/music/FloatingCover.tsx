import { useEffect, useRef, useState } from 'react'
import { FALLBACK, paletteFromPixels } from './palette'
import { musicAnalyser } from './player'

// Now playing's album cover, in the middle of the visualizer: dancing to the music, with a glow
// in the cover's own colour behind it. A new cover fades in over the old one.
//
// The dance: facing you at rest, it wanders (drifting, turning and tipping) along smooth random
// paths, each its own, so it never settles into a pattern; and each kick throws it a random way
// (turned, tipped, nudged, a little bigger) on springs that bring it back with a slight overshoot.

/** The cover's liveliest colour, for its glow; vaporTV's amber without one. */
function glowColour(url: string | undefined): Promise<string> {
  if (!url) return Promise.resolve(FALLBACK[0])
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 48
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return resolve(FALLBACK[0])
      ctx.drawImage(img, 0, 0, 48, 48)
      try {
        resolve(paletteFromPixels(ctx.getImageData(0, 0, 48, 48).data)[0])
      } catch {
        resolve(FALLBACK[0])
      }
    }
    img.onerror = () => resolve(FALLBACK[0])
    img.src = url
  })
}

/** A smooth random path, -1 to 1: random points one unit apart, eased between. */
function wander(): (t: number) => number {
  const knots = new Map<number, number>()
  const at = (i: number): number => {
    let v = knots.get(i)
    if (v === undefined) {
      v = Math.random() * 2 - 1
      knots.set(i, v)
      knots.delete(i - 4)
    }
    return v
  }
  return (t) => {
    const i = Math.floor(t)
    const f = t - i
    return at(i) + (at(i + 1) - at(i)) * f * f * (3 - 2 * f)
  }
}

/** A damped spring towards 0: kicked by an impulse, it swings back with a little overshoot. */
function spring(stiffness = 70, damping = 9): { value: number; kick(v: number): void; step(dt: number): void } {
  let velocity = 0
  return {
    value: 0,
    kick(v) {
      velocity += v
    },
    step(dt) {
      velocity += (-stiffness * this.value - damping * velocity) * dt
      this.value += velocity * dt
    }
  }
}

/** A level against the song's own quiet and loud (as the visualizer's), so a quiet track has kicks too. */
function gauge(): (x: number, dt: number) => number {
  let low = 1
  let high = 0
  return (x, dt) => {
    low = x < low ? x : low + (x - low) * Math.min(1, dt * 0.15)
    high = x > high ? x : high + (x - high) * Math.min(1, dt * 0.12)
    return Math.min(1, Math.max(0, (x - low) / Math.max(high - low, 0.08)))
  }
}

/** -1 or 1, at random. */
const side = (): number => (Math.random() < 0.5 ? -1 : 1)

export function FloatingCover({ cover, playing }: { cover?: string; playing: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const glow = useRef<HTMLDivElement>(null)
  const [colour, setColour] = useState(FALLBACK[0])
  // The cover showing, and the one before it fading out.
  const [shown, setShown] = useState<{ now?: string; was?: string }>({ now: cover })

  useEffect(() => {
    let live = true
    void glowColour(cover).then((c) => live && setColour(c))
    setShown((s) => (s.now === cover ? s : { now: cover, was: s.now }))
    return () => {
      live = false
    }
  }, [cover])

  // The float and the beat: written straight to the style each frame, not through React.
  const playingRef = useRef(playing)
  playingRef.current = playing
  useEffect(() => {
    const bins = new Uint8Array(512)
    // Each part of the wander on its own path, at its own pace.
    const path = { x: wander(), y: wander(), turn: wander(), tip: wander(), roll: wander() }
    const beat = { turn: spring(), tip: spring(), roll: spring(80, 10), x: spring(60, 9), y: spring(60, 9), size: spring(120, 12) }
    let bass = 0
    const measure = gauge()
    let kickLevel = 0
    let kickSlow = 0
    let sinceKick = 1
    let frame = 0
    let last = performance.now()
    let t = 0
    const tick = (now: number): void => {
      frame = requestAnimationFrame(tick)
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      // Paused: the wander slows to a near stop where it is rather than jumping.
      t += dt * (playingRef.current ? 1 : 0.15)
      const analyser = playingRef.current ? musicAnalyser() : null
      let level = 0
      if (analyser) {
        analyser.getByteFrequencyData(bins)
        let sum = 0
        for (let i = 1; i < 10; i++) sum += bins[i]
        level = Math.pow(sum / 9 / 255, 1.6)
      }
      // Quick to rise, slower to fall: with the beat, without flicker.
      bass += (level - bass) * (level > bass ? 0.5 : 0.12)
      // A kick: the bass jumping well over where it's been lately. Each throws it a different way.
      sinceKick += dt
      const raw = analyser ? measure(level, dt) : 0
      kickLevel += (raw - kickLevel) * (raw > kickLevel ? 0.6 : 0.1)
      if (kickLevel - kickSlow > 0.22 && kickLevel > 0.55 && sinceKick > 0.25) {
        sinceKick = 0
        const k = 0.6 + Math.random() * 0.8
        beat.turn.kick(side() * k * (40 + Math.random() * 50))
        beat.tip.kick(side() * k * (25 + Math.random() * 40))
        beat.roll.kick(side() * k * (8 + Math.random() * 14))
        beat.x.kick(side() * k * Math.random() * 160)
        beat.y.kick(side() * k * Math.random() * 120)
        beat.size.kick(k * 0.5)
      }
      kickSlow += (kickLevel - kickSlow) * Math.min(1, dt * 4)
      for (const s of Object.values(beat)) s.step(dt)
      if (box.current) {
        const x = path.x(t * 0.11) * 18 + beat.x.value
        const y = path.y(t * 0.14) * 14 + beat.y.value
        const turn = path.turn(t * 0.09) * 9 + beat.turn.value
        const tip = path.tip(t * 0.12) * 6 + beat.tip.value
        const roll = path.roll(t * 0.1) * 2.5 + beat.roll.value
        const size = 1 + bass * 0.03 + beat.size.value
        box.current.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotateY(${turn.toFixed(2)}deg) rotateX(${tip.toFixed(2)}deg) rotateZ(${roll.toFixed(2)}deg) scale(${size.toFixed(4)})`
      }
      if (glow.current) glow.current.style.opacity = (0.45 + bass * 0.5).toFixed(3)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const art = (url: string | undefined, className: string) =>
    url ? (
      <img key={url} className={className} src={url} alt="" />
    ) : (
      <span key="none" className={`${className} music-cover-none display`} aria-hidden="true">
        ♪
      </span>
    )

  return (
    <div className="music-cover-stage">
      <div ref={glow} className="music-cover-glow" style={{ background: colour }} aria-hidden="true" />
      <div ref={box} className="music-cover-float">
        {shown.was !== undefined && shown.was !== shown.now && art(shown.was, 'music-cover-art was')}
        {art(shown.now, 'music-cover-art now')}
      </div>
    </div>
  )
}
