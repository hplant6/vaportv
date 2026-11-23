import { useEffect, useRef, useState } from 'react'
import { FALLBACK, paletteFromPixels } from './palette'
import type { CoverMotion } from '../../../shared/types'
import { musicLevels } from './levels'

// Now playing's album cover, in the middle of the visualizer: dancing to the music, with a glow
// in the cover's own colour behind it. A new cover fades in over the old one.
//
// Each album is in a plastic sleeve: one of the overlays in private/sleeves.json (on Henry's
// box; a public build has none, and shows the cover bare), chosen and turned by the cover's
// address, so an album always comes in the same one.
//
// The dance hears the music as the visualizer does (levels.ts, the same reading each frame), so
// it moves on the kicks the visualizer shows, not after them. On a kick it strikes a new pose:
// leaning a random way (any corner tipped back or forward) and shifted towards it, reached in a
// fraction of a second on springs; with no kicks it still changes pose every few seconds.
// Between poses it keeps drifting, more when it's loud. On every kick it lifts and swells at
// once, and it rolls with the visualizer's colour swing, so the two move together.

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

/** The plastic sleeves there are (none in a public build), asked for once. */
let sleeveList: Promise<string[]> | null = null
function sleeves(): Promise<string[]> {
  sleeveList ??= fetch(new URL('private/sleeves.json', document.baseURI).href)
    .then((res) => (res.ok ? (res.json() as Promise<string[]>) : []))
    .catch(() => [])
  return sleeveList
}

