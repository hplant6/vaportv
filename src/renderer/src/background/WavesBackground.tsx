import { useEffect, useRef } from 'react'
import { stageHeight } from '../stage'
import { pacer } from './pace'

// Chromatic Waves: RGB-split sine lines on black, each colour sampling the wave at a
// slightly shifted x, so the lines fringe red and blue as they curve. A port of the
// CodePen "GLSL Sample027" by Web_yuki1027 (MIT), as tuned for itshenry.me: the dark
// band through the middle and the navy tint over it are from that tuning.

const WIDTH = 1920
// The stage's height (taller than 1080 on a taller screen, e.g. a Steam Deck's).
const HEIGHT = stageHeight()

/** How fast the waves travel (the site's tuning; the pen's own was a little faster). */
const SPEED = 0.6

const VERTEX = /*glsl*/ `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const FRAGMENT = /*glsl*/ `#version 300 es
precision highp float;

uniform vec2 resolution;
uniform float time;
out vec4 color;

const float X_SCALE = 1.0;      // wave frequency
const float Y_SCALE = 0.5;      // wave amplitude
const float DISTORTION = 0.05;  // colour split, growing away from the centre
const float INTENSITY = 0.05;   // line brightness and thickness
const float SCRIM = 0.5;        // a softly darker band through the middle, where the lines meet
const float SCRIM_SIZE = 0.5;
const vec3 TINT = vec3(2.0, 2.0, 32.0) / 255.0;  // navy laid over it all...
const float TINT_ALPHA = 0.65;                   // ...this strongly

void main() {
  vec2 p = (gl_FragCoord.xy * 2.0 - resolution) / min(resolution.x, resolution.y);
  float d = length(p) * DISTORTION;
  float rx = p.x * (1.0 + d);
  float gx = p.x;
  float bx = p.x * (1.0 - d);
  float r = INTENSITY / abs(p.y + sin((rx + time) * X_SCALE) * Y_SCALE);
  float g = INTENSITY / abs(p.y + sin((gx + time) * X_SCALE) * Y_SCALE);
  float b = INTENSITY / abs(p.y + sin((bx + time) * X_SCALE) * Y_SCALE);
  vec3 col = min(vec3(r, g, b), vec3(1.0));
  float band = smoothstep(SCRIM_SIZE, 0.0, abs(p.y));
  col *= mix(1.0, 1.0 - SCRIM, band);
  color = vec4(mix(col, TINT, TINT_ALPHA), 1.0);
}
`

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`shader compile failed: ${gl.getShaderInfoLog(shader)}`)
  return shader
}

function start(canvas: HTMLCanvasElement): () => void {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' })
  if (!gl) throw new Error('WebGL2 not supported')
  canvas.width = WIDTH
  canvas.height = HEIGHT

  const program = gl.createProgram()!
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX))
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT))
  gl.bindAttribLocation(program, 0, 'position')
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`shader link failed: ${gl.getProgramInfoLog(program)}`)
  gl.useProgram(program)
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  gl.viewport(0, 0, WIDTH, HEIGHT)
  gl.uniform2f(gl.getUniformLocation(program, 'resolution'), WIDTH, HEIGHT)
  const uTime = gl.getUniformLocation(program, 'time')

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
    time += last === null ? 0 : Math.min((now - last) / 1000, 0.1) * SPEED
    last = now
    gl.uniform1f(uTime, time)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
  raf = requestAnimationFrame(frame)

  return () => {
    cancelAnimationFrame(raf)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}

/** The chromatic waves backdrop. Calls onUnavailable if WebGL2 can't run it. */
export function WavesBackground({ onUnavailable }: { onUnavailable: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    try {
      return start(canvas.current!)
    } catch (err) {
      console.error('steamtv: waves backdrop unavailable:', err)
      onUnavailable()
      return undefined
    }
  }, [onUnavailable])

  return <canvas className="stage-canvas" ref={canvas} />
}
