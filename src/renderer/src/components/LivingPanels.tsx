import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { markReleased, useGpuGeneration } from '../background/gpuRecovery'
import { pacer } from '../background/pace'
import { STAGE_W, stageHeight } from '../stage'

// Panels as flat cards in 3D: the tinted shapes behind a screen's lists (Settings' sidebar and
// its panes, for a start) drawn instead by one WebGL canvas behind them. The one the cursor is
// in lifts a little and tips toward the cursor: its first item brings the top edge forward,
// its last the bottom, those between in proportion; it springs there and back. What comes
// toward you brightens and what goes away darkens, so the cursor's side catches the light;
// a hairline edge shows only where it has come toward you. Each casts a soft
// shadow. The DOM keeps everything on top (text stays sharp);
// only the panels' own backgrounds are drawn here, so the screen marks itself `.living` to drop
// them, and keeps them if WebGL can't start.
//
// One full-screen fragment shader at the screen's own pixels (sharp on a 4K TV), drawn only
// while something moves: once the springs settle it draws nothing at all.

/** How the slabs sit, move and are lit; lengths in stage px. */
export const LOOK = {
  depth: 21.5, // how far the cursor's edge comes toward you (and the far one goes away), at the first or last item
  lightDepth: 64, // the depth at which `near`, `far` and `edgeNear` reach their full strength
  lift: 10, // how far the panel the cursor is in rises toward you
  perspective: 1800, // the eye's distance from the screen
  near: 0.3, // brightening (alpha) where the card comes `lightDepth` toward you…
  far: 0.4, // …and darkening where it goes `lightDepth` away
  edge: 1.5, // the hairline edge's width
  edgeNear: 0.55, // the hairline's shine where the card comes `lightDepth` toward you: none where it's level or going away
  shadow: 0.45, // the shadow at its deepest
  shadowDistance: 6, // how far below and right the shadow falls, at rest
  stiffness: 70, // the spring: how quickly it follows the cursor…
  damping: 12, // …and how much it settles (critical is about 17: a little overshoot)
  light: [190, 147, 111] as [number, number, number] // the light's colour: --color-panel's
}

type RGBA = [number, number, number, number]
/** Settings' panels: --color-panel. */
const PANEL_FILL: RGBA = [190, 147, 111, 0.08]

const MAX_PANELS = 8

/** A set of panels to draw: everything matching `selector` inside the canvas's parent. */
export type PanelSet = {
  selector: string
  /** Fade in from the top as the panels pass under a masked edge: [from, to] px below the top of the element matching `fade.of`. */
  fade?: { of: string; from: number; to: number }
  /** The flat colour (0–255) and alpha, Settings' panels' by default… */
  fill?: RGBA
  /** …and while the cursor's in it. */
  focusFill?: RGBA
  /** The cursor counts as in the panel while it's in this ancestor of it (for a panel beside what it's behind, not around it). */
  focusIn?: string
  /** No shadow while it lies flat (the cursor elsewhere): only as it lifts and tips. */
  shadowOnlyMoving?: boolean
  /** Blur what's behind the panel by this much (px), on a layer under the drawing turned with it. */
  blur?: number
}

// Every screen's panels, here with LOOK, so the effect is tuned in one place for all of them.

/** Settings: its sidebar and its pane's panels (the pane fades them at its top, as its mask does in app.css). */
export const SETTINGS_PANELS: PanelSet[] = [
  { selector: '.settings-sidebar' },
  { selector: '.settings-pane .settings-group', fade: { of: '.settings-pane', from: 73, to: 101 } }
]

/** The tabs' left column (SideBar): darker than Settings' (its options read over a bright backdrop), and darker again while the cursor's in it. */
export const SIDE_BAR_PANELS: PanelSet[] = [{ selector: '.side-bar-panel', focusIn: '.side-bar', shadowOnlyMoving: true, fill: [16, 12, 9, 0.55], focusFill: [16, 12, 9, 0.72] }]

/** Modals (DialogPanels, below): their warm glass, blurring what's behind as their CSS did. */
export const DIALOG_PANELS: PanelSet[] = [{ selector: '.dialog-panel', fill: [53, 41, 31, 0.5], blur: 30 }]

// A panel's `.living-blur` child (a backdrop-filter, say) is turned with it, by a CSS
// transform matching the drawing, so what it blurs keeps the card's shape.