/** An album's sleeve and how it's turned (a quarter turn at a time), the same each time it plays. */
function sleeveFor(cover: string, list: string[]): { url: string; turn: number } | null {
  if (!list.length) return null
  let h = 2166136261
  for (let i = 0; i < cover.length; i++) h = Math.imul(h ^ cover.charCodeAt(i), 16777619)
  h >>>= 0
  return { url: new URL(`private/${list[h % list.length]}`, document.baseURI).href, turn: (Math.floor(h / list.length) % 4) * 90 }
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

/** A spring following a target: quick to get there, with a little overshoot. */
function spring(stiffness = 150, damping = 16): { value: number; target: number; step(dt: number): void } {
  let velocity = 0
  return {
    value: 0,
    target: 0,
    step(dt) {
      // In small steps, so a slow frame can't throw it out of control.
      for (let left = dt; left > 0; left -= 1 / 240) {
        const h = Math.min(left, 1 / 240)
        velocity += (stiffness * (this.target - this.value) - damping * velocity) * h
        this.value += velocity * h
      }
    }
  }
}

/** -1 or 1, at random. */
const side = (): number => (Math.random() < 0.5 ? -1 : 1)
/** A random number from `a` to `b`. */
const between = (a: number, b: number): number => a + Math.random() * (b - a)

/** The cover's pose limits: degrees for turning (left/right), tipping (top/bottom) and rolling; pixels for shifting. */
const POSE = { turn: [8, 22], tip: [6, 17], roll: [0.5, 4.5], x: [14, 52], y: [10, 40] } as const
/** A kick strikes a new pose at most this often (seconds); each kick still lifts it. */
const POSE_EVERY = 0.45
/** With no kicks, a new pose after this long (seconds), give or take a second. */
const POSE_IDLE = 3

/** How far each kind of movement goes. */
const MOTION_SCALE: Record<CoverMotion, number> = { lots: 1, little: 0.35, still: 0 }

export function FloatingCover({ cover, playing, motion = 'lots' }: { cover?: string; playing: boolean; motion?: CoverMotion }) {
  const box = useRef<HTMLDivElement>(null)
  const glow = useRef<HTMLDivElement>(null)
  const [colour, setColour] = useState(FALLBACK[0])
  const [sleeveNames, setSleeveNames] = useState<string[]>([])
  useEffect(() => {
    let live = true
    void sleeves().then((list) => live && setSleeveNames(list))
    return () => {
      live = false
    }
  }, [])
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
  const motionRef = useRef(motion)
  motionRef.current = motion
  useEffect(() => {
    const drift = { x: wander(), y: wander(), turn: wander(), tip: wander(), roll: wander() }
    const pose = { x: spring(), y: spring(), turn: spring(), tip: spring(), roll: spring() }
    let seenBeats = 0
    let sincePose = 0
    let idleFor = POSE_IDLE
    let frame = 0
    let last = performance.now()
    let t = 0
    const strike = (energy: number): void => {
      const amp = 0.55 + energy * 0.6
      const turn = side()
      const tip = side()
      pose.turn.target = turn * between(...POSE.turn) * amp
      pose.tip.target = tip * between(...POSE.tip) * amp
      pose.roll.target = side() * between(...POSE.roll) * amp
      // Shifted the way it leans, mostly: a turned-away edge goes further that way.
      pose.x.target = (Math.random() < 0.8 ? turn : -turn) * between(...POSE.x) * amp
      pose.y.target = (Math.random() < 0.8 ? -tip : tip) * between(...POSE.y) * amp
      sincePose = 0
      idleFor = POSE_IDLE + between(-1, 1)
    }
    const tick = (now: number): void => {
      frame = requestAnimationFrame(tick)
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      const playing = playingRef.current
      const levels = musicLevels(now, playing)
      const { bass, kick, energy, hue } = levels
      // Paused: the drift slows to a near stop where it is, and it keeps its pose.
      t += dt * (playing ? 0.6 + energy * 0.8 : 0.1)
      if (playing) {
        sincePose += dt
        const kicked = levels.beats !== seenBeats
        if ((kicked && sincePose >= POSE_EVERY) || sincePose >= idleFor) strike(energy)
      }
      seenBeats = levels.beats
      for (const s of Object.values(pose)) s.step(dt)
      const m = MOTION_SCALE[motionRef.current]
      if (box.current && m === 0) box.current.style.transform = 'none'
      else if (box.current) {
        const sway = 0.5 + energy * 0.8
        const x = pose.x.value + drift.x(t * 0.5) * 10 * sway
        // On a kick it lifts at once, falling back as the kick fades.
        const y = pose.y.value + drift.y(t * 0.55) * 8 * sway - kick * 14
        const turn = pose.turn.value + drift.turn(t * 0.45) * 5 * sway
        const tip = pose.tip.value + drift.tip(t * 0.5) * 4 * sway
        // Rolling with the visualizer's colour swing, which is thrown one way then the other on the kicks.
        const roll = pose.roll.value + drift.roll(t * 0.4) * 1.5 * sway + hue * 4
        const size = 1 + bass * 0.025 + kick * 0.04
        // A little: the same dance, smaller.
        box.current.style.transform = `translate(${(x * m).toFixed(2)}px, ${(y * m).toFixed(2)}px) rotateY(${(turn * m).toFixed(2)}deg) rotateX(${(tip * m).toFixed(2)}deg) rotateZ(${(roll * m).toFixed(2)}deg) scale(${(1 + (size - 1) * m).toFixed(4)})`
      }
      if (glow.current) glow.current.style.opacity = (0.35 + bass * 0.35 + kick * 0.3).toFixed(3)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  // The cover and its sleeve, fading in and out together.
  const art = (url: string | undefined, className: string) => {
    if (!url)
      return (
        <span key="none" className={`${className} music-cover-none display`} aria-hidden="true">
          ♪
        </span>
      )
    const sleeve = sleeveFor(url, sleeveNames)
    return (
      <span key={url} className={`${className} music-cover-wrapped`}>
        <img className="music-cover-image" src={url} alt="" />
        {sleeve && <img className="music-cover-sleeve" src={sleeve.url} alt="" style={{ transform: `rotate(${sleeve.turn}deg)` }} />}
      </span>
    )
  }

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
