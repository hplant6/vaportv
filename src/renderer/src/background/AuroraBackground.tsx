import { useEffect, useRef } from 'react'
import { NOISE, startShaderBackdrop, type Looks } from './shaderBackdrop'

// Northern Lights: aurora curtains over a pine treeline, mirrored in a still lake. All one shader. The aurora comes out after dark; by day it's the same
// shore under a winter sky.

/** Looks by time of day (see shaderBackdrop). */
const LOOKS: Looks = [
  [0.0, { uSkyHigh: '#34477e', uSkyLow: '#e9a98a', uNear: '#151b24', uAurora: 0.1 }],
  [0.1, { uSkyHigh: '#3a6cb4', uSkyLow: '#bcd4ea', uNear: '#1a2622', uAurora: 0 }],
  [0.88, { uSkyHigh: '#3a62ac', uSkyLow: '#d9cbc4', uNear: '#18221f', uAurora: 0 }],
  [1.0, { uSkyHigh: '#2a3570', uSkyLow: '#f09a72', uNear: '#12161e', uAurora: 0 }],
  [1.06, { uSkyHigh: '#0d1534', uSkyLow: '#3a3452', uNear: '#080b12', uAurora: 0.3 }],
  [1.15, { uSkyHigh: '#02040c', uSkyLow: '#0a1626', uNear: '#03060a', uAurora: 1 }],
  [1.85, { uSkyHigh: '#02040c', uSkyLow: '#0a1626', uNear: '#03060a', uAurora: 1 }],
  [1.94, { uSkyHigh: '#0e1636', uSkyLow: '#3a3654', uNear: '#090c13', uAurora: 0.35 }]
]

