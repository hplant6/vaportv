import { useEffect, useRef } from 'react'
import { NOISE, startShaderBackdrop, type Looks } from './shaderBackdrop'
import sceneArt from '../assets/aurora/scene.svg'

// Northern Lights: aurora curtains over a forested shore, mirrored in a still lake.
// Always night, whatever the clock or Settings say: by day it was a plain winter sky, with
// the costly aurora still worked out and thrown away. The sky, aurora and water are one shader; the shore is Henry's SVG, drawn at the screen's own
// resolution and handed to the shader as a texture.

/** The art's artboard, in artboard pixels. */
const ART_W = 1920
const ART_H = 1080
/** Where the shore meets the water: a little above the bottom of the art (754.4), which is
 * ragged, so no sky shows through between the reflection and the shore. */
const WATERLINE = 752
/** The waterline in screen units from the middle (height = 1), where it is on the artboard. */
const HORIZON = 0.5 - WATERLINE / ART_H

/** Paints the art onto a canvas the size of the backdrop's: the artboard spans its width, with the waterline on HORIZON. */
async function paintArt(width: number, height: number): Promise<HTMLCanvasElement> {
  const image = new Image()
  image.src = sceneArt
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const k = width / ART_W
  canvas.getContext('2d')!.drawImage(image, 0, (0.5 - HORIZON) * height - WATERLINE * k, width, ART_H * k)
  return canvas
}

/** Looks by time of day (see shaderBackdrop). uLand tints the art: their own colours by day, dimmed and cooled at night. uFogDensity is
 * how thick the mist on the water is. */
const LOOKS: Looks = [
  [0.0, { uSkyHigh: '#34477e', uSkyLow: '#e9a98a', uNear: '#151b24', uLand: '#c8a8a4', uFogDensity: 0.75, uAurora: 0.1 }],
  [0.1, { uSkyHigh: '#3a6cb4', uSkyLow: '#bcd4ea', uNear: '#1a2622', uLand: '#ffffff', uFogDensity: 0.7, uAurora: 0 }],
  [0.88, { uSkyHigh: '#3a62ac', uSkyLow: '#d9cbc4', uNear: '#18221f', uLand: '#f2e6e2', uFogDensity: 0.7, uAurora: 0 }],
  [1.0, { uSkyHigh: '#2a3570', uSkyLow: '#f09a72', uNear: '#12161e', uLand: '#c09a98', uFogDensity: 0.75, uAurora: 0 }],
  [1.06, { uSkyHigh: '#0d1534', uSkyLow: '#3a3452', uNear: '#080b12', uLand: '#5f6a80', uFogDensity: 0.8, uAurora: 0.3 }],
  [1.15, { uSkyHigh: '#02040c', uSkyLow: '#0a1626', uNear: '#03060a', uLand: '#4f6a78', uFogDensity: 0.85, uAurora: 1 }],
  [1.85, { uSkyHigh: '#02040c', uSkyLow: '#0a1626', uNear: '#03060a', uLand: '#4f6a78', uFogDensity: 0.85, uAurora: 1 }],
  [1.94, { uSkyHigh: '#0e1636', uSkyLow: '#3a3654', uNear: '#090c13', uLand: '#5f6a80', uFogDensity: 0.8, uAurora: 0.35 }]
]

