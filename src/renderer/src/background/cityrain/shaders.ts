// GLSL for City Rain: the ground's puddles and rain rings (patched into three's standard
// material), and the falling streaks.

/** Declarations and helpers for the ground: puddle mask and raindrop rings. */
export const GROUND_PARS = /*glsl*/ `
varying vec3 vWorld;
uniform float uTime;

float rhash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float rnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(rhash(i), rhash(i + vec2(1.0, 0.0)), u.x), mix(rhash(i + vec2(0.0, 1.0)), rhash(i + vec2(1.0, 1.0)), u.x), u.y);
}

// 0 dry(ish) asphalt .. 1 standing water. Patches from noise, plus one big puddle that's
// always in the middle, where the camera looks.
float puddleMask(vec2 p) {
  float n = 0.6 * rnoise(p * 0.45) + 0.3 * rnoise(p * 1.1 + 7.0) + 0.1 * rnoise(p * 4.0);
  n += 0.45 * (1.0 - smoothstep(0.5, 3.2, length(p)));
  return smoothstep(0.6, 0.66, n);
}

// Raindrop rings on standing water: the slope (d/dx, d/dz) of the surface. Each cell of
// a grid has one drop landing in it at a time, somewhere random, on its own beat; its ring
// spreads out and fades. Neighbouring cells are summed so rings cross cell edges.
const float CELL = 0.32;
vec2 ripples(vec2 p, float t) {
  vec2 slope = vec2(0.0);
  vec2 g = p / CELL;
  vec2 base = floor(g);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 cell = base + vec2(float(x), float(y));
      // Two drops per cell, offset in time, so the water never goes still.
      for (int k = 0; k < 2; k++) {
        vec2 key = cell + float(k) * 17.31;
        float rate = 0.7 + 0.6 * rhash(key + 3.7);
        float phase = t * rate + rhash(key + 9.1);
        float age = fract(phase);
        // A new spot for each drop.
        vec2 at = cell + vec2(rhash(key + floor(phase) * 1.3), rhash(key + 5.0 + floor(phase) * 2.1));
        vec2 d = g - at;
        float dist = length(d);
        float radius = age * 1.4;
        // A few wavelengths around the leading edge, fading as it grows.
        float x = (dist - radius) * 22.0;
        float wave = cos(x) * exp(-x * x * 0.08) * (1.0 - age) * (1.0 - age);
        slope += (dist > 0.0001 ? d / dist : vec2(0.0)) * wave;
      }
    }
  }
  return slope * 0.11;
}
`

/** After map_fragment: wet asphalt is darker; standing water is almost all reflection. */
export const GROUND_COLOUR = /*glsl*/ `
  diffuseColor.rgb *= mix(0.28, 0.06, puddle);
`

/**
 * After aomap_fragment: the city's light off the asphalt. Rough wet asphalt only catches
 * a dull sheen of it; standing water reflects it all.
 */
export const GROUND_LIGHT = /*glsl*/ `
  reflectedLight.indirectSpecular *= mix(0.14, 1.0, puddle);
  reflectedLight.indirectDiffuse *= mix(0.35, 1.0, puddle);
`

/** After roughnessmap_fragment: wet asphalt is glossier than dry; standing water is a mirror. */
export const GROUND_ROUGHNESS = /*glsl*/ `
  roughnessFactor = mix(roughnessFactor * 0.55, 0.02, puddle);
`

/** After normal_fragment_maps: standing water lies flat (no asphalt bumps), stirred by the rings. */
export const GROUND_NORMALS = /*glsl*/ `
  {
    vec2 slope = ripples(vWorld.xz, uTime) * puddle;
    vec3 waterWorld = normalize(vec3(-slope.x, 1.0, -slope.y));
    vec3 water = normalize((viewMatrix * vec4(waterWorld, 0.0)).xyz);
    normal = normalize(mix(normal, water, puddle));
  }
`

/** Rain streaks: each instance a thin quad that falls through a box round the camera, turned to face it. */
export const RAIN_VERTEX = /*glsl*/ `
attribute vec4 seed;
uniform float uTime;
uniform vec3 uCentre;
uniform vec2 uBox;     // radius, height
uniform float uSpeed;
varying float vFade;
varying float vAlong;

void main() {
  // A spot in the box, which wraps as the camera moves so it's always full.
  vec2 offset = (seed.xy * 2.0 - 1.0) * uBox.x;
  vec2 xz = uCentre.xz + mod(offset - uCentre.xz + uBox.x, 2.0 * uBox.x) - uBox.x;
  float speed = uSpeed * (0.8 + 0.4 * seed.z);
  float y = uBox.y - mod(uTime * speed + seed.w * uBox.y, uBox.y);
  vec3 origin = vec3(xz.x, y, xz.y);

  // A streak as long as the drop falls in about 1/30 s, and thin; turned about its
  // upright axis to face the camera.
  float len = speed / 30.0;
  vec3 toCamera = normalize(vec3(cameraPosition.x - origin.x, 0.0, cameraPosition.z - origin.z));
  vec3 side = vec3(-toCamera.z, 0.0, toCamera.x);
  vec3 world = origin + side * position.x * 0.008 + vec3(0.0, position.y * len, 0.0);

  // Fainter far off, and none right in front of the lens.
  float dist = distance(world, cameraPosition);
  vFade = smoothstep(0.4, 1.2, dist) * (1.0 - smoothstep(4.0, 7.0, dist)) * (0.5 + 0.5 * seed.z);
  vAlong = position.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`

export const RAIN_FRAGMENT = /*glsl*/ `
varying float vFade;
varying float vAlong;

void main() {
  // Brightest at the head, fading along the tail.
  float a = vFade * vAlong * 0.55;
  gl_FragColor = vec4(vec3(0.75, 0.8, 0.9) * a, a);
}
`

/** The mist ring: placed round the camera; its height (0..1) is passed on for the fade. */
export const MIST_VERTEX = /*glsl*/ `
uniform vec3 uCentre;
uniform float uHeight;
varying float vUp;
void main() {
  vUp = position.y / uHeight;
  vec3 world = position + vec3(uCentre.x, 0.0, uCentre.z);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`

export const MIST_FRAGMENT = /*glsl*/ `
uniform vec3 uColour;
varying float vUp;
void main() {
  gl_FragColor = vec4(uColour, 1.0 - smoothstep(0.0, 0.45, vUp));
  #include <colorspace_fragment>
}
`
