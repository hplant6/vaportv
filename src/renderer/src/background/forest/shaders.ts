// GLSL for the forest. The simplex noise and ground blend are from EZ-Tree's demo (MIT).

/** 2D simplex noise (ashima/webgl-noise), for the wind and the ground's grass/dirt patches. */
export const WIND_NOISE = /*glsl*/ `
vec3 fmod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 fmod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 fpermute(vec3 x) { return fmod289(((x * 34.0) + 1.0) * x); }
float simplex2d(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = fmod289(i);
  vec3 p = fpermute(fpermute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
`

/** The ground's colour: grass, with bare dirt where the noise is high (as the grass is thinned there). */
export const GROUND_FRAGMENT = (scale: number, patchiness: number): string => /*glsl*/ `
  vec2 groundUv = vWorld.xz;
  vec3 grassColor = texture2D(uGrass, groundUv / 30.0).rgb;
  vec3 dirtColor = texture2D(uDirt, groundUv / 30.0).rgb;
  float patchN = 0.5 + 0.5 * simplex2d(groundUv / ${scale.toFixed(1)});
  float bare = smoothstep(${(patchiness - 0.1).toFixed(2)}, ${(patchiness + 0.1).toFixed(2)}, patchN);
  diffuseColor *= vec4(mix(grassColor, dirtColor, bare), 1.0);
`

export const SKY_VERTEX = /*glsl*/ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

/** A gradient sky with a sun by day, a moon and stars by night. */
export const SKY_FRAGMENT = /*glsl*/ `
varying vec3 vDir;
uniform vec3 uHigh;
uniform vec3 uLow;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uDay;
uniform float uStars;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

void main() {
  vec3 dir = normalize(vDir);
  // Pale at the horizon (where the fog meets it), deepening overhead.
  float up = clamp(dir.y, 0.0, 1.0);
  vec3 color = mix(uLow, uHigh, pow(up, 0.55));

  float facing = max(dot(dir, normalize(uSunDir)), 0.0);
  // The sun: a disc and a wide glow. The moon: a small pale disc.
  color += uDay * uSunColor * (pow(facing, 2000.0) * 8.0 + pow(facing, 12.0) * 0.35);
  color += (1.0 - uDay) * vec3(0.85, 0.9, 1.0) * smoothstep(0.9993, 0.9996, facing);

  // Stars: a sparse sprinkle on a grid of directions, each a soft point in its cell, fading out towards the horizon.
  vec3 grid = dir * 420.0;
  vec3 cell = floor(grid);
  vec3 centre = cell + 0.5 + 0.35 * (vec3(hash(cell + 1.0), hash(cell + 2.0), hash(cell + 3.0)) - 0.5);
  float point = 1.0 - smoothstep(0.08, 0.3, length(grid - centre));
  float star = step(0.993, hash(cell)) * point * (0.3 + 0.7 * hash(cell + 7.0));
  color += uStars * star * smoothstep(0.05, 0.35, dir.y) * vec3(0.9, 0.95, 1.0);

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`