const FRAGMENT = /*glsl*/ `precision highp float;
uniform vec2 uR;     // canvas size in pixels
uniform float uPx;   // canvas pixels per stage px
uniform int uCount;
uniform mat3 uFront[${MAX_PANELS}];  // screen → the face's own coordinates
uniform mat3 uRot[${MAX_PANELS}];    // the slab's turn
uniform vec4 uBox[${MAX_PANELS}];    // half width, half height, lift, shadow (0–1)
uniform vec4 uFade[${MAX_PANELS}];   // fade in from y = x to y = y; corner radius; opacity
uniform vec4 uFill[${MAX_PANELS}];   // flat colour (0–1) and alpha
uniform vec3 uLight;
uniform float uDepth, uNear, uFar, uEdge, uEdgeNear, uShadow, uShadowDist;
float sdBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
vec2 local(mat3 h, vec2 p) {
  vec3 q = h * vec3(p, 1.0);
  return q.xy / q.z;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uR.y - gl_FragCoord.y) / uPx;
  vec4 col = vec4(0.0);
  for (int i = 0; i < ${MAX_PANELS}; i++) {
    if (i >= uCount) break;
    vec2 half_ = uBox[i].xy;
    float lift = uBox[i].z;
    vec2 f = local(uFront[i], p);
    if (any(greaterThan(abs(f), half_ + vec2(70.0)))) continue;
    float fade = smoothstep(uFade[i].x, uFade[i].y, p.y) * uFade[i].w;
    if (fade <= 0.0) continue;
    float radius = uFade[i].z;

    // The face: brighter where it has come toward you, darker where it has gone away.
    float sdF = sdBox(f, half_, radius);
    float face = clamp(0.5 - sdF * uPx, 0.0, 1.0);
    float z = (uRot[i] * vec3(f, 0.0)).z / uDepth;
    float near = max(z, 0.0);
    float dark = clamp(uFar * max(-z, 0.0), 0.0, 1.0);
    // A hairline round the edge, only where it has come toward you, brighter the nearer.
    float line = clamp(0.5 - (abs(sdF + uEdge * 0.5) - uEdge * 0.5) * uPx, 0.0, 1.0);
    float light = clamp(uNear * near + line * uEdgeNear * smoothstep(0.0, 0.6, near), 0.0, 1.0);
    // The flat fill, darkened, then lit.
    vec4 front = vec4(uFill[i].rgb * uFill[i].a, uFill[i].a);
    front = vec4(0.0, 0.0, 0.0, dark) + front * (1.0 - dark);
    front = vec4(uLight * light, light) + front * (1.0 - light);

    // The shadow, falling further as the card lifts.
    float dist = uShadowDist + lift * 1.2;
    vec2 s = local(uFront[i], p - vec2(0.5, 1.0) * dist);
    float blur = 16.0 + lift * 1.5;
    float shadow = (1.0 - smoothstep(-blur * 0.4, blur, sdBox(s, half_, radius))) * uShadow * uBox[i].w * (1.0 - face);

    vec4 here = front * face + vec4(0.0, 0.0, 0.0, shadow);
    col = here * fade + col * (1.0 - here.a * fade);
  }
  gl_FragColor = col;
}
`

const VERTEX = 'attribute vec2 a;\nvoid main() { gl_Position = vec4(a, 0.0, 1.0); }'

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`shader compile failed: ${gl.getShaderInfoLog(shader)}`)
  return shader
}

type M3 = number[] // row-major 3×3

function invert(m: M3): M3 {
  const [a, b, c, d, e, f, g, h, i] = m
  const A = e * i - f * h
  const B = -(d * i - f * g)
  const C = d * h - e * g
  const det = a * A + b * B + c * C
  return [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map((v) => v / det)
}

function multiply(p: M3, q: M3): M3 {
  const out: M3 = []
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out.push(p[r * 3] * q[c] + p[r * 3 + 1] * q[3 + c] + p[r * 3 + 2] * q[6 + c])
  return out
}

/** Row-major into a column-major array at `offset`, as GLSL's mat3 wants. */
function put(target: Float32Array, offset: number, m: M3): void {
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) target[offset + c * 3 + r] = m[r * 3 + c]
}

