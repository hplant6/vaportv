import { useEffect, useRef, useState } from 'react'
import { FALLBACK, paletteFromPixels } from './palette'
import { musicAnalyser } from './player'

// Now playing's album cover, front and centre over the backdrop: floating up and down, turning
// a little in depth, and swelling slightly on the beat, with a glow in the cover's own colour
// behind it. A new cover fades in over the old one.

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
    let bass = 0
    let frame = 0
    let last = performance.now()
    let t = 0
    const tick = (now: number): void => {
      frame = requestAnimationFrame(tick)
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      // Paused: the float slows to a stop where it is rather than jumping.
      t += dt * (playingRef.current ? 1 : 0.25)
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
      if (box.current) {
        const y = Math.sin(t * 0.7) * 10
        const turn = -8 + Math.sin(t * 0.45) * 4
        const tilt = Math.sin(t * 0.6) * 0.8 + bass * 1.2
        box.current.style.transform = `translateY(${y.toFixed(2)}px) rotateY(${turn.toFixed(2)}deg) rotateZ(${tilt.toFixed(2)}deg) scale(${(1 + bass * 0.035).toFixed(4)})`
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
