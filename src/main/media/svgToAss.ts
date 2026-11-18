// Turns a single-colour SVG (the controller button pictures, assets/buttons/*.svg) into an ASS
// drawing, so the mpv player can draw the same pictures as the page: <path> and <rect> (rounded
// too), with their transforms (translate, rotate, scale, matrix). Curves stay curves: lines, cubic
// beziers, and quadratics and arcs turned into cubics. Shapes are filled, or stroked where their
// style says so (fill: none and a stroke, as the RT trigger's outline): a stroke is drawn as the
// outline (\\bord) of a path that goes along it and back, so nothing inside it is filled.

type Matrix = [number, number, number, number, number, number]
/** One drawing command, in the SVG's own units: move, line, or cubic bezier (its two controls and end). */
export type Command = { op: 'm' | 'l'; to: [number, number] } | { op: 'b'; c1: [number, number]; c2: [number, number]; to: [number, number] }

export interface SvgShape {
  /** The viewBox: what the drawing is scaled from. */
  box: { x: number; y: number; w: number; h: number }
  /** What's filled. */
  commands: Command[]
  /** What's stroked, and how wide, in the SVG's units. */
  strokes: { commands: Command[]; width: number }[]
}

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]

function multiply(m: Matrix, n: Matrix): Matrix {
  return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]]
}

const apply = (m: Matrix, [x, y]: [number, number]): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

/** An SVG transform attribute as a matrix ("translate(-51.4 120.7) rotate(-45)"). */
export function parseTransform(text: string | undefined): Matrix {
  let m = IDENTITY
  for (const [, name, args] of (text ?? '').matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const v = args.split(/[\s,]+/).filter(Boolean).map(Number)
    let t: Matrix = IDENTITY
    if (name === 'translate') t = [1, 0, 0, 1, v[0] ?? 0, v[1] ?? 0]
    else if (name === 'scale') t = [v[0], 0, 0, v[1] ?? v[0], 0, 0]
    else if (name === 'matrix') t = v as Matrix
    else if (name === 'rotate') {
      const a = ((v[0] ?? 0) * Math.PI) / 180
      const [cx, cy] = [v[1] ?? 0, v[2] ?? 0]
      t = multiply(multiply([1, 0, 0, 1, cx, cy], [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]), [1, 0, 0, 1, -cx, -cy])
    }
    m = multiply(m, t)
  }
  return m
}

/** An elliptical arc (SVG's A) as cubic beziers, from (x1, y1). */
function arcToCubics(x1: number, y1: number, rx: number, ry: number, phiDeg: number, large: boolean, sweep: boolean, x2: number, y2: number): Command[] {
  if (rx === 0 || ry === 0) return [{ op: 'l', to: [x2, y2] }]
  const phi = (phiDeg * Math.PI) / 180
  const cos = Math.cos(phi)
  const sin = Math.sin(phi)
  const dx = (x1 - x2) / 2
  const dy = (y1 - y2) / 2
  const x1p = cos * dx + sin * dy
  const y1p = -sin * dx + cos * dy
  rx = Math.abs(rx)
  ry = Math.abs(ry)
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
  if (lambda > 1) {
    rx *= Math.sqrt(lambda)
    ry *= Math.sqrt(lambda)
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
  const coef = (large !== sweep ? 1 : -1) * Math.sqrt(Math.max(0, num / den))
  const cxp = (coef * rx * y1p) / ry
  const cyp = (-coef * ry * x1p) / rx
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2
  const angle = (ux: number, uy: number, vx: number, vy: number): number => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
    return a
  }
  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
  let delta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
  if (!sweep && delta > 0) delta -= 2 * Math.PI
  if (sweep && delta < 0) delta += 2 * Math.PI
  const segments = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2)))
  const step = delta / segments
  const k = (4 / 3) * Math.tan(step / 4)
  const point = (t: number): [number, number] => [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos]
  const tangent = (t: number): [number, number] => [-rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos]
  const out: Command[] = []
  for (let i = 0; i < segments; i++) {
    const a = theta1 + i * step
    const b = a + step
    const [p0, p3] = [point(a), point(b)]
    const [d0, d3] = [tangent(a), tangent(b)]
    out.push({ op: 'b', c1: [p0[0] + k * d0[0], p0[1] + k * d0[1]], c2: [p3[0] - k * d3[0], p3[1] - k * d3[1]], to: p3 })
  }
  return out
}

