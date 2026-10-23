import { useEffect, useRef } from 'react'
import { presets, withDirection, type DistortLayerConfig, type DriftConfig, type DriftDirection } from './drift/presets'
import { blurFrag, circlesFrag, distortFrag, fullscreenVert, MAX_CIRCLES } from './drift/shaders'
import { stageHeight } from '../stage'
import { pacer } from './pace'

// Gradient Drift (Liam Egan's pen, MIT): soft colour circles drifting behind a
// gaussian blur and two panes of reeded glass. Plain WebGL2, four fullscreen passes:
// circles → blur across → blur down → glass, the first three at reduced resolution.

// Render at the stage size; the stage itself is scaled up to the display.
const WIDTH = 1920
// The stage's height (taller than 1080 on a taller screen, e.g. a Steam Deck's).
const HEIGHT = stageHeight()

/** Deterministic seeded PRNG (mulberry32): the same seed gives the same circles. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const range = (rng: () => number, min: number, max: number): number => min + rng() * (max - min)

/** '#rgb' or '#rrggbb' → [r, g, b] in 0..1. */
function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '')
  if (h.length === 3) h = [...h].map((c) => c + c).join('')
  const n = parseInt(h.slice(0, 6), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

interface DriftAxis {
  a1: number
  f1: number
  p1: number
  a2: number
  f2: number
  p2: number
}

interface Circle {
  /** Rest position as a fraction of the screen, -0.5..0.5 */
  base: { x: number; y: number }
  /** Radius as a fraction of min(width, height) */
  radius: number
  x: DriftAxis
  y: DriftAxis
}

// Two incommensurate sines per axis: slow, organic, never visibly repeats.
function makeAxis(rng: () => number): DriftAxis {
  const f1 = range(rng, 0.01, 0.035) * Math.PI * 2
  return {
    a1: range(rng, 0.5, 1),
    f1,
    p1: range(rng, 0, Math.PI * 2),
    a2: range(rng, 0.2, 0.5),
    f2: f1 * range(rng, 1.4, 2.2),
    p2: range(rng, 0, Math.PI * 2)
  }
}

function makeCircles(config: DriftConfig): Circle[] {
  const rng = mulberry32(config.seed)
  return Array.from({ length: Math.min(config.count, MAX_CIRCLES) }, () => ({
    base: { x: range(rng, -0.35, 0.35), y: range(rng, -0.35, 0.35) },
    radius: range(rng, config.radiusMin, config.radiusMax),
    x: makeAxis(rng),
    y: makeAxis(rng)
  }))
}

/**
 * The look to draw, its ribs turned as chosen: a palette by name, a random one each
 * start ('random'), or molten for a name no longer offered.
 */
export function driftConfig(name: string, direction: DriftDirection): DriftConfig {
  const names = Object.keys(presets)
  const config = name === 'random' ? presets[names[Math.floor(Math.random() * names.length)]] : (presets[name] ?? presets.molten)
  return withDirection(config, direction)
}

type GL = WebGL2RenderingContext

function program(gl: GL, fragment: string): { program: WebGLProgram; u: (name: string) => WebGLUniformLocation | null } {
  const compile = (type: number, source: string): WebGLShader => {
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`shader compile failed: ${gl.getShaderInfoLog(shader)}`)
    return shader
  }
  const p = gl.createProgram()!
  gl.attachShader(p, compile(gl.VERTEX_SHADER, fullscreenVert))
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fragment))
  gl.bindAttribLocation(p, 0, 'position')
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`shader link failed: ${gl.getProgramInfoLog(p)}`)
  const cache = new Map<string, WebGLUniformLocation | null>()
  return {
    program: p,
    u: (name) => {
      if (!cache.has(name)) cache.set(name, gl.getUniformLocation(p, name))
      return cache.get(name)!
    }
  }
}

interface Target {
  texture: WebGLTexture
  framebuffer: WebGLFramebuffer
}

/**
 * A render target. Half float where the GPU can render to it (smooth gradients
 * without banding), else 8-bit with dither on the last pass.
 */
