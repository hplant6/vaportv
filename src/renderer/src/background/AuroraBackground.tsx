import { useEffect, useRef } from 'react'
import { NOISE, startShaderBackdrop, type Looks } from './shaderBackdrop'

// Northern Lights: aurora curtains over snowy mountains and a pine treeline, mirrored in
// a still lake. All one shader. The aurora comes out after dark; by day it's the same
// valley under a winter sky.

/** Looks by time of day (see shaderBackdrop). */
const LOOKS: Looks = [
  [0.0, { uSkyHigh: '#34477e', uSkyLow: '#e9a98a', uFar: '#6a6680', uSnow: '#f2c8bc', uNear: '#151b24', uLight: 0.8, uAurora: 0.1 }],
  [0.1, { uSkyHigh: '#3a6cb4', uSkyLow: '#bcd4ea', uFar: '#5d6b82', uSnow: '#eef3f8', uNear: '#1a2622', uLight: 1.0, uAurora: 0 }],
  [0.88, { uSkyHigh: '#3a62ac', uSkyLow: '#d9cbc4', uFar: '#5f6680', uSnow: '#f2e4dc', uNear: '#18221f', uLight: 0.95, uAurora: 0 }],
  [1.0, { uSkyHigh: '#2a3570', uSkyLow: '#f09a72', uFar: '#4a4462', uSnow: '#f2b6a2', uNear: '#12161e', uLight: 0.75, uAurora: 0 }],
  [1.06, { uSkyHigh: '#0d1534', uSkyLow: '#3a3452', uFar: '#22243a', uSnow: '#6a6a88', uNear: '#080b12', uLight: 0.45, uAurora: 0.3 }],
  [1.15, { uSkyHigh: '#02040c', uSkyLow: '#0a1626', uFar: '#0e1626', uSnow: '#3c4c68', uNear: '#03060a', uLight: 0.35, uAurora: 1 }],
  [1.85, { uSkyHigh: '#02040c', uSkyLow: '#0a1626', uFar: '#0e1626', uSnow: '#3c4c68', uNear: '#03060a', uLight: 0.35, uAurora: 1 }],
  [1.94, { uSkyHigh: '#0e1636', uSkyLow: '#3a3654', uFar: '#24263c', uSnow: '#707090', uNear: '#090c13', uLight: 0.45, uAurora: 0.35 }]
]

const FRAGMENT = /*glsl*/ `
uniform vec3 uSkyHigh, uSkyLow, uFar, uSnow, uNear;
uniform float uLight, uAurora;
${NOISE}

// Where the far mountains meet the lake, in screen units from the middle (height = 1).
const float HORIZON = -0.2;

// Aurora: a stack of thin layers above the valley; on each, bright folds where a ridged
// noise peaks. Low layers are green, the upper ones fade through teal to violet.
vec3 aurora(vec3 rd) {
  if (rd.y < 0.01) return vec3(0.0);
  vec3 col = vec3(0.0);
  for (int i = 0; i < 26; i++) {
    float fi = float(i) / 26.0;
    float h = 1.0 + fi * 0.9;
    vec2 p = rd.xz / rd.y * h;
    p.y += uT * 0.012;
    float warp = fbm2(p * vec2(0.3, 0.7) + vec2(uT * 0.02, 0.0));
    float fold = 1.0 - abs(sin(p.x * 0.55 + warp * 4.0 + uT * 0.015));
    // Fine vertical rays along the curtain, and patches where it's brighter.
    float rays = 0.6 + 0.4 * vnoise1(p.x * 14.0 + warp * 6.0 + uT * 0.3);
    float curtain = pow(fold, 6.0) * rays * smoothstep(0.3, 0.7, fbm2(p * 0.18 - vec2(0.0, uT * 0.008)));
    vec3 tint = mix(vec3(0.15, 1.0, 0.5), vec3(0.1, 0.75, 0.8), smoothstep(0.0, 0.5, fi));
    tint = mix(tint, vec3(0.55, 0.25, 0.95), smoothstep(0.45, 1.0, fi));
    // The lower edge burns brightest, then it thins upwards.
    col += tint * curtain * (1.0 - fi * 0.8) * (1.0 + 1.5 * (1.0 - smoothstep(0.0, 0.15, fi)));
  }
  // Fades in from the horizon, as the far curtains thin into haze.
  return col * 0.22 * smoothstep(0.01, 0.2, rd.y);
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

// The scene above the water line at uv: sky, far snowy peaks, then the near treeline.
vec3 scene(vec2 uv) {
  vec3 col = sky(uv);
  // Far mountains under snow.
  float ridge = HORIZON + 0.06 + 0.2 * fbm1(uv.x * 1.6 + 4.0) - 0.05 * abs(uv.x);
  if (uv.y < ridge) {
    // Snow all over, brightest up top, with darker gullies running down from the ridge.
    float height = smoothstep(HORIZON, ridge, uv.y);
    float gully = smoothstep(0.55, 0.8, fbm1(uv.x * 55.0 + 3.0)) * (1.0 - height * 0.7);
    vec3 rock = mix(uFar, uSnow, clamp(0.45 + 0.55 * height - 0.35 * gully, 0.0, 1.0)) * uLight;
    // Haze towards the base, where they meet the far shore.
    col = mix(rock, uSkyLow, 0.35 * (1.0 - smoothstep(HORIZON, max(ridge - 0.02, HORIZON + 0.001), uv.y)) + 0.15);
  }
  // Treeline: a low hill crowned with two rows of pines, each tree its own height and
  // width, with the odd gap.
  float hill = HORIZON + 0.015 + 0.03 * fbm1(uv.x * 2.5 + 11.0);
  float trees = 0.0;
  for (int row = 0; row < 2; row++) {
    float r = float(row);
    float x = uv.x * (26.0 + r * 15.0) + r * 0.37;
    float cell = floor(x);
    float spread = 0.55 + 0.4 * hash1(cell * 3.1 + r);
    float c = abs(fract(x) - 0.5) / spread;
    float tall = (0.35 + 0.65 * hash1(cell + r * 17.0)) * step(0.12, hash1(cell * 7.7 + r)) * (1.0 - r * 0.35);
    trees = max(trees, max(0.0, 1.0 - c * 2.0) * tall);
  }
  if (uv.y < hill + trees * 0.06) col = uNear;
  return col;
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
  gl_FragColor = vec4(col, 1.0);
}
`

/** Northern lights over a snowy valley, following the time of day. Calls onUnavailable if WebGL can't run it. */
export function AuroraBackground({ onUnavailable }: { onUnavailable: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    try {
      // The aurora is soft, so it's drawn at 60% size and stretched (its 26 layers are the costly part).
      return startShaderBackdrop(canvas.current!, { fragment: FRAGMENT, looks: LOOKS, scale: 0.6 })
    } catch (err) {
      console.error('steamtv: northern lights backdrop unavailable:', err)
      onUnavailable()
      return undefined
    }
  }, [onUnavailable])

  return <canvas className="stage-canvas" ref={canvas} />
}
