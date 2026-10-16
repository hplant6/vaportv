// Gradient Drift's passes, from Liam Egan's pen (codepen.io/shubniggurath, "Gradient Drift";
// MIT). The blur and glass shaders are the pen's own; the pen drew each circle as its
// own mesh, here they're all drawn in one fullscreen pass.

export const MAX_CIRCLES = 12

/** Fullscreen triangle; v_uv runs 0..1 across the screen. */
export const fullscreenVert = /*glsl*/ `#version 300 es
in vec2 position;
out vec2 v_uv;

void main() {
  v_uv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const hashChunk = /*glsl*/ `float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
`

const ditherChunk = /*glsl*/ `float ditherHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Breaks up 8-bit banding in smooth gradients. strength 0 disables.
vec3 dither8(vec3 color, vec2 fragCoord, float strength) {
  return color + (ditherHash12(fragCoord) - 0.5) * (1.0 / 255.0) * strength;
}
`

/**
 * The drifting circles over the background, blended back to front as the pen's
 * transparent meshes were: each a soft-edged disc, alpha-over the ones before it.
 */
export const circlesFrag = /*glsl*/ `#version 300 es
precision highp float;

uniform vec2 u_size;          // scene size in stage pixels
uniform vec3 u_background;
uniform int u_count;
uniform vec3 u_circle[${MAX_CIRCLES}]; // centre (stage pixels from the middle, y up), radius
uniform vec3 u_color[${MAX_CIRCLES}];
uniform float u_opacity;
uniform float u_feather;

in vec2 v_uv;
out vec4 color;

// Soft-edged disc: feather is the width of the falloff as a fraction of the
// radius (0 = hard edge, 1 = fades from the centre).
float softDisc(float d, float feather) {
  return 1.0 - smoothstep(1.0 - feather, 1.0, d);
}

void main() {
  vec2 p = (v_uv - 0.5) * u_size;
  vec3 rgb = u_background;
  for (int i = 0; i < ${MAX_CIRCLES}; i++) {
    if (i >= u_count) break;
    float d = length(p - u_circle[i].xy) / u_circle[i].z;
    rgb = mix(rgb, u_color[i], softDisc(d, u_feather) * u_opacity);
  }
  color = vec4(rgb, 1.0);
}
`

/** One axis of a separable gaussian blur. Run twice: u_direction (1,0) then (0,1). */
export const blurFrag = /*glsl*/ `#version 300 es
precision highp float;

uniform sampler2D u_input;
uniform vec2 u_resolution; // size of the texture being sampled, in pixels
uniform vec2 u_direction;
uniform float u_sigma;

in vec2 v_uv;
out vec4 color;

float gaussianWeight(float x, float sigma) {
  return exp(-0.5 * (x * x) / (sigma * sigma));
}

const int MAX_RADIUS = 96;

void main() {
  if (u_sigma < 0.01) {
    color = texture(u_input, v_uv);
    return;
  }
  vec2 texel = u_direction / u_resolution;
  int radius = int(min(ceil(u_sigma * 3.0), float(MAX_RADIUS)));

  float w0 = gaussianWeight(0.0, u_sigma);
  vec4 accum = texture(u_input, v_uv) * w0;
  float total = w0;

  // Each pair of adjacent taps collapses into one fetch: sampling between
  // texels i and i+1, offset in proportion to their weights, makes the
  // hardware's linear filter compute the weighted sum.
  for (int i = 1; i <= MAX_RADIUS; i += 2) {
    if (i > radius) break;
    float w1 = gaussianWeight(float(i), u_sigma);
    float w2 = i < radius ? gaussianWeight(float(i + 1), u_sigma) : 0.0;
    float w = w1 + w2;
    vec2 offset = texel * (float(i) + w2 / w);
    accum += (texture(u_input, v_uv + offset) + texture(u_input, v_uv - offset)) * w;
    total += w * 2.0;
  }
  color = accum / total;
}
`

/**
 * Two reeded / fluted glass panes in front of the blurred circles, in one pass.
 * Each cell is a rib with a curved cross-section: the view ray is refracted through
 * its normal (crown glass) and projected over `strength` onto the background, and
 * the same normal drives a specular highlight and groove darkening. The wave bends
 * the glass, not the background.
 */
export const distortFrag = /*glsl*/ `#version 300 es
precision highp float;

uniform sampler2D u_input;
uniform vec3 u_lightDir;       // normalized direction toward the light
uniform float u_specIntensity; // specular highlight strength
uniform float u_specPower;     // specular exponent: higher = tighter, glossier
uniform float u_waveAmp;       // glass wave amplitude, in uv space (0 = straight ribs)
uniform float u_waveScale;     // glass wave frequency, waves across the screen
uniform float u_wavePhase;     // glass wave phase offset
uniform vec2 u_waveOffset;     // uv-space translation of the glass pattern
uniform float u_dither;

