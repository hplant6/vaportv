import { DEFAULT_SUN_TIMES, type SunTimes } from '../../../shared/sun'
import type { BackdropTime } from '../../../shared/types'
import { WEATHER_CHANGED_EVENT } from '../components/LocationDialog'
import { BACKDROP_CHANGED_EVENT } from './SeaBackground'
import { heldMinutes, minutesOfDay, pinnedMinutes, sceneAt } from './timeOfDay'
import { stageHeight } from '../stage'
import { pacer } from './pace'

// Runs a backdrop that is one full-screen fragment shader (Northern Lights, Desert Dunes):
// one draw call a frame, so it's about as light as the sea. The shader gets the time of
// day as uniforms, and its colours from a list of looks keyed by sceneAt's `sun`.

const WIDTH = 1920
const HEIGHT = stageHeight()
const SUN_REFRESH = 60 * 60 * 1000

/** One look: '#rrggbb' colours become vec3 uniforms (sRGB, 0..1), numbers become floats. */
export type Look = Record<string, string | number>

/** Looks keyed by sceneAt's `sun` (0 sunrise, 1 sunset, 1..2 overnight), in order; it wraps from the last to the first. */
export type Looks = [at: number, look: Look][]

/** Shared GLSL: hashes, value noise and fbm in 1D and 2D, and stars. */
export const NOISE = /*glsl*/ `
// Hashes without sin (Dave Hoskins' hash11 / hash12), which stay even at large inputs on every GPU.
float hash1(float n) {
  n = fract(n * 0.1031);
  n *= n + 33.33;
  n *= n + n;
  return fract(n);
}
float hash2(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
// (Not noise1 / noise2: those names are reserved built-ins in GLSL ES.)
float vnoise1(float x) {
  float i = floor(x);
  float f = fract(x);
  return mix(hash1(i), hash1(i + 1.0), f * f * (3.0 - 2.0 * f));
}
float vnoise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm1(float x) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise1(x);
    x = x * 2.03 + 17.0;
    a *= 0.5;
  }
  return v;
}
float fbm2(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise2(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p;
    a *= 0.5;
  }
  return v;
}
// Soft stars on a grid of cells, density of them lit; uv in screen units (height = 1).
float stars(vec2 uv, float scale, float density) {
  vec2 g = uv * scale;
  vec2 cell = floor(g);
  vec2 centre = cell + 0.5 + 0.35 * (vec2(hash2(cell + 1.3), hash2(cell + 7.1)) - 0.5);
  float point = 1.0 - smoothstep(0.05, 0.22, length(g - centre));
  float twinkle = 0.75 + 0.25 * sin(uT * (1.0 + 2.0 * hash2(cell + 3.3)) + 6.28 * hash2(cell));
  return step(1.0 - density, hash2(cell)) * point * (0.3 + 0.7 * hash2(cell + 5.0)) * twinkle;
}
`

const VERTEX = 'attribute vec2 a;\nvoid main() { gl_Position = vec4(a, 0.0, 1.0); }'

/** What every shader is given besides its look's own uniforms. */
const HEADER = /*glsl*/ `precision highp float;
uniform vec2 uR;      // canvas size in pixels
uniform float uT;     // seconds since the backdrop started
uniform float uSun;   // sceneAt's sun: 0 sunrise, 1 sunset, 1..2 overnight
uniform float uStars; // 0..1 star visibility
`

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`shader compile failed: ${gl.getShaderInfoLog(shader)}`)
  return shader
}

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number]

/** The two looks either side of `sun`, and how far between them it is. */
function between(looks: Looks, sun: number): [Look, Look, number] {
  for (let i = 0; i < looks.length; i++) {
    const [from, a] = looks[i]
    const [to, b] = looks[(i + 1) % looks.length]
    const end = i + 1 < looks.length ? to : to + 2
    const s = sun < looks[0][0] ? sun + 2 : sun
    if (s >= from && s < end) return [a, b, (s - from) / (end - from)]
  }
  return [looks[0][1], looks[0][1], 0]
}

