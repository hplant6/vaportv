import { useEffect, useRef } from 'react'

// Star Tunnel: flying slowly down a tube of glowing dots, the tube turning as it
// goes. A port of the CodePen "Star Tunnel" by alphardex (pen XWZKzjE, MIT), with
// the red, blue and violet tuning made for itshenry.me (Nebula) and other colourings,
// one of them plain starlight.

export type TunnelColors = 'nebula' | 'starlight' | 'ice' | 'ember'

/** Each look's three colours; every dot is one of them (about 39% / 33% / 28%). */
const PALETTES: Record<TunnelColors, [string, string, string]> = {
  nebula: ['#610000', '#002885', '#5400a8'],
  starlight: ['#ffffff', '#c9dbff', '#ffe9c4'],
  ice: ['#7fe7ff', '#2f6bff', '#e8f6ff'],
  ember: ['#ff3d00', '#ff9a1f', '#ffd36b']
}

const rgb = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)

const WIDTH = 1920
const HEIGHT = 1080

/** The original pen's count (the site's tuning had 30,000): sparser, more like open space. */
const COUNT = 10000
const TUBE_LENGTH = 1550
/** The dots sit between these two radii (the tuning has them this way round). */
const TUBE_INNER_R = 80
const TUBE_OUTER_R = 16
/** Base dot size (the site's was 5.9, soft and large; smaller reads as stars). */
const POINT_SIZE = 2.5
/** No star grows past this up close, however near it passes. */
const MAX_POINT_SIZE = 6.0
/** Half the site's speed: a slow drift rather than a flight. */
const VELOCITY = 0.004
/** Turn per second in radians: half the site's (its angular velocity 0.076 x 0.01 per frame at 60 fps). */
const TURN_PER_SECOND = 0.076 * 0.01 * 60 * 0.5
const FOV = 55
const CAMERA_Z = 1000

const VERTEX = /*glsl*/ `#version 300 es
uniform mat4 projection;
uniform mat4 modelView;
uniform float time;
in vec3 position;
in vec2 seed;
in float size;
out float randColor;

void main() {
  vec3 p = position;
  // Scroll down the tube; mod wraps the dots round rather than off to infinity.
  p.z = mod(p.z + time * 1000.0 * ${VELOCITY}, ${TUBE_LENGTH.toFixed(1)});
  vec4 mv = modelView * vec4(p, 1.0);
  gl_Position = projection * mv;
  // Perspective size: far dots are smaller.
  // Perspective size: far stars are smaller; near ones stop at a cap, and none goes
  // under a pixel (or they flicker as they move).
  gl_PointSize = clamp(size * (200.0 / -mv.z), 1.0, ${MAX_POINT_SIZE.toFixed(1)});
  randColor = fract(sin(dot(seed, vec2(12.9898, 78.233))) * 43758.5453);
}
`

const FRAGMENT = /*glsl*/ `#version 300 es
precision highp float;
in float randColor;
out vec4 color;

uniform vec3 color1;
uniform vec3 color2;
uniform vec3 color3;
const float MIX_1 = 0.39;    // below: colour 1
const float MIX_2 = 0.72;    // below: colour 2, else colour 3
const float SOFTNESS = 0.35;  // edge feather: a crisp disc with a little glow (the site's 2.0 was fully soft)

void main() {
  vec3 c = randColor < MIX_1 ? color1 : randColor < MIX_2 ? color2 : color3;
  vec2 dist = gl_PointCoord - 0.5;
  float shape = 1.0 - smoothstep(1.0 - SOFTNESS, 1.0, dot(dist, dist) * 4.0);
  color = vec4(c * shape, 1.0);
}
`

/** Column-major perspective projection. */
function perspective(fovDegrees: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan((fovDegrees * Math.PI) / 360)
  const nf = 1 / (near - far)
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0])
}

