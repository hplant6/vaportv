// Gradient Drift's looks, from Liam Egan's pen (codepen.io/shubniggurath, "Gradient Drift"; MIT).
// The pen picks one at random each load; here Settings → Backdrop chooses.

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

export const presets: Record<string, DriftConfig> = {
  default: {
    seed: 1,
    count: 8,
    palette: [
      '#ff6b6b',
      '#ffd166',
      '#06d6a0',
      '#4ecdc4',
      '#5d5fef',
      '#b388eb',
      '#f25c54',
      '#35a7ff',
    ],
    background: '#FFF',
    radiusMin: 0.18,
    radiusMax: 0.6,
    feather: 0.6,
    opacity: 0.85,
    driftSpeed: 1,
    driftAmplitude: 0.28,
    blurSigma: 14,
    blurDownsample: 2,
    wave: {
      enabled: true,
      amp: 0.05,
      scale: 1,
      phase: 0,
      phaseSpeed: 0.25,
      moveX: 0,
      moveY: 0.015,
    },
    light: {
      azimuth: 4.8,
      elevation: 0.1,
      intensity: 0.4,
      gloss: 80,
    },
    distortPasses: 1,
    distort1: {
      enabled: true,
      axis: 'x',
      cells: 9, // the pen: floor(innerWidth / 200) at 1920
      strength: 0.25,
      bulge: 1,
      soft: 0.15,
      shading: 0.3,
      jitter: 0,
      blend: 0.02,
    },
    distort2: {
      enabled: true,
      axis: 'y',
      cells: 10, // the pen: floor(innerHeight / 100) at 1080
      strength: 0.25,
      bulge: 1,
      soft: 0.15,
      shading: 0.5,
      jitter: 0,
      blend: 0.02,
    },
  },

  // Big slow blobs of heat behind wide soft ribs, lit from below.
  'molten': {
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
    wave: {
      enabled: true,
      amp: 0.09,
      scale: 0.6,
      phase: 0,
      phaseSpeed: 0.12,
      moveX: 0,
      moveY: 0.008,
    },
    light: {
      azimuth: 1.4,
      elevation: 0.25,
      intensity: 0.3,
      gloss: 36,
    },
    distortPasses: 1,
    distort1: {
      enabled: true,
      axis: 'x',
      cells: 5,
      strength: 0.32,
      bulge: 1,
      soft: 0.55,
      shading: 0.25,
      jitter: 0,
      blend: 0.05,
    },
    distort2: {
      enabled: false,
      axis: 'y',
      cells: 8,
      strength: 0.15,
      bulge: 1,
      soft: 0.4,
      shading: 0.3,
      jitter: 0,
      blend: 0.03,
    },
  },

  // Cool bioluminescent drift under horizontal ripples, glossy raking light.
  'deep sea': {
    seed: 42,
    count: 9,
    palette: ['#0aefff', '#0a85ff', '#00ffc6', '#3d5afe', '#00b8d4', '#7afcff'],
    background: '#04121f',
    radiusMin: 0.14,
    radiusMax: 0.5,
    feather: 0.55,
    opacity: 0.75,
    driftSpeed: 0.8,
    driftAmplitude: 0.32,
    blurSigma: 16,
    blurDownsample: 2,
    wave: {
      enabled: true,
      amp: 0.045,
      scale: 1.6,
      phase: 0,
      phaseSpeed: 0.35,
      moveX: 0.006,
      moveY: 0.018,
    },
    light: {
      azimuth: 2.2,
      elevation: 0.3,
      intensity: 0.65,
      gloss: 100,
    },
    distortPasses: 2,
    distort1: {
      enabled: true,
      axis: 'y',
      cells: 9,
      strength: 0.2,
      bulge: 1,
      soft: 0.3,
      shading: 0.45,
      jitter: 0.06,
      blend: 0.03,
    },
    distort2: {
      enabled: true,
      axis: 'x',
      cells: 4,
      strength: 0.1,
      bulge: 0.8,
      soft: 0.5,
      shading: 0.2,
      jitter: 0,
      blend: 0.04,
    },
  },

  // Hot colours on black through tight jittered ribs — flat glass, hard creases.
  'neon signage': {
    seed: 23,
    count: 7,
    palette: ['#ff00e5', '#00ffea', '#ffe600', '#ff2975', '#8c1eff'],
    background: '#060606',
    radiusMin: 0.12,
    radiusMax: 0.45,
    feather: 0.35,
    opacity: 0.95,
    driftSpeed: 1.6,
    driftAmplitude: 0.24,
    blurSigma: 10,
    blurDownsample: 2,
    wave: {
      enabled: false,
      amp: 0.02,
      scale: 1,
      phase: 0,
      phaseSpeed: 0.2,
      moveX: 0,
      moveY: 0,
    },
    light: {
      azimuth: 5.2,
      elevation: 0.2,
      intensity: 0.85,
      gloss: 120,
    },
    distortPasses: 1,
    distort1: {
      enabled: true,
      axis: 'x',
      cells: 26,
      strength: 0.16,
      bulge: 0.9,
      soft: 0.05,
      shading: 0.6,
      jitter: 0.14,
      blend: 0.01,
    },
    distort2: {
      enabled: true,
      axis: 'y',
      cells: 14,
      strength: 0.09,
      bulge: 0.85,
      soft: 0.05,
      shading: 0.35,
      jitter: 0.08,
      blend: 0.01,
    },
  },

  // Washed-out pastels, heavy blur, barely-there glass — soft and quiet.
  'pastel frost': {
    seed: 128,
    count: 10,
    palette: ['#ffd6e0', '#c1fba4', '#bde0fe', '#ffef9f', '#e2c2ff', '#a9def9'],
    background: '#fdfbff',
    radiusMin: 0.2,
    radiusMax: 0.55,
    feather: 0.25,
    opacity: 0.8,
    driftSpeed: 0.7,
    driftAmplitude: 0.3,
    blurSigma: 26,
    blurDownsample: 1,
    wave: {
      enabled: true,
      amp: 0.03,
      scale: 0.8,
      phase: 0,
      phaseSpeed: 0.15,
      moveX: 0.004,
      moveY: 0.01,
    },
    light: {
      azimuth: 4.2,
      elevation: 0.5,
      intensity: 0.25,
      gloss: 28,
    },
    distortPasses: 1,
    distort1: {
      enabled: true,
      axis: 'x',
      cells: 8,
      strength: 0.1,
      bulge: 0.9,
      soft: 0.8,
      shading: 0.15,
      jitter: 0,
      blend: 0.06,
    },
    distort2: {
      enabled: true,
      axis: 'y',
      cells: 6,
      strength: 0.08,
      bulge: 0.9,
      soft: 0.8,
      shading: 0.12,
      jitter: 0,
      blend: 0.06,
    },
  },

  // Greys on warm paper behind three wide vertical panes.
  'ink wash': {
    seed: 311,
    count: 5,
    palette: ['#1c1c1c', '#4a4a4a', '#8a8a8a', '#2e2e2e', '#6b6b6b'],
    background: '#f4f1ea',
    radiusMin: 0.2,
    radiusMax: 0.6,
    feather: 0.75,
    opacity: 0.5,
    driftSpeed: 0.9,
    driftAmplitude: 0.3,
    blurSigma: 18,
    blurDownsample: 2,
    wave: {
      enabled: true,
      amp: 0.06,
      scale: 0.8,
      phase: 0,
      phaseSpeed: 0.2,
      moveX: 0,
      moveY: 0.012,
    },
    light: {
      azimuth: 3.6,
      elevation: 0.35,
      intensity: 0.5,
      gloss: 60,
    },
    distortPasses: 1,
    distort1: {
      enabled: true,
      axis: 'y',
      cells: 3,
      strength: 0.35,
      bulge: 1,
      soft: 0.3,
      shading: 0.35,
      jitter: 0,
      blend: 0.03,
    },
    distort2: {
      enabled: false,
      axis: 'x',
      cells: 6,
      strength: 0.12,
      bulge: 1,
      soft: 0.3,
      shading: 0.2,
      jitter: 0,
      blend: 0.03,
    },
  },

  // Bright fruit colours through fine reeded glass, quick and lively.
  'citrus pop': {
    seed: 77,
    count: 7,
    palette: ['#ff9f1c', '#ffbf69', '#2ec4b6', '#cbf3f0', '#ff6392', '#ffe45e'],
    background: '#fff8e7',
    radiusMin: 0.15,
    radiusMax: 0.5,
    feather: 0.5,
    opacity: 0.85,
    driftSpeed: 1.4,
    driftAmplitude: 0.26,
    blurSigma: 12,
    blurDownsample: 2,
    wave: {
      enabled: true,
      amp: 0.035,
      scale: 1.3,
      phase: 0,
      phaseSpeed: 0.4,
      moveX: 0.01,
      moveY: 0,
    },
    light: {
      azimuth: 0.8,
      elevation: 0.2,
      intensity: 0.55,
      gloss: 90,
    },
    distortPasses: 2,
    distort1: {
      enabled: true,
      axis: 'x',
      cells: 36,
      strength: 0.12,
      bulge: 0.95,
      soft: 0.1,
      shading: 0.5,
      jitter: 0.04,
      blend: 0.015,
    },
    distort2: {
      enabled: true,
      axis: 'y',
      cells: 2,
      strength: 0.18,
      bulge: 1,
      soft: 0.6,
      shading: 0.2,
      jitter: 0,
      blend: 0.05,
    },
  },
}