// Per-layer params. on = 0 removes the layer entirely (offset and shading).
uniform float u_on1;
uniform float u_axis1;     // 0 = ribs run vertically (cells along x), 1 = horizontal
uniform float u_cells1;
uniform float u_strength1; // glass-to-background distance, in uv space
uniform float u_bulge1;    // rib profile height: 0 = flat pane, 1 = half-cylinder
uniform float u_soft1;     // ridge profile: 0 = hard creases, 1 = smooth sine ripple
uniform float u_shading1;  // groove darkening amount
uniform float u_jitter1;   // per-cell random offset, in uv space
uniform float u_blend1;    // edge fade, as a fraction of a cell (anti-alias)

uniform float u_on2;
uniform float u_axis2;
uniform float u_cells2;
uniform float u_strength2;
uniform float u_bulge2;
uniform float u_soft2;
uniform float u_shading2;
uniform float u_jitter2;
uniform float u_blend2;

in vec2 v_uv;
out vec4 color;

${hashChunk}
${ditherChunk}

const float IOR = 1.52; // crown glass
const float TAU = 6.28318530718;

// Guide curve x = f(t) and its derivative: a base sine plus a detuned
// second harmonic for an organic, non-repeating undulation.
float waveF(float t) {
  float w1 = u_waveScale * TAU;
  float w2 = u_waveScale * TAU * 2.7;
  return u_waveAmp * (sin(t * w1 + u_wavePhase) + 0.35 * sin(t * w2 + u_wavePhase * 1.3 + 1.7));
}

float waveDf(float t) {
  float w1 = u_waveScale * TAU;
  float w2 = u_waveScale * TAU * 2.7;
  return u_waveAmp * (w1 * cos(t * w1 + u_wavePhase) + 0.35 * w2 * cos(t * w2 + u_wavePhase * 1.3 + 1.7));
}

struct Pane {
  vec2 offset;  // uv-space sample displacement
  float shade;  // additive rgb term: specular minus groove darkening
};

Pane pane(
  float on, float axis, float cells, float strength, float bulge,
  float soft, float shading, float jitter, float blend
) {
  // Rib space: p.x runs across the ribs, p.y along them. The offset slides
  // the glass pattern over the (stationary) background.
  vec2 p = mix(v_uv, v_uv.yx, axis) + mix(u_waveOffset, u_waveOffset.yx, axis);

  // Wavy glass space: p lies on exactly one shifted copy of the guide curve;
  // s says which one, measured perpendicular to the wave.
  float df = waveDf(p.y);
  vec2 tangent = normalize(vec2(df, 1.0));
  vec2 normalDir = vec2(tangent.y, -tangent.x);
  float s = (p.x - waveF(p.y)) * tangent.y;

  float scaled = s * cells;
  float id = floor(scaled);
  float local = fract(scaled);
  float c = local * 2.0 - 1.0; // -1..1 across the rib

  // Normal from the surface slope, between a half-cylinder (hard creases) and a
  // cosine ripple (smooth rolled-glass waves).
  float h = sqrt(max(1.0 - c * c, 1e-4));
  float slopeHard = c / h;
  float slopeSoft = 1.5708 * sin(3.14159265 * c);
  float slope = bulge * mix(slopeHard, slopeSoft, soft);
  vec2 n = normalize(vec2(slope, 1.0));

  // Refract the view ray in the rib cross-section plane and project it onto the background.
  vec3 r = refract(vec3(0.0, 0.0, -1.0), vec3(n.x, 0.0, n.y), 1.0 / IOR);
  float offset = (r.x / max(abs(r.z), 1e-3)) * strength;
  offset += (hash11(id) - 0.5) * jitter;

  float edge = smoothstep(0.0, blend, local) * smoothstep(1.0, 1.0 - blend, local);
  offset *= edge;

  vec2 dir = mix(normalDir, normalDir.yx, axis);

  // Blinn-Phong specular against the shared light, plus slight groove darkening
  // where the surface turns away. Both vanish on a flat pane.
  vec3 N = normalize(vec3(slope * dir, 1.0));
  vec3 H = normalize(u_lightDir + vec3(0.0, 0.0, 1.0)); // view is straight-on
  float spec = pow(max(dot(N, H), 0.0), u_specPower) * u_specIntensity;
  float groove = 1.0 - n.y;

  return Pane(dir * offset * on, (spec - groove * 0.4 * shading) * on);
}

void main() {
  Pane p1 = pane(u_on1, u_axis1, u_cells1, u_strength1, u_bulge1, u_soft1, u_shading1, u_jitter1, u_blend1);
  Pane p2 = pane(u_on2, u_axis2, u_cells2, u_strength2, u_bulge2, u_soft2, u_shading2, u_jitter2, u_blend2);

  color = texture(u_input, v_uv + p1.offset + p2.offset);
  color.rgb += p1.shade + p2.shade;
  color.rgb = dither8(color.rgb, gl_FragCoord.xy, u_dither);
}
`