/** The camera CAMERA_Z down the axis looking back at the origin, the tube turned by `angle`. */
function modelView(angle: number): Float32Array {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, -CAMERA_Z, 1])
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`shader compile failed: ${gl.getShaderInfoLog(shader)}`)
  return shader
}

function start(canvas: HTMLCanvasElement, colors: TunnelColors): () => void {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' })
  if (!gl) throw new Error('WebGL2 not supported')
  canvas.width = WIDTH
  canvas.height = HEIGHT

  const program = gl.createProgram()!
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX))
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT))
  gl.bindAttribLocation(program, 0, 'position')
  gl.bindAttribLocation(program, 1, 'seed')
  gl.bindAttribLocation(program, 2, 'size')
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`shader link failed: ${gl.getProgramInfoLog(program)}`)
  gl.useProgram(program)

  // The dots: a random spot on the tube's shell, a colour seed, a size.
  const positions = new Float32Array(COUNT * 3)
  const seeds = new Float32Array(COUNT * 2)
  const sizes = new Float32Array(COUNT)
  for (let i = 0; i < COUNT; i++) {
    const theta = Math.random() * Math.PI * 2
    const r = TUBE_INNER_R + Math.random() * (TUBE_OUTER_R - TUBE_INNER_R)
    positions.set([r * Math.cos(theta), r * Math.sin(theta), Math.random() * TUBE_LENGTH], i * 3)
    seeds.set([Math.random(), Math.random()], i * 2)
    sizes[i] = POINT_SIZE + Math.random()
  }
  const attribute = (index: number, data: Float32Array, components: number): void => {
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(index)
    gl.vertexAttribPointer(index, components, gl.FLOAT, false, 0, 0)
  }
  attribute(0, positions, 3)
  attribute(1, seeds, 2)
  attribute(2, sizes, 1)

  gl.viewport(0, 0, WIDTH, HEIGHT)
  gl.uniformMatrix4fv(gl.getUniformLocation(program, 'projection'), false, perspective(FOV, WIDTH / HEIGHT, 0.1, 10000))
  const palette = PALETTES[colors] ?? PALETTES.nebula
  palette.forEach((hex, i) => gl.uniform3fv(gl.getUniformLocation(program, `color${i + 1}`), rgb(hex)))
  const uModelView = gl.getUniformLocation(program, 'modelView')
  const uTime = gl.getUniformLocation(program, 'time')
  // The dots add up where they overlap, so the tube glows.
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.ONE, gl.ONE)
  gl.clearColor(0, 0, 0, 1)

  let time = 0
  let last: number | null = null
  let raf = 0
  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame)
    // Nothing to draw for while a game or app is in front; pick up where it left off.
    if (document.hidden) {
      last = null
      return
    }
    time += last === null ? 0 : Math.min((now - last) / 1000, 0.1)
    last = now
    gl.uniform1f(uTime, time)
    gl.uniformMatrix4fv(uModelView, false, modelView(time * TURN_PER_SECOND))
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.POINTS, 0, COUNT)
  }
  raf = requestAnimationFrame(frame)

  return () => {
    cancelAnimationFrame(raf)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}

/**
 * The star tunnel backdrop in the chosen colours. Calls onUnavailable if WebGL2 can't
 * run it. A new canvas for each colouring: a canvas hands back its old, released context.
 */
export function StarTunnelBackground({ colors, onUnavailable }: { colors: TunnelColors; onUnavailable: () => void }) {
  return <TunnelCanvas key={colors} colors={colors} onUnavailable={onUnavailable} />
}

function TunnelCanvas({ colors, onUnavailable }: { colors: TunnelColors; onUnavailable: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    try {
      return start(canvas.current!, colors)
    } catch (err) {
      console.error('steamtv: star tunnel backdrop unavailable:', err)
      onUnavailable()
      return undefined
    }
  }, [colors, onUnavailable])

  return <canvas className="stage-canvas" ref={canvas} />
}
