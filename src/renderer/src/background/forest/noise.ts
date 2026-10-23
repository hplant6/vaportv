// 2D simplex noise (ashima/webgl-noise), the same function as WIND_NOISE's simplex2d in
// shaders.ts, so grass is planted to match the dirt patches the ground shader paints.

const C0 = 0.211324865405187 // (3 - sqrt(3)) / 6
const C1 = 0.366025403784439 // (sqrt(3) - 1) / 2
const C2 = -0.577350269189626 // -1 + 2 * C0
const C3 = 0.024390243902439 // 1 / 41

const mod289 = (x: number): number => x - Math.floor(x * (1 / 289)) * 289
const permute = (x: number): number => mod289((x * 34 + 1) * x)
const fract = (x: number): number => x - Math.floor(x)

export function simplex2d(vx: number, vy: number): number {
  const s = (vx + vy) * C1
  let ix = Math.floor(vx + s)
  let iy = Math.floor(vy + s)
  const t = (ix + iy) * C0
  const x0 = vx - ix + t
  const y0 = vy - iy + t
  const i1x = x0 > y0 ? 1 : 0
  const i1y = x0 > y0 ? 0 : 1
  const x1 = x0 + C0 - i1x
  const y1 = y0 + C0 - i1y
  const x2 = x0 + C2
  const y2 = y0 + C2

  ix = mod289(ix)
  iy = mod289(iy)
  const p = [permute(permute(iy) + ix), permute(permute(iy + i1y) + ix + i1x), permute(permute(iy + 1) + ix + 1)]
  const corners = [
    [x0, y0],
    [x1, y1],
    [x2, y2]
  ]
  let n = 0
  for (let k = 0; k < 3; k++) {
    const [cx, cy] = corners[k]
    let m = Math.max(0.5 - (cx * cx + cy * cy), 0)
    m = m * m
    m = m * m
    const x = 2 * fract(p[k] * C3) - 1
    const h = Math.abs(x) - 0.5
    const a0 = x - Math.floor(x + 0.5)
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h)
    n += m * (a0 * cx + h * cy)
  }
  return 130 * n
}