const FRAGMENT = /*glsl*/ `
uniform vec3 uSkyHigh, uSkyLow, uNear;
uniform float uAurora;
${NOISE}

// Where the far shore meets the lake, in screen units from the middle (height = 1).
const float HORIZON = -0.2;

// Aurora: a stack of thin layers above the shore; on each, bright folds where a ridged
// noise peaks. Low layers are green, the upper ones fade through teal to violet.
const int LAYERS = 32;

vec3 aurora(vec3 rd) {
  if (rd.y < 0.01) return vec3(0.0);
  vec3 col = vec3(0.0);
  // Each pixel starts the stack a random fraction of a layer up, so the layers blend into
  // one another instead of showing as thin horizontal stripes.
  float offset = hash2(gl_FragCoord.xy);
  for (int i = 0; i < LAYERS; i++) {
    float fi = (float(i) + offset) / float(LAYERS);
    float h = 1.0 + fi * 0.9;
    vec2 p = rd.xz / rd.y * h;
    p.y += uT * 0.012;
    float warp = fbm2(p * vec2(0.3, 0.7) + vec2(uT * 0.02, 0.0));
    float fold = 1.0 - abs(sin(p.x * 0.55 + warp * 4.0 + uT * 0.015));
    // Fine vertical rays along the curtain, and patches where it's brighter. They fade out towards the horizon, where perspective packs them finer than a pixel.
    float rays = 0.6 + 0.4 * vnoise1(p.x * 14.0 + warp * 6.0 + uT * 0.3) * smoothstep(0.02, 0.12, rd.y);
    float curtain = pow(fold, 6.0) * rays * smoothstep(0.3, 0.7, fbm2(p * 0.18 - vec2(0.0, uT * 0.008)));
    vec3 tint = mix(vec3(0.15, 1.0, 0.5), vec3(0.1, 0.75, 0.8), smoothstep(0.0, 0.5, fi));
    tint = mix(tint, vec3(0.55, 0.25, 0.95), smoothstep(0.45, 1.0, fi));
    // The lower edge burns brightest, then it thins upwards.
    col += tint * curtain * (1.0 - fi * 0.8) * (1.0 + 1.5 * (1.0 - smoothstep(0.0, 0.15, fi)));
  }
  // Fades in from the horizon, as the far curtains thin into haze.
  return col * 0.22 * 26.0 / float(LAYERS) * smoothstep(0.01, 0.2, rd.y);
}

vec3 sky(vec2 uv) {
  vec3 rd = normalize(vec3(uv.x, uv.y - HORIZON, 1.1));
  float up = clamp(rd.y, 0.0, 1.0);
  vec3 col = mix(uSkyLow, uSkyHigh, pow(up, 0.5));
  col += uStars * stars(uv, 260.0, 0.06) * smoothstep(0.0, 0.25, rd.y) * vec3(0.85, 0.9, 1.0);
  // Sun by day, moon by night, each on an arc from left to right.
  float day = step(uSun, 1.0);
  float s = day > 0.5 ? uSun : uSun - 1.0;
  vec2 body = vec2(mix(-0.75, 0.75, s), HORIZON + sin(3.14159 * s) * 0.42);
  float d = length(uv - body);
  col += day * (vec3(1.0, 0.85, 0.65) * (1.0 - smoothstep(0.02, 0.03, d) + 0.25 * exp(-d * 6.0)));
  col += (1.0 - day) * vec3(0.85, 0.9, 1.0) * ((1.0 - smoothstep(0.016, 0.022, d)) * 0.9 + 0.06 * exp(-d * 10.0));
  col += aurora(rd) * uAurora;
  return col;
}

// The scene above the water line at uv: sky, then the treeline along the far shore.
vec3 scene(vec2 uv) {
  vec3 col = sky(uv);
  // Treeline: a low hill crowned with two rows of pines, each tree its own height and
  // width, with the odd gap. Its edge is anti-aliased: the height above the outline,
  // divided by the outline's slope, is roughly the distance to it in screen units.
  float top = HORIZON + 0.015 + 0.03 * fbm1(uv.x * 2.5 + 11.0);
  float slope = 0.0;
  float hill = top;
  for (int row = 0; row < 2; row++) {
    float r = float(row);
    float freq = 26.0 + r * 15.0;
    float x = uv.x * freq + r * 0.37;
    float cell = floor(x);
    float spread = 0.55 + 0.4 * hash1(cell * 3.1 + r);
    float c = abs(fract(x) - 0.5) / spread;
    float tall = (0.35 + 0.65 * hash1(cell + r * 17.0)) * step(0.12, hash1(cell * 7.7 + r)) * (1.0 - r * 0.35);
    float tree = hill + max(0.0, 1.0 - c * 2.0) * tall * 0.06;
    if (tree > top) {
      top = tree;
      slope = 0.12 * tall * freq / spread;
    }
  }
  float dist = (uv.y - top) / sqrt(1.0 + slope * slope);
  return mix(col, uNear, clamp(0.5 - dist * uR.y, 0.0, 1.0));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uR) / uR.y;
  vec3 col;
  if (uv.y >= HORIZON) col = scene(uv);
  else {
    // The lake: the scene mirrored, darkened, with slow ripples breaking up the reflection.
    float depth = HORIZON - uv.y;
    vec2 m = vec2(uv.x + 0.004 * sin(uv.y * 160.0 + uT * 0.8) * smoothstep(0.0, 0.1, depth), HORIZON + depth);
    col = scene(m) * 0.55;
    col = mix(col, uNear, smoothstep(0.1, 0.3, depth) * 0.6);
  }
  // A touch of noise, a fraction of one 8-bit step, so the long dark gradients don't band.
  col += (hash2(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`

/** Northern lights over a lake shore, following the time of day. Calls onUnavailable if WebGL can't run it. */
export function AuroraBackground({ onUnavailable }: { onUnavailable: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    try {
      // Drawn at the screen's own resolution: stretched up from the stage's, the treeline's
      // edges and the fine rays went soft and stair-stepped.
      return startShaderBackdrop(canvas.current!, { fragment: FRAGMENT, looks: LOOKS, native: true })
    } catch (err) {
      console.error('steamtv: northern lights backdrop unavailable:', err)
      onUnavailable()
      return undefined
    }
  }, [onUnavailable])

  return <canvas className="stage-canvas" ref={canvas} />
}
