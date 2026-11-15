// The visualizer's colours, from a song's cover.

/** vaporTV's amber, violet and teal, for a song without a cover. */
export const FALLBACK: [string, string, string] = ['#ee960d', '#7b3fe4', '#1fb5c9']

/** The cover's three liveliest colours (saturated, not too dark or pale), most common first. */
export function paletteFromPixels(data: Uint8ClampedArray): [string, string, string] {
  const buckets = new Map<number, { r: number; g: number; b: number; weight: number }>()
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2]
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    const light = (max + min) / 510
    const sat = max === min ? 0 : (max - min) / (255 - Math.abs(max + min - 255))
    if (light < 0.12 || light > 0.92) continue
    // Hue in 12 slices; vivid pixels count for more than grey ones.
    const hue = max === min ? 0 : max === r ? ((g - b) / (max - min) + 6) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4
    const key = Math.floor((hue / 6) * 12)
    const weight = 0.15 + sat * sat
    const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, weight: 0 }
    bucket.r += r * weight
    bucket.g += g * weight
    bucket.b += b * weight
    bucket.weight += weight
    buckets.set(key, bucket)
  }
  const colours = [...buckets.values()]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map(({ r, g, b, weight }) => {
      const hex = (v: number): string => Math.round(v / weight).toString(16).padStart(2, '0')
      return `#${hex(r)}${hex(g)}${hex(b)}`
    })
  return [colours[0] ?? FALLBACK[0], colours[1] ?? colours[0] ?? FALLBACK[1], colours[2] ?? colours[1] ?? colours[0] ?? FALLBACK[2]]
}
