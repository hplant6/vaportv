// Gradient Drift's looks. The settings are the pen's "molten" preset (Liam Egan,
// codepen.io/shubniggurath, "Gradient Drift"; MIT): big slow blobs behind wide soft
// glass ribs. Every palette shares them and changes only the colours, on a dark ground
// so vaporTV's white text stays readable; Settings → Backdrop also turns the ribs sideways.

export interface DistortLayerConfig {
  enabled: boolean
  /** Axis the rib cells run along; the sample offsets along it too */
  axis: 'x' | 'y'
  cells: number
  /** Glass-to-background distance in uv space: how far the refraction throws */
  strength: number
  /** Rib profile height: 0 = flat pane (no effect), 1 = full half-cylinder */
  bulge: number
  /** Ridge profile: 0 = hard creases between ribs, 1 = smooth sine ripple */
  soft: number
  /** Specular shoulder highlight / groove darkening amount */
  shading: number
  /** Per-cell random offset, in uv space */
  jitter: number
  /** Edge fade as a fraction of a cell: anti-aliasing on the rib lines */
  blend: number
}

export interface DriftConfig {
  seed: number
  /** Number of circles */
  count: number
  /** Circles cycle through this palette */
  palette: string[]
  background: string
  /** Circle radius as a fraction of min(width, height) */
  radiusMin: number
  radiusMax: number
  /** Edge softness of each disc, 0..1 */
  feather: number
  opacity: number
  driftSpeed: number
  /** Drift range as a fraction of min(width, height) */
  driftAmplitude: number
  /** Gaussian sigma in framebuffer pixels */
  blurSigma: number
  /** Render the pipeline at 1/n resolution: a cheap way to get bigger blurs */
  blurDownsample: number
  /** Shared glass wave: bends the ribs of both distortion layers */
  wave: { enabled: boolean; amp: number; scale: number; phase: number; phaseSpeed: number; moveX: number; moveY: number }
  /** Shared light for the specular highlights on both glass layers */
  light: { azimuth: number; elevation: number; intensity: number; gloss: number }
  /** The pen always renders both panes in one pass (offsets summed); kept for the presets' sake */
  distortPasses: 1 | 2
  distort1: DistortLayerConfig
  distort2: DistortLayerConfig
}

/** The pen's molten preset, which every look here is built on. */
const MOLTEN: DriftConfig = {
  seed: 7,
  count: 6,
  palette: ['#ff3d00', '#ff8a00', '#ffc400', '#ff005d', '#7b1fa2', '#ff6d3a'],
  background: '#160608',
  radiusMin: 0.25,
  radiusMax: 0.7,
  feather: 0.75,
  opacity: 0.9,
  driftSpeed: 0.55,
  driftAmplitude: 0.35,
  blurSigma: 20,
  blurDownsample: 2,
  wave: { enabled: true, amp: 0.09, scale: 0.6, phase: 0, phaseSpeed: 0.12, moveX: 0, moveY: 0.008 },
  light: { azimuth: 1.4, elevation: 0.25, intensity: 0.3, gloss: 36 },
  distortPasses: 1,
  distort1: { enabled: true, axis: 'x', cells: 5, strength: 0.32, bulge: 1, soft: 0.55, shading: 0.25, jitter: 0, blend: 0.05 },
  distort2: { enabled: false, axis: 'y', cells: 8, strength: 0.15, bulge: 1, soft: 0.4, shading: 0.3, jitter: 0, blend: 0.03 }
}

const look = (palette: string[], background: string): DriftConfig => ({ ...MOLTEN, palette, background })

export const presets: Record<string, DriftConfig> = {
  molten: MOLTEN,
  'deep sea': look(['#00b4d8', '#0077b6', '#48cae4', '#023e8a', '#7b2cbf', '#00f5d4'], '#020c1b'),
  neon: look(['#ff00e5', '#00ffea', '#8c1eff', '#ff2975', '#3d5afe', '#ffe600'], '#07040c'),
  aurora: look(['#00f5a0', '#00d9f5', '#7f5af0', '#2cb67d', '#b15eff', '#16db93'], '#03110d'),
  sunset: look(['#ff7b54', '#ffb26b', '#ffd56b', '#e05780', '#9d4edd', '#ff5d8f'], '#1a0a12'),
  forest: look(['#2d6a4f', '#40916c', '#95d5b2', '#d4a373', '#52b788', '#b7e4c7'], '#06140e'),
  twilight: look(['#5e60ce', '#7400b8', '#6930c3', '#4ea8de', '#e0aaff', '#48bfe3'], '#0a0614')
}

export type DriftDirection = 'vertical' | 'horizontal'

/**
 * The ribs turned sideways: the glass runs across the screen instead of down it, in
 * three bands (about as thick as molten's five upright ones on a 16:9 screen).
 */
export function withDirection(config: DriftConfig, direction: DriftDirection): DriftConfig {
  if (direction === 'vertical') return config
  return { ...config, distort1: { ...config.distort1, axis: 'y', cells: 3 } }
}
