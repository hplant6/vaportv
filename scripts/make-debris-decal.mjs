// Draws the rain backdrop's litter decal: scraps of paper, card and plastic, leaves,
// twigs and cigarette butts scattered over a transparent tile. vaporTV's own artwork
// (GPL with the rest of the app), replacing a Megascans decal that couldn't be shipped.
//
//   node scripts/make-debris-decal.mjs
//
// Writes debris_albedo.png (colour) and debris_opacity.png (where there's litter) into
// src/renderer/public/backdrops/rain/debris/. Seeded, so it comes out the same every run.
import { mkdir } from 'node:fs/promises'
import sharp from 'sharp'

const SIZE = 2048
const OUT = 'src/renderer/public/backdrops/rain/debris'
const COUNT = 460

// Small seeded PRNG (mulberry32).
let seed = 20261016
function rand() {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const between = (a, b) => a + rand() * (b - a)
const pick = (items) => items[Math.floor(rand() * items.length)]

// Weighted kinds of litter, roughly as often as they appeared in the original.
const PAPER = ['#e9e6dd', '#d8d4ca', '#f2f0ea', '#c9c4b8', '#b9b6ae']
const CARD = ['#b8946a', '#a5825a', '#c9a676', '#8f7350']
const LEAF = ['#8a5a2b', '#a46a2c', '#6f4a22', '#9c7b3a', '#5f6b2a']
const BRIGHT = ['#c4212b', '#d23a2f', '#1f5fbf', '#e8c51a', '#2fa36b', '#e46a8a']
const DARK = ['#3b3b3d', '#4a4a4c', '#2b2a28', '#5a5754']

/** A crumpled scrap: an irregular polygon around (x, y). */
function scrap(x, y, r, color) {
  const points = []
  const corners = Math.floor(between(5, 9))
  for (let i = 0; i < corners; i++) {
    const a = (i / corners) * Math.PI * 2 + between(-0.3, 0.3)
    const d = r * between(0.45, 1)
    points.push(`${(x + Math.cos(a) * d).toFixed(1)},${(y + Math.sin(a) * d).toFixed(1)}`)
  }
  // A darker fold line across it, for some crumple.
  const fold = `<line x1="${x - r * 0.6}" y1="${y + between(-r, r) * 0.4}" x2="${x + r * 0.6}" y2="${y + between(-r, r) * 0.4}" stroke="#000" stroke-opacity="0.18" stroke-width="${(r / 6).toFixed(1)}"/>`
  return { fill: `<g><polygon points="${points.join(' ')}" fill="${color}"/>${fold}</g>`, mask: `<polygon points="${points.join(' ')}" fill="#fff"/>` }
}

/** A leaf: a pointed ellipse with a midrib. */
function leaf(x, y, r, color, angle) {
  const path = `M ${-r} 0 Q 0 ${-r * 0.55} ${r} 0 Q 0 ${r * 0.55} ${-r} 0 Z`
  const t = `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${angle.toFixed(1)})`
  return {
    fill: `<g transform="${t}"><path d="${path}" fill="${color}"/><line x1="${-r}" y1="0" x2="${r}" y2="0" stroke="#000" stroke-opacity="0.25" stroke-width="${(r / 8).toFixed(1)}"/></g>`,
    mask: `<path transform="${t}" d="${path}" fill="#fff"/>`
  }
}

/** A cigarette butt: white paper and an orange filter. */
function butt(x, y, r, angle) {
  const t = `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${angle.toFixed(1)})`
  const w = r * 0.32
  return {
    fill: `<g transform="${t}"><rect x="${-r}" y="${-w / 2}" width="${r * 1.2}" height="${w}" rx="${w / 2}" fill="#efece4"/><rect x="${r * 0.2}" y="${-w / 2}" width="${r * 0.8}" height="${w}" rx="${w / 2}" fill="#c8823a"/></g>`,
    mask: `<rect transform="${t}" x="${-r}" y="${-w / 2}" width="${r * 2}" height="${w}" rx="${w / 2}" fill="#fff"/>`
  }
}

/** A twig or strand: a thin wobbly line. */
function twig(x, y, r, color, angle) {
  const t = `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${angle.toFixed(1)})`
  const d = `M ${-r} 0 Q ${-r / 3} ${between(-r, r) * 0.3} 0 0 T ${r} ${between(-r, r) * 0.2}`
  const width = between(2, 4).toFixed(1)
  return {
    fill: `<path transform="${t}" d="${d}" stroke="${color}" stroke-width="${width}" fill="none" stroke-linecap="round"/>`,
    mask: `<path transform="${t}" d="${d}" stroke="#fff" stroke-width="${width}" fill="none" stroke-linecap="round"/>`
  }
}

const fills = []
const masks = []
for (let i = 0; i < COUNT; i++) {
  const x = between(0, SIZE)
  const y = between(0, SIZE)
  const angle = between(0, 360)
  const roll = rand()
  const item =
    roll < 0.32 ? scrap(x, y, between(8, 26), pick(PAPER))
    : roll < 0.5 ? scrap(x, y, between(6, 18), pick(CARD))
    : roll < 0.66 ? leaf(x, y, between(8, 18), pick(LEAF), angle)
    : roll < 0.76 ? scrap(x, y, between(5, 12), pick(BRIGHT))
    : roll < 0.84 ? scrap(x, y, between(8, 20), pick(DARK))
    : roll < 0.92 ? butt(x, y, between(8, 12), angle)
    : twig(x, y, between(14, 40), pick(['#4a3a28', '#2f2a24', '#6b5a3a', '#25324a']), angle)
  fills.push(item.fill)
  masks.push(item.mask)
}

const svg = (body, background) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}"><rect width="100%" height="100%" fill="${background}"/>${body}</svg>`

await mkdir(OUT, { recursive: true })
// Colour under transparent areas doesn't show; mid grey keeps filtered edges from darkening.
await sharp(Buffer.from(svg(fills.join(''), '#808080'))).png().toFile(`${OUT}/debris_albedo.png`)
await sharp(Buffer.from(svg(masks.join(''), '#000'))).blur(0.6).greyscale().png().toFile(`${OUT}/debris_opacity.png`)
console.log(`wrote ${OUT}/debris_albedo.png and debris_opacity.png (${COUNT} pieces)`)