/** The slab turned by `x` about its horizontal axis and `y` about its vertical one. */
function rotation(x: number, y: number): M3 {
  const [cx, sx, cy, sy] = [Math.cos(x), Math.sin(x), Math.cos(y), Math.sin(y)]
  // Ry · Rx
  return [cy, sy * sx, sy * cx, 0, cx, -sx, -sy, cy * sx, cy * cx]
}

/**
 * The homography taking the slab's own coordinates (u, v), on its plane `w` out from its
 * middle, to the screen; inverted, it takes a screen point back to (u, v).
 */
function projection(R: M3, centre: [number, number, number], w: number, eye: [number, number], D: number): M3 {
  const col = (j: number): [number, number, number] => [R[j], R[3 + j], R[6 + j]]
  const [rx, ry, rz] = [col(0), col(1), col(2)]
  const o: [number, number, number] = [centre[0] + w * rz[0], centre[1] + w * rz[1], centre[2] + w * rz[2]]
  // screen = (P.xy·D − eye·P.z) / (D − P.z), linear in (u, v, 1) above and below.
  const row = (k: 0 | 1): number[] => [D * rx[k] - eye[k] * rx[2], D * ry[k] - eye[k] * ry[2], D * o[k] - eye[k] * o[2]]
  return [...row(0), ...row(1), -rx[2], -ry[2], D - o[2]]
}

type Spring = { x: number; y: number; z: number; vx: number; vy: number; vz: number }

