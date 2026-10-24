import { useEffect, useRef } from 'react'
import { NOISE, startShaderBackdrop, type Looks } from './shaderBackdrop'

// Desert Dunes: rows of dunes fading into haze, drifting slowly past as if seen from a
// moving train. Each dune has a long windward slope and a steep slip face; the sun lights
// one side or the other as it crosses the sky. All one shader.

/** Looks by time of day (see shaderBackdrop). */
const LOOKS: Looks = [
  [0.0, { uSkyHigh: '#4a5a9a', uSkyLow: '#f6b48a', uLit: '#f2b48a', uShade: '#7a5a72', uHaze: '#dca894', uLight: 0.85 }],
  [0.1, { uSkyHigh: '#3b74c9', uSkyLow: '#cfe0ee', uLit: '#eebc7c', uShade: '#b27c4c', uHaze: '#dccbb2', uLight: 1.0 }],
  [0.88, { uSkyHigh: '#3a66b8', uSkyLow: '#e8d2b8', uLit: '#f2b470', uShade: '#a86a44', uHaze: '#e2c4a2', uLight: 1.0 }],
  [1.0, { uSkyHigh: '#3a3f80', uSkyLow: '#ff9a5a', uLit: '#ff9e5a', uShade: '#8a4a4a', uHaze: '#ea9c78', uLight: 0.9 }],
  [1.06, { uSkyHigh: '#151a44', uSkyLow: '#6a3e5e', uLit: '#9a6070', uShade: '#3a2840', uHaze: '#5a3a58', uLight: 0.7 }],
  [1.15, { uSkyHigh: '#03050f', uSkyLow: '#142038', uLit: '#4a5a7a', uShade: '#1a2236', uHaze: '#18223c', uLight: 0.6 }],
  [1.85, { uSkyHigh: '#03050f', uSkyLow: '#142038', uLit: '#4a5a7a', uShade: '#1a2236', uHaze: '#18223c', uLight: 0.6 }],
  [1.94, { uSkyHigh: '#1a2050', uSkyLow: '#5a4060', uLit: '#8a6478', uShade: '#34283e', uHaze: '#4e3a58', uLight: 0.7 }]
]

const FRAGMENT = /*glsl*/ `
uniform vec3 uSkyHigh, uSkyLow, uLit, uShade, uHaze;
uniform float uLight;
${NOISE}

const float HORIZON = -0.02;
const int LAYERS = 6;

// One row of dunes at x: its height (0..1), with where along its dune x is (0..1) and
// where that dune's crest is, for shading.
float dune(float x, float seed, out float along, out float crest) {
  float X = x + 0.4 * vnoise1(x * 0.6 + seed);
  float cell = floor(X);
  float f = fract(X);
  crest = 0.66 + 0.16 * (hash1(cell + seed) - 0.5);
  along = f;
  float size = 0.5 + 0.5 * hash1(cell * 1.7 + seed);
  float rise = smoothstep(0.0, crest, f);
  float fall = 1.0 - smoothstep(crest, 1.0, f);
  return size * (f < crest ? rise * rise * (3.0 - 2.0 * rise) : fall);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uR) / uR.y;

  // Sky, with the sun or moon on its arc and stars at night.
  float up = clamp((uv.y - HORIZON) * 1.6, 0.0, 1.0);
  vec3 col = mix(uSkyLow, uSkyHigh, pow(up, 0.6));
  col += uStars * stars(uv, 280.0, 0.07) * smoothstep(0.0, 0.2, uv.y - HORIZON) * vec3(0.9, 0.92, 1.0);
  float day = step(uSun, 1.0);
  float s = day > 0.5 ? uSun : uSun - 1.0;
  vec2 body = vec2(mix(-0.8, 0.8, s), HORIZON + sin(3.14159 * s) * 0.45);
  float d = length(uv - body);
  col += day * vec3(1.0, 0.82, 0.55) * (1.0 - smoothstep(0.03, 0.04, d) + 0.35 * exp(-d * 5.0));
  col += (1.0 - day) * vec3(0.85, 0.9, 1.0) * ((1.0 - smoothstep(0.018, 0.024, d)) * 0.9 + 0.08 * exp(-d * 9.0));

  // Which side the light comes from: the sun's (or moon's) left or right of centre,
  // weaker when it's high overhead and lights both faces alike.
  float side = -clamp(body.x * 1.4, -1.0, 1.0);

  // Rows of dunes, far to near: each lower on screen, bigger, and drifting past faster.
  for (int i = 0; i < LAYERS; i++) {
    float k = float(i);
    float near = k / float(LAYERS - 1);
    float base = HORIZON - 0.02 - pow(k, 1.5) * 0.04;
    float amp = 0.03 + 0.05 * near;
    float freq = 3.2 / (1.0 + k * 0.55);
    float along, crest;
    float x = uv.x * freq + uT * 0.006 * (1.0 + k * 1.2) + k * 13.7;
    float h = base + amp * dune(x, k * 5.1, along, crest) + 0.008 * (fbm1(x * 0.5) - 0.5);
    if (uv.y < h) {
      // Windward slope (+1, facing left) or slip face (-1, facing right). The line between
      // them leans back from the crest as it runs down the dune, as a slip face's shadow
      // does, rather than dropping straight down.
      float below = (h - uv.y) / amp;
      float edge = crest - 0.22 * below;
      float face = 1.0 - 2.0 * smoothstep(edge - 0.05, edge + 0.05, along);
      // The foot of each windward slope still sits in the last dune's shadow, so it comes
      // into the light gradually rather than at the seam between them.
      face = mix(-1.0, face, smoothstep(0.0, 0.18, along));
      // Lit or shaded by which way it faces (both alike with the light overhead).
      float lit = clamp(0.55 + 0.4 * face * side + 0.25 * (1.0 - abs(side)), 0.0, 1.0);
      vec3 sand = mix(uShade, uLit, lit);
      // (h can dip just below base in a trough; smoothstep's edges must stay in order.)
      sand *= 0.85 + 0.15 * smoothstep(0.0, 1.0, (uv.y - base) / max(h - base, 0.001));
      // Wind ripples on the nearer rows, running along the slope.
      float ripple = sin(uv.x * (60.0 + 90.0 * near) + uv.y * 700.0 * near + fbm2(uv * 40.0) * 3.0);
      sand *= 1.0 + 0.05 * near * ripple;
      // Haze: the far rows melt into the sky's colour at the horizon.
      col = mix(sand * uLight, uHaze, (1.0 - near) * 0.75);
    }
  }
  gl_FragColor = vec4(col, 1.0);
}
`

/** Desert dunes drifting past, following the time of day. Calls onUnavailable if WebGL can't run it. */
export function DunesBackground({ onUnavailable }: { onUnavailable: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    try {
      return startShaderBackdrop(canvas.current!, { fragment: FRAGMENT, looks: LOOKS })
    } catch (err) {
      console.error('steamtv: desert dunes backdrop unavailable:', err)
      onUnavailable()
      return undefined
    }
  }, [onUnavailable])

  return <canvas className="stage-canvas" ref={canvas} />
}