function target(gl: GL, width: number, height: number, half: boolean): Target {
  const texture = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texImage2D(gl.TEXTURE_2D, 0, half ? gl.RGBA16F : gl.RGBA8, width, height, 0, gl.RGBA, half ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  const framebuffer = gl.createFramebuffer()!
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
  return { texture, framebuffer }
}

function start(canvas: HTMLCanvasElement, config: DriftConfig): () => void {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' })
  if (!gl) throw new Error('WebGL2 not supported')

  canvas.width = WIDTH
  canvas.height = HEIGHT
  const half = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float')
  const fboWidth = Math.round(WIDTH / config.blurDownsample)
  const fboHeight = Math.round(HEIGHT / config.blurDownsample)
  let read = target(gl, fboWidth, fboHeight, half)
  let write = target(gl, fboWidth, fboHeight, half)
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('framebuffer incomplete')
  const swap = (): void => {
    ;[read, write] = [write, read]
  }

  // One triangle covering the screen.
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  gl.disable(gl.DEPTH_TEST)
  gl.disable(gl.BLEND)

  const circlesPass = program(gl, circlesFrag)
  const blurPass = program(gl, blurFrag)
  const distortPass = program(gl, distortFrag)
  const circles = makeCircles(config)

  // What doesn't change frame to frame.
  gl.useProgram(circlesPass.program)
  gl.uniform2f(circlesPass.u('u_size'), WIDTH, HEIGHT)
  gl.uniform3fv(circlesPass.u('u_background'), hexToRgb(config.background))
  gl.uniform1i(circlesPass.u('u_count'), circles.length)
  gl.uniform3fv(circlesPass.u('u_color'), circles.flatMap((_, i) => hexToRgb(config.palette[i % config.palette.length])))
  gl.uniform1f(circlesPass.u('u_opacity'), config.opacity)
  gl.uniform1f(circlesPass.u('u_feather'), config.feather)
  gl.useProgram(blurPass.program)
  gl.uniform2f(blurPass.u('u_resolution'), fboWidth, fboHeight)
  gl.uniform1f(blurPass.u('u_sigma'), config.blurSigma)
  gl.useProgram(distortPass.program)
  const { azimuth, elevation } = config.light
  gl.uniform3f(distortPass.u('u_lightDir'), Math.cos(azimuth) * Math.cos(elevation), Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation))
  gl.uniform1f(distortPass.u('u_specIntensity'), config.light.intensity)
  gl.uniform1f(distortPass.u('u_specPower'), config.light.gloss)
  gl.uniform1f(distortPass.u('u_waveAmp'), config.wave.enabled ? config.wave.amp : 0)
  gl.uniform1f(distortPass.u('u_waveScale'), config.wave.scale)
  gl.uniform1f(distortPass.u('u_dither'), half ? 0 : 1)
  const layer = (i: 1 | 2, l: DistortLayerConfig): void => {
    gl.uniform1f(distortPass.u(`u_on${i}`), l.enabled ? 1 : 0)
    gl.uniform1f(distortPass.u(`u_axis${i}`), l.axis === 'y' ? 1 : 0)
    gl.uniform1f(distortPass.u(`u_cells${i}`), l.cells)
    gl.uniform1f(distortPass.u(`u_strength${i}`), l.strength)
    gl.uniform1f(distortPass.u(`u_bulge${i}`), l.bulge)
    gl.uniform1f(distortPass.u(`u_soft${i}`), l.soft)
    gl.uniform1f(distortPass.u(`u_shading${i}`), l.shading)
    gl.uniform1f(distortPass.u(`u_jitter${i}`), l.jitter)
    gl.uniform1f(distortPass.u(`u_blend${i}`), l.blend)
  }
  layer(1, config.distort1)
  layer(2, config.distort2)

  const positions = new Float32Array(MAX_CIRCLES * 3)
  const draw = (time: number): void => {
    // Circles, into the framebuffer.
    const minDim = Math.min(WIDTH, HEIGHT)
    const t = time * config.driftSpeed
    circles.forEach((c, i) => {
      const dx = c.x.a1 * Math.sin(t * c.x.f1 + c.x.p1) + c.x.a2 * Math.sin(t * c.x.f2 + c.x.p2)
      const dy = c.y.a1 * Math.sin(t * c.y.f1 + c.y.p1) + c.y.a2 * Math.sin(t * c.y.f2 + c.y.p2)
      positions[i * 3] = c.base.x * WIDTH + dx * config.driftAmplitude * minDim
      positions[i * 3 + 1] = c.base.y * HEIGHT + dy * config.driftAmplitude * minDim
      positions[i * 3 + 2] = c.radius * minDim
    })
    gl.viewport(0, 0, fboWidth, fboHeight)
    gl.useProgram(circlesPass.program)
    gl.uniform3fv(circlesPass.u('u_circle'), positions)
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.framebuffer)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    swap()

    // Blur across, then down, staying in the framebuffer.
    gl.useProgram(blurPass.program)
    for (const direction of [
      [1, 0],
      [0, 1]
    ]) {
      gl.uniform2f(blurPass.u('u_direction'), direction[0], direction[1])
      gl.bindTexture(gl.TEXTURE_2D, read.texture)
      gl.bindFramebuffer(gl.FRAMEBUFFER, write.framebuffer)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      swap()
    }

    // The glass, onto the screen at full size.
    gl.viewport(0, 0, WIDTH, HEIGHT)
    gl.useProgram(distortPass.program)
    gl.uniform1f(distortPass.u('u_wavePhase'), config.wave.phase + time * config.wave.phaseSpeed)
    gl.uniform2f(distortPass.u('u_waveOffset'), time * config.wave.moveX, time * config.wave.moveY)
    gl.bindTexture(gl.TEXTURE_2D, read.texture)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  let time = 0
  let last: number | null = null
  let raf = 0
  const pace = pacer()
  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame)
    // Nothing to draw for while a game or app is in front; pick up where it left off.
    if (document.hidden) {
      last = null
      return
    }
    // On battery, fewer frames (the time since the last one still counts).
    if (!pace(now)) return
    time += last === null ? 0 : Math.min((now - last) / 1000, 0.25)
    last = now
    draw(time)
  }
  raf = requestAnimationFrame(frame)

  return () => {
    cancelAnimationFrame(raf)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}

/**
 * Gradient Drift in the chosen colours. Calls onUnavailable if WebGL2 can't run it.
 * Each palette gets a canvas of its own: the last one's WebGL context is released when
 * it stops, and a canvas hands back that same (lost) context if asked again.
 */
export function DriftBackground({
  preset,
  direction,
  onUnavailable
}: {
  preset: string
  direction: DriftDirection
  onUnavailable: () => void
}) {
  return <DriftCanvas key={`${preset}:${direction}`} preset={preset} direction={direction} onUnavailable={onUnavailable} />
}

function DriftCanvas({ preset, direction, onUnavailable }: { preset: string; direction: DriftDirection; onUnavailable: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    try {
      return start(canvas.current!, driftConfig(preset, direction))
    } catch (err) {
      console.error('steamtv: drift backdrop unavailable:', err)
      onUnavailable()
      return undefined
    }
  }, [preset, direction, onUnavailable])

  return <canvas className="stage-canvas" ref={canvas} />
}