/** Draws `panels` on `canvas` (laid over its parent, at stage size); returns a stop function. */
function startLivingPanels(canvas: HTMLCanvasElement, panels: PanelSet[]): () => void {
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false })
  if (!gl) throw new Error('WebGL not supported')
  const program = gl.createProgram()!
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX))
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`shader link failed: ${gl.getProgramInfoLog(program)}`)
  gl.useProgram(program)
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const position = gl.getAttribLocation(program, 'a')
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
  const u = (name: string): WebGLUniformLocation | null => gl.getUniformLocation(program, name)

  // The screen's own pixels: edges as sharp as the text over them.
  const width = STAGE_W
  const height = stageHeight()
  const px = (canvas.getBoundingClientRect().width / width) * window.devicePixelRatio
  canvas.width = Math.round(width * px)
  canvas.height = Math.round(height * px)
  const eye: [number, number] = [width / 2, height / 2]
  gl.viewport(0, 0, canvas.width, canvas.height)
  gl.uniform2f(u('uR'), canvas.width, canvas.height)
  gl.uniform1f(u('uPx'), px)
  gl.uniform3f(u('uLight'), LOOK.light[0] / 255, LOOK.light[1] / 255, LOOK.light[2] / 255)
  gl.uniform1f(u('uDepth'), LOOK.lightDepth)
  gl.uniform1f(u('uNear'), LOOK.near)
  gl.uniform1f(u('uFar'), LOOK.far)
  gl.uniform1f(u('uEdge'), LOOK.edge)
  gl.uniform1f(u('uEdgeNear'), LOOK.edgeNear)
  gl.uniform1f(u('uShadow'), LOOK.shadow)
  gl.uniform1f(u('uShadowDist'), LOOK.shadowDistance)
  const uCount = u('uCount')
  const uFront = u('uFront[0]')
  const uRot = u('uRot[0]')
  const uBox = u('uBox[0]')
  const uFade = u('uFade[0]')
  const uFill = u('uFill[0]')
  const fronts = new Float32Array(MAX_PANELS * 9)
  const rots = new Float32Array(MAX_PANELS * 9)
  const boxes = new Float32Array(MAX_PANELS * 4)
  const fades = new Float32Array(MAX_PANELS * 4)
  const fills = new Float32Array(MAX_PANELS * 4)

  const root = canvas.parentElement!
  const springs = new Map<Element, Spring>()
  // Blur layers (PanelSet.blur), just under the canvas, one per panel.
  const blurs = new Map<Element, HTMLDivElement>()

  let raf = 0
  let last: number | null = null
  let previous = ''
  const pace = pacer()
  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame)
    if (document.hidden) {
      last = null
      return
    }
    const dt = last === null ? 0 : Math.min((now - last) / 1000, 1 / 30)
    last = now
    const box = canvas.getBoundingClientRect()
    const scale = box.width / width
    const focused = document.activeElement

    let count = 0
    let moving = false
    const seen = new Set<Element>()
    for (const set of panels) {
      let from = -1e5
      let to = -1e5 + 1
      if (set.fade) {
        const of = root.querySelector(set.fade.of)
        if (of) {
          const top = (of.getBoundingClientRect().top - box.top) / scale
          from = top + set.fade.from
          to = top + set.fade.to
        }
      }
      for (const el of root.querySelectorAll(set.selector)) {
        const r = el.getBoundingClientRect()
        const [x, y, w, h] = [(r.left - box.left) / scale, (r.top - box.top) / scale, r.width / scale, r.height / scale]
        if (count >= MAX_PANELS || y > height || y + h < 0 || h === 0) continue
        seen.add(el)

        // Where it wants to be: tipped toward the cursor, if the cursor's in it; else at rest.
        let target = { x: 0, y: 0, z: 0 }
        const scope = set.focusIn ? el.closest(set.focusIn) : el
        if (focused && scope && focused !== scope && scope.contains(focused)) {
          const f = focused.getBoundingClientRect()
          const nx = Math.max(-1, Math.min(1, ((f.left + f.width / 2 - box.left) / scale - (x + w / 2)) / (w / 2)))
          // Up and down by the item's row among the panel's rows of items, not its position: the
          // first row tips the top fully forward, the last the bottom; a single row, the top.
          // (Buttons side by side share a row, and a tilt; left and right goes by position.)
          const middle = (item: Element): number => {
            const b = item.getBoundingClientRect()
            return b.top + b.height / 2
          }
          const rows: number[] = []
          for (const item of scope.querySelectorAll('[data-focusable]')) {
            if (item.getClientRects().length === 0) continue
            const m = middle(item)
            if (!rows.some((row) => Math.abs(row - m) < 8)) rows.push(m)
          }
          rows.sort((a, b) => a - b)
          const mine = middle(focused)
          const index = Math.max(0, rows.findIndex((row) => Math.abs(row - mine) < 8))
          const ny = rows.length > 1 ? (index / (rows.length - 1)) * 2 - 1 : -1
          // A point (u, v) on the face comes to depth ≈ v·x − u·y: bring the cursor's side forward by `depth`.
          target = { x: (LOOK.depth * ny) / (h / 2), y: (-LOOK.depth * nx) / (w / 2), z: LOOK.lift }
        }
        let s = springs.get(el)
        if (!s) springs.set(el, (s = { x: target.x, y: target.y, z: target.z, vx: 0, vy: 0, vz: 0 }))
        for (const k of ['x', 'y', 'z'] as const) {
          const v = `v${k}` as 'vx' | 'vy' | 'vz'
          s[v] += (LOOK.stiffness * (target[k] - s[k]) - LOOK.damping * s[v]) * dt
          s[k] += s[v] * dt
          const unit = k === 'z' ? 1 : 1000 // angles are tiny: compare them in milliradians
          if (Math.abs(s[v]) * unit > 0.01 || Math.abs(target[k] - s[k]) * unit > 0.01) moving = true
        }

        const R = rotation(s.x, s.y)
        const centre: [number, number, number] = [x + w / 2, y + h / 2, s.z]
        put(fronts, count * 9, invert(projection(R, centre, 0, eye, LOOK.perspective)))
        put(rots, count * 9, R)
        const fill = set.fill ?? PANEL_FILL
        const focusFill = set.focusFill ?? fill
        const t = LOOK.lift ? Math.max(0, Math.min(1, s.z / LOOK.lift)) : 0
        fills.set([0, 1, 2].map((k) => (fill[k] + (focusFill[k] - fill[k]) * t) / 255).concat(fill[3] + (focusFill[3] - fill[3]) * t), count * 4)
        const style = getComputedStyle(el)
        const radius = parseFloat(style.borderTopLeftRadius) || 0
        const opacity = parseFloat(style.opacity)
        // A blur turned with the drawing: the panel's own `.living-blur` child, or a layer of ours.
        let blur = el.querySelector<HTMLElement>(':scope > .living-blur')
        if (!blur && set.blur) {
          let layer = blurs.get(el)
          if (!layer) {
            layer = document.createElement('div')
            layer.className = 'living-blur-layer'
            layer.style.backdropFilter = `blur(${set.blur}px)`
            root.insertBefore(layer, canvas)
            blurs.set(el, layer)
          }
          layer.style.left = `${(parseFloat(canvas.style.left) || 0) + x}px`
          layer.style.top = `${(parseFloat(canvas.style.top) || 0) + y}px`
          layer.style.width = `${w}px`
          layer.style.height = `${h}px`
          layer.style.borderRadius = `${radius}px`
          layer.style.opacity = `${opacity}`
          blur = layer
        }
        if (blur) {
          // Into the panel's own CSS px: from its corner to its middle, through the drawing, back to its corner.
          const m = multiply(multiply([1, 0, -x, 0, 1, -y, 0, 0, 1], projection(R, centre, 0, eye, LOOK.perspective)), [1, 0, -w / 2, 0, 1, -h / 2, 0, 0, 1])
          const [a, b, c, d, e, f, g, hh, i] = m.map((v) => v / m[8])
          const transform = `matrix3d(${a},${d},0,${g},${b},${e},0,${hh},0,0,1,0,${c},${f},0,${i})`
          if (blur.style.transform !== transform) blur.style.transform = transform
        }
        boxes.set([w / 2, h / 2, s.z, set.shadowOnlyMoving ? t : 1], count * 4)
        fades.set([from, to, radius, Number.isFinite(opacity) ? opacity : 1], count * 4)
        count++
      }
    }
    for (const el of springs.keys()) if (!seen.has(el)) springs.delete(el)
    for (const [el, layer] of blurs) {
      if (seen.has(el)) continue
      layer.remove()
      blurs.delete(el)
    }

    // Nothing to draw again once it has all come to rest where it was last drawn.
    const key = `${count}:${boxes.join(',')}:${fills.join(',')}:${fades.join(',')}:${fronts.join(',')}`
    const changed = key !== previous
    if (!moving && !changed) return
    if (!pace(now)) return
    previous = key
    gl.uniform1i(uCount, count)
    gl.uniformMatrix3fv(uFront, false, fronts)
    gl.uniformMatrix3fv(uRot, false, rots)
    gl.uniform4fv(uBox, boxes)
    gl.uniform4fv(uFade, fades)
    gl.uniform4fv(uFill, fills)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }
  raf = requestAnimationFrame(frame)

  return () => {
    cancelAnimationFrame(raf)
    for (const layer of blurs.values()) layer.remove()
    markReleased(canvas)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}