/** An SVG path's d attribute as drawing commands. */
export function parsePath(d: string): Command[] {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? []
  const out: Command[] = []
  let i = 0
  let cmd = ''
  let [x, y] = [0, 0]
  let [sx, sy] = [0, 0]
  /** The last control point, for S and T's reflection. */
  let last: { kind: 'c' | 'q'; x: number; y: number } | null = null
  const num = (): number => Number(tokens[i++])
  const isNum = (): boolean => i < tokens.length && !/[a-zA-Z]/.test(tokens[i])
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++]
    const rel = cmd === cmd.toLowerCase()
    const ox = rel ? x : 0
    const oy = rel ? y : 0
    switch (cmd.toUpperCase()) {
      case 'M': {
        x = ox + num()
        y = oy + num()
        ;[sx, sy] = [x, y]
        out.push({ op: 'm', to: [x, y] })
        last = null
        // Further pairs after a move are lines.
        cmd = rel ? 'l' : 'L'
        break
      }
      case 'L':
        x = ox + num()
        y = oy + num()
        out.push({ op: 'l', to: [x, y] })
        last = null
        break
      case 'H':
        x = ox + num()
        out.push({ op: 'l', to: [x, y] })
        last = null
        break
      case 'V':
        y = oy + num()
        out.push({ op: 'l', to: [x, y] })
        last = null
        break
      case 'C': {
        const c1: [number, number] = [ox + num(), oy + num()]
        const c2: [number, number] = [ox + num(), oy + num()]
        x = ox + num()
        y = oy + num()
        out.push({ op: 'b', c1, c2, to: [x, y] })
        last = { kind: 'c', x: c2[0], y: c2[1] }
        break
      }
      case 'S': {
        const c1: [number, number] = last?.kind === 'c' ? [2 * x - last.x, 2 * y - last.y] : [x, y]
        const c2: [number, number] = [ox + num(), oy + num()]
        x = ox + num()
        y = oy + num()
        out.push({ op: 'b', c1, c2, to: [x, y] })
        last = { kind: 'c', x: c2[0], y: c2[1] }
        break
      }
      case 'Q':
      case 'T': {
        const q: [number, number] =
          cmd.toUpperCase() === 'Q' ? [ox + num(), oy + num()] : last?.kind === 'q' ? [2 * x - last.x, 2 * y - last.y] : [x, y]
        const [x0, y0] = [x, y]
        x = ox + num()
        y = oy + num()
        out.push({ op: 'b', c1: [x0 + (2 / 3) * (q[0] - x0), y0 + (2 / 3) * (q[1] - y0)], c2: [x + (2 / 3) * (q[0] - x), y + (2 / 3) * (q[1] - y)], to: [x, y] })
        last = { kind: 'q', x: q[0], y: q[1] }
        break
      }
      case 'A': {
        const [rx, ry, phi, large, sweep] = [num(), num(), num(), num(), num()]
        const [x0, y0] = [x, y]
        x = ox + num()
        y = oy + num()
        out.push(...arcToCubics(x0, y0, rx, ry, phi, large === 1, sweep === 1, x, y))
        last = null
        break
      }
      case 'Z':
        ;[x, y] = [sx, sy]
        out.push({ op: 'l', to: [x, y] })
        last = null
        // Z takes no numbers: anything after it starts a new command.
        if (isNum()) cmd = 'L'
        break
      default:
        // Unknown: skip a token rather than loop forever.
        i++
    }
  }
  return out
}

/** A rect (rounded by rx/ry) as drawing commands. */
function rectCommands(x: number, y: number, w: number, h: number, rx: number, ry: number): Command[] {
  rx = Math.min(rx, w / 2)
  ry = Math.min(ry, h / 2)
  if (!rx || !ry) return [{ op: 'm', to: [x, y] }, { op: 'l', to: [x + w, y] }, { op: 'l', to: [x + w, y + h] }, { op: 'l', to: [x, y + h] }, { op: 'l', to: [x, y] }]
  const kx = rx * 0.5523
  const ky = ry * 0.5523
  return [
    { op: 'm', to: [x + rx, y] },
    { op: 'l', to: [x + w - rx, y] },
    { op: 'b', c1: [x + w - rx + kx, y], c2: [x + w, y + ry - ky], to: [x + w, y + ry] },
    { op: 'l', to: [x + w, y + h - ry] },
    { op: 'b', c1: [x + w, y + h - ry + ky], c2: [x + w - rx + kx, y + h], to: [x + w - rx, y + h] },
    { op: 'l', to: [x + rx, y + h] },
    { op: 'b', c1: [x + rx - kx, y + h], c2: [x, y + h - ry + ky], to: [x, y + h - ry] },
    { op: 'l', to: [x, y + ry] },
    { op: 'b', c1: [x, y + ry - ky], c2: [x + rx - kx, y], to: [x + rx, y] }
  ]
}

const attr = (tag: string, name: string): string | undefined => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1]