/**
 * Starts `fragment` (declare the look's uniforms yourself; HEADER's are declared for you) on
 * `canvas`, drawn at `scale` of the stage's size and stretched to fill it, or with `native` at
 * the screen's own pixels (sharp on a 4K TV, where the stage is scaled up). Each of `textures`
 * is drawn for the canvas's size and handed to the sampler2D uniform of its name (transparent
 * until it's ready; row 0 at the bottom, like gl_FragCoord). Returns a stop function.
 */
export function startShaderBackdrop(
  canvas: HTMLCanvasElement,
  {
    fragment,
    looks,
    scale = 1,
    native = false,
    textures = {}
  }: { fragment: string; looks: Looks; scale?: number; native?: boolean; textures?: Record<string, (width: number, height: number) => Promise<TexImageSource>> }
): () => void {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' })
  if (!gl) throw new Error('WebGL not supported')

  const program = gl.createProgram()!
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX))
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, HEADER + fragment))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`shader link failed: ${gl.getProgramInfoLog(program)}`)
  gl.useProgram(program)

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const position = gl.getAttribLocation(program, 'a')
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

  const pixels = native ? (window.innerWidth * window.devicePixelRatio) / WIDTH : scale
  canvas.width = Math.round(WIDTH * pixels)
  canvas.height = Math.round(HEIGHT * pixels)
  gl.viewport(0, 0, canvas.width, canvas.height)
  gl.uniform2f(gl.getUniformLocation(program, 'uR'), canvas.width, canvas.height)
  const uTime = gl.getUniformLocation(program, 'uT')
  const uSun = gl.getUniformLocation(program, 'uSun')
  const uStars = gl.getUniformLocation(program, 'uStars')
  const lookUniforms = Object.keys(looks[0][1]).map((name) => [name, gl.getUniformLocation(program, name)] as const)

  let stopped = false
  Object.entries(textures).forEach(([name, draw], unit) => {
    const texture = gl.createTexture()
    const bind = (): void => {
      gl.activeTexture(gl.TEXTURE0 + unit)
      gl.bindTexture(gl.TEXTURE_2D, texture)
    }
    bind()
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4))
    gl.uniform1i(gl.getUniformLocation(program, name), unit)
    draw(canvas.width, canvas.height).then(
      (image) => {
        if (stopped) return
        bind()
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
      },
      (err) => console.error(`steamtv: backdrop texture ${name} unavailable:`, err)
    )
  })

  let sun: SunTimes = DEFAULT_SUN_TIMES
  const loadSun = (): void => {
    window.steamtv.getSunTimes().then((times) => {
      if (times) sun = times
    })
  }
  loadSun()
  const sunTimer = setInterval(loadSun, SUN_REFRESH)
  window.addEventListener(WEATHER_CHANGED_EVENT, loadSun)
  let held: BackdropTime = 'auto'
  const loadHeld = (): void => {
    window.steamtv.getBackdrop().then(({ time }) => (held = time))
  }
  loadHeld()
  window.addEventListener(BACKDROP_CHANGED_EVENT, loadHeld)
  const pinned = pinnedMinutes()

  let time = 0
  let last: number | null = null
  let raf = 0
  const pace = pacer()
  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame)
    // Nothing to draw for while a game or app is in front; on battery, fewer frames.
    if (document.hidden) {
      last = null
      return
    }
    if (!pace(now)) return
    time += last === null ? 0 : Math.min((now - last) / 1000, 0.1)
    last = now

    const state = sceneAt(pinned ?? heldMinutes(held, sun) ?? minutesOfDay(new Date()), sun)
    const [a, b, t] = between(looks, state.sun)
    for (const [name, location] of lookUniforms) {
      const from = a[name]
      const to = b[name]
      if (typeof from === 'number' && typeof to === 'number') gl.uniform1f(location, from + (to - from) * t)
      else {
        const p = rgb(from as string)
        const q = rgb(to as string)
        gl.uniform3f(location, p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t)
      }
    }
    gl.uniform1f(uTime, time)
    gl.uniform1f(uSun, state.sun)
    gl.uniform1f(uStars, state.stars)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }
  raf = requestAnimationFrame(frame)

  return () => {
    stopped = true
    cancelAnimationFrame(raf)
    clearInterval(sunTimer)
    window.removeEventListener(WEATHER_CHANGED_EVENT, loadSun)
    window.removeEventListener(BACKDROP_CHANGED_EVENT, loadHeld)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}