const FRAGMENT = /*glsl*/ `
uniform vec3 uSkyHigh, uSkyLow, uNear, uLand;
uniform float uAurora, uFogDensity;
uniform sampler2D uArt;
${NOISE}

const float HORIZON = ${HORIZON.toFixed(5)};

// Aurora: a stack of thin layers above the shore; on each, bright folds where a ridged
// noise peaks. Low layers are green, the upper ones fade through teal to violet. The lake's
// reflection, darkened and rippled, gets by on fewer: the aurora is the shader's costliest
// part and the reflection is a third of the screen.
const int LAYERS = 32;
const int REFLECTED_LAYERS = 12;

vec3 aurora(vec3 rd, int layers) {
  if (rd.y < 0.01) return vec3(0.0);
  vec3 col = vec3(0.0);
  // Each pixel starts the stack a random fraction of a layer up, so the layers blend into
  // one another instead of showing as thin horizontal stripes.
  float offset = hash2(gl_FragCoord.xy);
  for (int i = 0; i < LAYERS; i++) {
    if (i >= layers) break;
    float fi = (float(i) + offset) / float(layers);
    float h = 1.0 + fi * 0.9;
    vec2 p = rd.xz / rd.y * h;
    p.y += uT * 0.012;
    float warp = fbm2(p * vec2(0.3, 0.7) + vec2(uT * 0.02, 0.0));
    float fold = 1.0 - abs(sin(p.x * 0.55 + warp * 4.0 + uT * 0.015));
    // Fine vertical rays along the curtain, and patches where it's brighter. They fade out
    // towards the horizon, where perspective packs them finer than a pixel.
    float rays = 0.6 + 0.4 * vnoise1(p.x * 14.0 + warp * 6.0 + uT * 0.3) * smoothstep(0.02, 0.12, rd.y);
    float curtain = pow(fold, 6.0) * rays * smoothstep(0.3, 0.7, fbm2(p * 0.18 - vec2(0.0, uT * 0.008)));
    vec3 tint = mix(vec3(0.15, 1.0, 0.5), vec3(0.1, 0.75, 0.8), smoothstep(0.0, 0.5, fi));
    tint = mix(tint, vec3(0.55, 0.25, 0.95), smoothstep(0.45, 1.0, fi));
    // The lower edge burns brightest, then it thins upwards.
    col += tint * curtain * (1.0 - fi * 0.8) * (1.0 + 1.5 * (1.0 - smoothstep(0.0, 0.15, fi)));
  }
  // Fades in from the horizon, as the far curtains thin into haze.
  return col * 0.22 * 26.0 / float(layers) * smoothstep(0.01, 0.2, rd.y);
}

vec3 sky(vec2 uv, int layers) {
  vec3 rd = normalize(vec3(uv.x, uv.y - HORIZON, 1.1));
  float up = clamp(rd.y, 0.0, 1.0);
  vec3 col = mix(uSkyLow, uSkyHigh, pow(up, 0.5));
  // Sun by day, moon by night, each on an arc from left to right: crisp discs, their
  // edges one pixel wide, each with a faint glow around it. Stars stay behind them.
  float day = step(uSun, 1.0);
  float s = day > 0.5 ? uSun : uSun - 1.0;
  vec2 body = vec2(mix(-0.75, 0.75, s), HORIZON + sin(3.14159 * s) * 0.42);
  float d = length(uv - body);
  float px = 1.0 / uR.y;
  float disc = 1.0 - smoothstep(mix(0.019, 0.025, day) - px, mix(0.019, 0.025, day) + px, d);
  col += uStars * stars(uv, 260.0, 0.06) * smoothstep(0.0, 0.25, rd.y) * (1.0 - disc) * vec3(0.85, 0.9, 1.0);
  col += day * vec3(1.0, 0.85, 0.65) * (disc + 0.25 * exp(-d * 6.0));
  col += (1.0 - day) * vec3(0.85, 0.9, 1.0) * (disc * 0.9 + 0.04 * exp(-d * 12.0));
  col += aurora(rd, layers) * uAurora;
  return col;
}

// The scene above the water line at uv: the shore, and the sky wherever it shows.
vec3 scene(vec2 uv, int layers) {
  vec4 art = texture2D(uArt, (uv * uR.y + 0.5 * uR) / uR);
  if (art.a >= 1.0) return art.rgb * uLand;
  return mix(sky(uv, layers), art.rgb * uLand, art.a);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uR) / uR.y;
  float ripple = 0.004 * sin(uv.y * 160.0 + uT * 0.8);
  vec3 col;
  if (uv.y >= HORIZON) col = scene(uv, LAYERS);
  else {
    // The lake: the scene mirrored, darkened, with slow ripples breaking up the reflection.
    float depth = HORIZON - uv.y;
    col = scene(vec2(uv.x + ripple * smoothstep(0.0, 0.1, depth), HORIZON + depth), REFLECTED_LAYERS) * 0.55;
    col = mix(col, uNear, smoothstep(0.1, 0.3, depth) * 0.6);
  }
  // Mist on the water: a soft bank centred just above the shore's foot, spreading out over
  // the lake, gathered into patches along the shore and drawn out into long wisps, all
  // drifting slowly sideways (two banks, at different speeds). It's the forest's teal, lit
  // like the land and taking a little of the sky's colour, plus a touch of the aurora's green.
  float above = uv.y - HORIZON - 0.015;
  float band = exp(-above * above / (above > 0.0 ? 0.004 : 0.0016));
  float patches = smoothstep(0.25, 0.65, fbm2(vec2(uv.x * 1.1 + uT * 0.006, 4.0)));
  float wisps = fbm2(vec2(uv.x * 2.2 + uT * 0.012, above * 10.0)) * 0.6
    + fbm2(vec2(uv.x * 4.0 - uT * 0.02 + 7.0, above * 18.0 + 3.0)) * 0.6;
  float fog = band * (0.5 + 0.5 * patches) * smoothstep(0.15, 0.75, wisps) * uFogDensity;
  vec3 mist = mix(vec3(0.24, 0.62, 0.53) * uLand, uSkyLow, 0.25) + uAurora * vec3(0.0, 0.05, 0.035);
  col = mix(col, mist, clamp(fog, 0.0, 1.0));
  // A touch of noise, a fraction of one 8-bit step, so the long dark gradients don't band.
  col += (hash2(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`

/** Northern lights over a lake shore, at night. Calls onUnavailable if WebGL can't run it. */
export function AuroraBackground({ onUnavailable }: { onUnavailable: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    try {
      // Drawn at the screen's own resolution: stretched up from the stage's, the land's
      // edges and the aurora's fine rays go soft and stair-stepped.
      return startShaderBackdrop(canvas.current!, { fragment: FRAGMENT, looks: LOOKS, native: true, time: 'night', textures: { uArt: paintArt } })
    } catch (err) {
      console.error('steamtv: northern lights backdrop unavailable:', err)
      onUnavailable()
      return undefined
    }
  }, [onUnavailable])

  return <canvas className="stage-canvas" ref={canvas} />
}