/** The <style> block's classes: whether each fills, and its stroke's width (0: none). */
function styleClasses(svg: string): Map<string, { fill: boolean; stroke: number }> {
  const classes = new Map<string, { fill: boolean; stroke: number }>()
  for (const [, names, body] of svg.matchAll(/((?:\.[\w-]+\s*,?\s*)+)\{([^}]*)\}/g)) {
    const fill = !/fill\s*:\s*none/.test(body)
    const stroke = /stroke\s*:\s*(?!none)[^;]+/.test(body) ? Number(/stroke-width\s*:\s*([\d.]+)/.exec(body)?.[1] ?? 1) : 0
    for (const name of names.match(/[\w-]+/g) ?? []) classes.set(name, { fill, stroke })
  }
  return classes
}

/** The same path drawn back the other way, subpath by subpath (so a stroke has no area of its own). */
export function thereAndBack(commands: Command[]): Command[] {
  const out: Command[] = []
  let start = 0
  for (let i = 1; i <= commands.length; i++) {
    if (i < commands.length && commands[i].op !== 'm') continue
    const sub = commands.slice(start, i)
    out.push(...sub)
    for (let j = sub.length - 1; j > 0; j--) {
      const c = sub[j]
      const from = sub[j - 1].to
      out.push(c.op === 'b' ? { op: 'b', c1: c.c2, c2: c.c1, to: from } : { op: 'l', to: from })
    }
    start = i
  }
  return out
}

/** The SVG's shapes, transforms applied, in its own units. */
export function parseSvg(svg: string): SvgShape {
  const [bx, by, bw, bh] = (attr(/<svg[^>]*>/.exec(svg)?.[0] ?? '', 'viewBox') ?? '0 0 240 240').split(/[\s,]+/).map(Number)
  const commands: Command[] = []
  const strokes: SvgShape['strokes'] = []
  const classes = styleClasses(svg)
  // Groups' transforms apply to what's in them: tracked as a stack while walking the tags.
  const stack: Matrix[] = [IDENTITY]
  for (const [tag] of svg.matchAll(/<\/?(?:g|path|rect)\b[^>]*>/g)) {
    const top = stack[stack.length - 1]
    if (tag.startsWith('</g')) {
      stack.pop()
      continue
    }
    const m = multiply(top, parseTransform(attr(tag, 'transform')))
    if (tag.startsWith('<g')) {
      if (!tag.endsWith('/>')) stack.push(m)
      continue
    }
    const own = tag.startsWith('<path')
      ? parsePath(attr(tag, 'd') ?? '')
      : rectCommands(Number(attr(tag, 'x') ?? 0), Number(attr(tag, 'y') ?? 0), Number(attr(tag, 'width') ?? 0), Number(attr(tag, 'height') ?? 0), Number(attr(tag, 'rx') ?? attr(tag, 'ry') ?? 0), Number(attr(tag, 'ry') ?? attr(tag, 'rx') ?? 0))
    const placed = own.map((c): Command => (c.op === 'b' ? { op: 'b', c1: apply(m, c.c1), c2: apply(m, c.c2), to: apply(m, c.to) } : { op: c.op, to: apply(m, c.to) }))
    // Its style: from its classes, then its own attributes.
    const style = { fill: true, stroke: 0 }
    for (const name of (attr(tag, 'class') ?? '').split(/\s+/)) Object.assign(style, classes.get(name) ?? {})
    if (attr(tag, 'fill') === 'none') style.fill = false
    const strokeAttr = attr(tag, 'stroke')
    if (strokeAttr && strokeAttr !== 'none') style.stroke = Number(attr(tag, 'stroke-width') ?? 1)
    // A transform's scale widens the stroke too.
    const scale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]))
    if (style.fill) commands.push(...placed)
    if (style.stroke > 0 && placed.length > 1) strokes.push({ commands: thereAndBack(placed), width: style.stroke * scale })
  }
  return { box: { x: bx, y: by, w: bw, h: bh }, commands, strokes }
}

function drawCommands(shape: SvgShape, commands: Command[], x: number, y: number, size: number): string {
  const s = size / Math.max(shape.box.w, shape.box.h)
  const p = ([px, py]: [number, number]): string => `${Math.round((x + (px - shape.box.x) * s) * 10) / 10} ${Math.round((y + (py - shape.box.y) * s) * 10) / 10}`
  return commands.map((c) => (c.op === 'b' ? `b ${p(c.c1)} ${p(c.c2)} ${p(c.to)}` : `${c.op} ${p(c.to)}`)).join(' ')
}

/** What's filled, as an ASS drawing, the box drawn `size` px square with its top left at (x, y). */
export function assDrawing(shape: SvgShape, x: number, y: number, size: number): string {
  return drawCommands(shape, shape.commands, x, y, size)
}

/** What's stroked: each an ASS drawing to outline (\\bord) half its `width` px wide. */
export function assStrokes(shape: SvgShape, x: number, y: number, size: number): { path: string; width: number }[] {
  const s = size / Math.max(shape.box.w, shape.box.h)
  return shape.strokes.map((stroke) => ({ path: drawCommands(shape, stroke.commands, x, y, size), width: stroke.width * s }))
}
