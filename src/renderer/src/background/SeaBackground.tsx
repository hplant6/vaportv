import { useEffect, useRef } from 'react'
import { DEFAULT_SUN_TIMES, type SunTimes } from '../../../shared/sun'
import { WEATHER_CHANGED_EVENT } from '../components/LocationDialog'
import { FS, VS } from './seaShader'
import { heldMinutes, minutesOfDay, sceneAt } from './timeOfDay'
import type { BackdropTime } from '../../../shared/types'

/** Fired by Settings after the backdrop time changes. */
export const BACKDROP_CHANGED_EVENT = 'steamtv:backdrop-changed'

// Render at the stage size; the stage itself is scaled up to the display.
const WIDTH = 1920
const HEIGHT = 1080

// Adaptive render scale, as in the original pen but allowed to drop further:
// the scene is soft enough to upscale and the box's GPU is shared with games.
const QUALITY_MIN = 0.5
const QUALITY_MAX = 1.0
const QUALITY_STEP_DOWN = 0.08
const QUALITY_STEP_UP = 0.04
const FPS_LOW = 50
const FPS_HIGH = 57
const FPS_WINDOW = 0.75
const FPS_LOW_GRACE = 1.5
const FPS_HIGH_GRACE = 3.0

const SUN_REFRESH = 60 * 60 * 1000

/** Dev aid: ?time=HH:MM pins the scene to that time of day. */
function pinnedMinutes(): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(new URLSearchParams(location.search).get('time') ?? '')
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`shader compile failed: ${gl.getShaderInfoLog(shader)}`)
  }
  return shader
}

function start(canvas: HTMLCanvasElement): () => void {
  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance'
  })
  if (!gl) throw new Error('WebGL not supported')

  const program = gl.createProgram()!
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VS))
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FS))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`shader link failed: ${gl.getProgramInfoLog(program)}`)
  }
  gl.useProgram(program)
  gl.disable(gl.DEPTH_TEST)
  gl.disable(gl.CULL_FACE)
  gl.disable(gl.BLEND)
  gl.disable(gl.DITHER)

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const position = gl.getAttribLocation(program, 'a')
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

  const uniform = (name: string): WebGLUniformLocation | null => gl.getUniformLocation(program, name)
  const uResolution = uniform('uR')
  const uTime = uniform('uT')
  const uScene = uniform('uSc')
  const uBlend = uniform('uBl')
  const uSun = uniform('uSun')
  const uStars = uniform('uStars')
  const uStorm = uniform('uStorm')

  let quality = QUALITY_MAX
  const resize = (): void => {
    canvas.width = Math.round(WIDTH * quality)
    canvas.height = Math.round(HEIGHT * quality)
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.uniform2f(uResolution, canvas.width, canvas.height)
  }
  resize()

  let fpsTime = 0
  let fpsFrames = 0
  let lowTime = 0
  let highTime = 0
  const adaptQuality = (dt: number): void => {
    fpsTime += dt
    fpsFrames++
    if (fpsTime < FPS_WINDOW) return
    const fps = fpsFrames / fpsTime
    fpsTime = fpsFrames = 0
    lowTime = fps < FPS_LOW ? lowTime + FPS_WINDOW : 0
    highTime = fps > FPS_HIGH ? highTime + FPS_WINDOW : 0

    let next = quality
    if (lowTime >= FPS_LOW_GRACE) next = Math.max(QUALITY_MIN, quality - QUALITY_STEP_DOWN)
    else if (highTime >= FPS_HIGH_GRACE) next = Math.min(QUALITY_MAX, quality + QUALITY_STEP_UP)
    if (next !== quality) {
      quality = next
      lowTime = highTime = 0
      resize()
    }
  }

  let sun: SunTimes = DEFAULT_SUN_TIMES
  const loadSun = (): void => {
    window.steamtv.getSunTimes().then((times) => {
      if (times) sun = times
    })
  }
  loadSun()
  const sunTimer = setInterval(loadSun, SUN_REFRESH)
  // A new place has its own sunrise and sunset.
  window.addEventListener(WEATHER_CHANGED_EVENT, loadSun)

  let held: BackdropTime = 'auto'
  const loadHeld = (): void => {
    window.steamtv.getBackdrop().then(({ time }) => (held = time))
  }
  loadHeld()
  window.addEventListener(BACKDROP_CHANGED_EVENT, loadHeld)

  const pinned = pinnedMinutes()
  const t0 = performance.now()
  let last = t0
  let raf = 0
  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame)
    const dt = (now - last) / 1000
    last = now
    // Nothing to draw for while a game or app is in front.
    if (document.hidden) return
    // A long gap is a pause, not a slow frame; don't let it drag quality down.
    if (dt < 0.25) adaptQuality(dt)

    const state = sceneAt(pinned ?? heldMinutes(held, sun) ?? minutesOfDay(new Date()), sun)
    gl.uniform1f(uTime, (now - t0) / 1000)
    gl.uniform1f(uScene, state.scene)
    gl.uniform1f(uBlend, state.blend)
    gl.uniform1f(uSun, state.sun)
    gl.uniform1f(uStars, state.stars)
    // Storm is weather rather than a time of day; not driven yet.
    gl.uniform1f(uStorm, 0)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }
  raf = requestAnimationFrame(frame)

  return () => {
    cancelAnimationFrame(raf)
    clearInterval(sunTimer)
    window.removeEventListener(WEATHER_CHANGED_EVENT, loadSun)
    window.removeEventListener(BACKDROP_CHANGED_EVENT, loadHeld)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}

/** Animated sea whose time of day follows the clock (or the time held in Settings). Calls onUnavailable if WebGL can't run it. */
export function SeaBackground({ onUnavailable }: { onUnavailable: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    try {
      return start(canvas.current!)
    } catch (err) {
      console.error('steamtv: sea background unavailable:', err)
      onUnavailable()
      return undefined
    }
  }, [onUnavailable])

  return <canvas className="stage-canvas" ref={canvas} />
}