function Canvas({ panels }: { panels: PanelSet[] }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current!
    const root = canvas.parentElement!
    // Over the stage, wherever its parent sits on the page.
    canvas.style.left = `${-root.offsetLeft}px`
    canvas.style.top = `${-root.offsetTop}px`
    try {
      const stop = startLivingPanels(canvas, panels)
      root.classList.add('living')
      return () => {
        root.classList.remove('living')
        stop()
      }
    } catch (err) {
      // The panels keep their flat backgrounds.
      console.error('steamtv: living panels unavailable:', err)
      return undefined
    }
  }, [])
  return <canvas ref={ref} className="living-panels" aria-hidden="true" />
}

/** Put first inside the element holding the panels (positioned, stage-sized); it gets `.living` while drawing them. */
export function LivingPanels({ panels }: { panels: PanelSet[] }) {
  const generation = useGpuGeneration()
  return <Canvas key={generation} panels={panels} />
}

/**
 * The modals, wherever they're opened: each `.dialog-backdrop` that appears gets its own
 * LivingPanels (DIALOG_PANELS), so no dialog has to ask for one. Mount once, in App.
 */
const backdropKeys = new WeakMap<Element, string>()
let nextBackdrop = 0
function backdropKey(backdrop: Element): string {
  let key = backdropKeys.get(backdrop)
  if (!key) backdropKeys.set(backdrop, (key = `dialog-panels-${nextBackdrop++}`))
  return key
}

export function DialogPanels() {
  const [backdrops, setBackdrops] = useState<Element[]>([])
  useEffect(() => {
    const update = (): void => {
      const now = [...document.querySelectorAll('.dialog-backdrop')]
      setBackdrops((was) => (was.length === now.length && was.every((el, i) => el === now[i]) ? was : now))
    }
    update()
    const observer = new MutationObserver(update)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])
  return (
    <>
      {backdrops.map((backdrop) => createPortal(<LivingPanels panels={DIALOG_PANELS} />, backdrop, backdropKey(backdrop)))}
    </>
  )
}
