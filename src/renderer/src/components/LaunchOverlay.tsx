import { useEffect, useRef, useState } from 'react'
import { onOverlay, type OverlayState } from '../launch'

// A trail of dots chasing round a figure eight, after a CodePen loader: each dot
// lags the one ahead by a few degrees, fading out toward the tail.
const DOTS = 50
/** Degrees each dot trails the next. */
const SPACING = 4
/** One figure eight is two loops. */
const CYCLE = 720
/** Degrees per second (the pen's 4° per frame at 60fps). */
const SPEED = 240
const RADIUS = 20

function position(angle: number): { x: number; y: number } {
  const a = ((angle % CYCLE) + CYCLE) % CYCLE
  const radians = (Math.PI / 180) * (a % 360)
  // First loop: around the right circle, clockwise from its left edge.
  // Second loop: around the left circle, the other way, so the path crosses in the middle.
  if (a >= 360) {
    return { x: RADIUS - RADIUS * Math.cos(radians), y: RADIUS * Math.sin(radians) }
  }
  return { x: -RADIUS + RADIUS * Math.cos(radians), y: RADIUS * Math.sin(radians) }
}

function Spinner() {
  const dots = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    let frame = 0
    const start = performance.now()
    const tick = (now: number): void => {
      frame = requestAnimationFrame(tick)
      const head = ((now - start) / 1000) * SPEED
      dots.current.forEach((dot, i) => {
        if (!dot) return
        const { x, y } = position(head - (DOTS - 1 - i) * SPACING)
        dot.style.transform = `translate(${x}px, ${y}px)`
      })
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div className="spinner">
      {Array.from({ length: DOTS }, (_, i) => (
        <div
          key={i}
          ref={(el) => {
            dots.current[i] = el
          }}
          className="spinner-dot"
          // Accent orange throughout, deepening and fading out toward the tail.
          style={{ background: `hsl(37, 97%, ${35 + (i / (DOTS - 1)) * 20}%)`, opacity: i / (DOTS - 1) }}
        />
      ))}
    </div>
  )
}

function label(state: OverlayState): string {
  if (state.mode === 'launching') return `Launching ${state.name ?? ''}`.trim()
  return state.name ? `Closing ${state.name}` : 'Closing…'
}

export function LaunchOverlay() {
  const [state, setState] = useState<OverlayState | null>(null)
  // Keep the last text through the fade-out.
  const [text, setText] = useState('')

  useEffect(
    () =>
      onOverlay((next) => {
        setState(next)
        if (next) setText(label(next))
      }),
    []
  )

  return (
    <div className={`launch-overlay${state ? ' visible' : ''}`}>
      {state && <Spinner />}
      <div className="launch-label display">{text}</div>
    </div>
  )
}
