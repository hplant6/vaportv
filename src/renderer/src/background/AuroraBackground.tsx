import { useEffect, useRef } from 'react'
import { NOISE, startShaderBackdrop, type Looks } from './shaderBackdrop'
import layer0 from '../assets/aurora/layer0.svg'
import layer1 from '../assets/aurora/layer1.svg'
import layer2 from '../assets/aurora/layer2.svg'
import layer3 from '../assets/aurora/layer3.svg'
import layer4 from '../assets/aurora/layer4.svg'

// Northern Lights: aurora curtains over mountains and pine forest, mirrored in a still lake.
// The aurora comes out after dark; by day it's the same shore under a winter sky. The sky,
// aurora and water are one shader; the land is Henry's SVG layers, drawn at the screen's
// own resolution and handed to the shader as textures.

/** The layers' artboard, in artboard pixels. */
const ART_W = 1920
const ART_H = 1080
/** Where the far shore meets the water: the bottom of layers 1 to 4. */
const WATERLINE = 693.8
/** The bottom of the near shore (layer 0), which stands in the water in front. */
const NEAR_SHORE = 743.4
/** The waterline in screen units from the middle (height = 1), where it is on the artboard. */
const HORIZON = 0.5 - WATERLINE / ART_H

/** A layer and where it sits on the artboard (layer 2 was exported cropped to its own height). */
interface Layer {
  src: string
  top: number
  height: number
}

const FAR: Layer[] = [
  { src: layer4, top: 0, height: ART_H },
  { src: layer3, top: 0, height: ART_H },
  { src: layer2, top: WATERLINE - 360.18, height: 360.18 },
  { src: layer1, top: 0, height: ART_H }
]
const NEAR: Layer[] = [{ src: layer0, top: 0, height: ART_H }]

/** Paints layers, back to front, onto a canvas the size of the backdrop's: the artboard spans its width, with the waterline on HORIZON. */
function paint(layers: Layer[]) {
  return async (width: number, height: number): Promise<HTMLCanvasElement> => {
    const images = await Promise.all(
      layers.map(async ({ src }) => {
        const image = new Image()
        image.src = src
        await image.decode()
        return image
      })
    )
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!
    const k = width / ART_W
    const waterline = (0.5 - HORIZON) * height
    layers.forEach(({ top, height: tall }, i) => ctx.drawImage(images[i], 0, waterline + (top - WATERLINE) * k, width, tall * k))
    return canvas
  }
}

/** Looks by time of day (see shaderBackdrop). uLand tints the land layers: their own colours by day, dimmed and cooled at night. */
const LOOKS: Looks = [
  [0.0, { uSkyHigh: '#34477e', uSkyLow: '#e9a98a', uNear: '#151b24', uLand: '#c8a8a4', uAurora: 0.1 }],
  [0.1, { uSkyHigh: '#3a6cb4', uSkyLow: '#bcd4ea', uNear: '#1a2622', uLand: '#ffffff', uAurora: 0 }],
  [0.88, { uSkyHigh: '#3a62ac', uSkyLow: '#d9cbc4', uNear: '#18221f', uLand: '#f2e6e2', uAurora: 0 }],
  [1.0, { uSkyHigh: '#2a3570', uSkyLow: '#f09a72', uNear: '#12161e', uLand: '#c09a98', uAurora: 0 }],
  [1.06, { uSkyHigh: '#0d1534', uSkyLow: '#3a3452', uNear: '#080b12', uLand: '#5f6a80', uAurora: 0.3 }],
  [1.15, { uSkyHigh: '#02040c', uSkyLow: '#0a1626', uNear: '#03060a', uLand: '#4f6a78', uAurora: 1 }],
  [1.85, { uSkyHigh: '#02040c', uSkyLow: '#0a1626', uNear: '#03060a', uLand: '#4f6a78', uAurora: 1 }],
  [1.94, { uSkyHigh: '#0e1636', uSkyLow: '#3a3654', uNear: '#090c13', uLand: '#5f6a80', uAurora: 0.35 }]
]

const FRAGMENT = /*glsl*/ `
uniform vec3 uSkyHigh, uSkyLow, uNear, uLand;
uniform float uAurora;
uniform sampler2D uFar, uNear0;
${NOISE}

const float HORIZON = ${HORIZON.toFixed(5)};

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

// A land layer at uv, from the texture painted for the screen.
vec4 land(sampler2D layer, vec2 uv) {
  return texture2D(layer, (uv * uR.y + 0.5 * uR) / uR);
}

// The scene above the water line at uv: sky, then the far mountains and forest.
vec3 scene(vec2 uv) {
  vec4 far = land(uFar, uv);
  if (far.a >= 1.0) return far.rgb * uLand;
  return mix(sky(uv), far.rgb * uLand, far.a);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uR) / uR.y;
  float ripple = 0.004 * sin(uv.y * 160.0 + uT * 0.8);
  vec3 col;
  if (uv.y >= HORIZON) col = scene(uv);
  else {
    // The lake: the scene mirrored, darkened, with slow ripples breaking up the reflection.
    float depth = HORIZON - uv.y;
    col = scene(vec2(uv.x + ripple * smoothstep(0.0, 0.1, depth), HORIZON + depth)) * 0.55;
    // The near shore's own reflection, mirrored at its foot.
    float shore = HORIZON - (${NEAR_SHORE} - ${WATERLINE}) * uR.x / ${ART_W.toFixed(1)} / uR.y;
    if (uv.y < shore) {
      float d = shore - uv.y;
      vec4 mirrored = land(uNear0, vec2(uv.x + ripple * smoothstep(0.0, 0.1, d), shore + d));
      col = mix(col, mirrored.rgb * uLand * 0.55, mirrored.a);
    }
    col = mix(col, uNear, smoothstep(0.1, 0.3, depth) * 0.6);
  }
  vec4 near = land(uNear0, uv);
  col = mix(col, near.rgb * uLand, near.a);
  // A touch of noise, a fraction of one 8-bit step, so the long dark gradients don't band.
  col += (hash2(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`

/** Northern lights over a lake among mountains, following the time of day. Calls onUnavailable if WebGL can't run it. */
export function AuroraBackground({ onUnavailable }: { onUnavailable: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    try {
      // Drawn at the screen's own resolution: stretched up from the stage's, the land's
      // edges and the aurora's fine rays go soft and stair-stepped.
      return startShaderBackdrop(canvas.current!, { fragment: FRAGMENT, looks: LOOKS, native: true, textures: { uFar: paint(FAR), uNear0: paint(NEAR) } })
    } catch (err) {
      console.error('steamtv: northern lights backdrop unavailable:', err)
      onUnavailable()
      return undefined
    }
  }, [onUnavailable])

  return <canvas className="stage-canvas" ref={canvas} />
}
