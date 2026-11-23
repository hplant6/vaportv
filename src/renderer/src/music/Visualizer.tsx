import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { VisualizerLook } from '../../../shared/types'
import { pacer } from '../background/pace'
import { markReleased, useGpuGeneration } from '../background/gpuRecovery'
import { compileScene } from '../background/compileScene'
import { musicAnalyser } from './player'
import { switcher } from './visualizerSwitch'

// Now playing's visualizer, beside the cover. Two looks, both fine wireframe meshes in neon,
// added onto the backdrop rather than painted over it:
//  - Orb: a sphere pushed in and out by slow noise, broken into islands where the noise dips,
//    magenta at the edges going to cyan and white on the crests, with contour bands like a
//    map's. The bass swells it and closes the gaps; the treble makes it shiver.
//  - Wave: the spectrum as a ridge, bass in the middle and treble out to both sides, each
//    moment rolling back into the distance; white-gold in the middle through cyan and violet
//    to magenta at the ends.
// "Both" has them take turns, cross-fading on a beat (visualizerSwitch.ts). Both are built and
// their shaders compiled before anything shows, and they share one canvas, so a change costs
// nothing then: the one coming in has been following the music all along.

/** 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT). */
const NOISE = /*glsl*/ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`

/** What each frame hands a look: the music, 0 to 1, measured against the song itself (a quiet
 *  track swings as far as a loud one). */
interface Levels {
  time: number
  bass: number
  mid: number
  high: number
  /** 1 on a kick (a jump in the bass), falling away over a few tenths of a second. */
  kick: number
  /** A kick landed this frame. */
  beat: boolean
  /** How loud it is overall, against the song's own quiet and loud. */
  energy: number
  /** Where the colours have turned to (radians): drifting, and swung round on the kicks. */
  hue: number
  /** The spectrum, low to high on a log scale, SPECTRUM_BANDS wide. */
  spectrum: Uint8Array
}

interface Look {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  update(levels: Levels, dt: number): void
  /** How strongly it shows, 0 to 1 (changing looks: fading and settling in). */
  setFade(fade: number): void
  /** The canvas's shape, and its height in CSS pixels (the shapes keep one size on screen however big the canvas). */
  resize(aspect: number, height: number): void
  dispose(): void
}

const SPECTRUM_BANDS = 128

/** Turns a colour round the colour wheel by `a` radians, keeping its brightness. */
const HUE_SHIFT = /*glsl*/ `
vec3 hueShift(vec3 c, float a) {
  const vec3 k = vec3(0.57735);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}
`

// ── Orb ──

const ORB_VERTEX = /*glsl*/ `
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uHigh;
uniform float uKick;
varying float vN;
varying float vFacing;
${NOISE}
void main() {
  vec3 p = position;
  float t = uTime;
  float n = snoise(p * 0.95 + vec3(0.0, t * 0.1, t * 0.06));
  n += 0.35 * snoise(p * 2.1 + vec3(t * 0.15, 0.0, -t * 0.08));
  // The bass pushes the hills out, a kick throws them further; the treble roughens the skin.
  float amp = 0.07 + uBass * 0.16 + uKick * 0.12 + uMid * 0.05;
  float d = n * amp + uHigh * 0.05 * snoise(p * 8.0 + t * 3.0);
  vN = n;
  vFacing = normalize(normalMatrix * normal).z;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p * (1.0 + d), 1.0);
}
`

const ORB_FRAGMENT = /*glsl*/ `
uniform vec3 uEdge;
uniform vec3 uCrest;
uniform vec3 uPeak;
uniform float uCut;
uniform float uAlpha;
uniform float uFade;
uniform float uHue;
uniform float uKick;
uniform float uEnergy;
uniform float uHigh;
varying float vN;
varying float vFacing;
${HUE_SHIFT}
void main() {
  if (vN < uCut) discard;
  float h = clamp((vN - uCut) / (1.1 - uCut), 0.0, 1.0);
  // Louder, the cyan climbs further down from the crests.
  vec3 col = mix(uEdge, uCrest, smoothstep(0.4 - uEnergy * 0.25, 0.8 - uEnergy * 0.2, h));
  col = mix(col, uPeak, smoothstep(0.85 - uHigh * 0.25, 1.05, h));
  col = hueShift(col, uHue + h * uEnergy * 0.5);
  // Contour bands, and a bright lip round each gap; a kick flashes the whole thing.
  float band = 0.6 + 0.4 * pow(abs(sin(vN * 16.0 - uKick * 2.0)), 6.0);
  float lip = 1.0 - smoothstep(0.0, 0.07, vN - uCut);
  float side = vFacing > 0.0 ? 1.0 : 0.28;
  float fade = smoothstep(0.0, 0.025, vN - uCut);
  float bright = (band + lip * 0.9) * (0.75 + uEnergy * 0.45 + uKick * 0.6);
  gl_FragColor = vec4(col * bright, uAlpha * side * fade * uFade);
}
`

/** The canvas height (CSS pixels) the looks' distances were tuned at. */
const SIZED_FOR = 720
/** The orb's distance at SIZED_FOR: about the cover's size. */
const ORB_DISTANCE = 3.95

function makeOrb(): Look {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50)
  camera.position.set(0, 0, ORB_DISTANCE)
  const uniforms = {
    uTime: { value: 0 },
    uBass: { value: 0 },
    uMid: { value: 0 },
    uHigh: { value: 0 },
    uKick: { value: 0 },
    uEnergy: { value: 0 },
    uHue: { value: 0 },
    uCut: { value: 0 },
    uFade: { value: 1 },
    uEdge: { value: new THREE.Color('#ff38d2') },
    uCrest: { value: new THREE.Color('#38e4ff') },
    uPeak: { value: new THREE.Color('#effcff') }
  }
  const geometry = new THREE.SphereGeometry(1, 200, 150)
  const material = (alpha: number, wireframe: boolean): THREE.ShaderMaterial =>
    new THREE.ShaderMaterial({
      uniforms: { ...uniforms, uAlpha: { value: alpha } },
      vertexShader: ORB_VERTEX,
      fragmentShader: ORB_FRAGMENT,
      wireframe,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    })
  // The mesh's lines, and a faint skin under them so the crests glow as surfaces.
  const wire = material(0.42, true)
  const skin = material(0.06, false)
  const group = new THREE.Group()
  group.add(new THREE.Mesh(geometry, skin), new THREE.Mesh(geometry, wire))
  group.rotation.set(0.4, 0, 0.2)
  scene.add(group)

  return {
    scene,
    camera,
    update({ time, bass, mid, high, kick, energy, hue }, dt) {
      uniforms.uTime.value = time
      uniforms.uBass.value = bass
      uniforms.uMid.value = mid
      uniforms.uHigh.value = high
      uniforms.uKick.value = kick
      uniforms.uEnergy.value = energy
      uniforms.uHue.value = hue
      // Louder closes the gaps; quiet passages break it apart.
      uniforms.uCut.value = 0.26 - energy * 0.26 - bass * 0.12 - kick * 0.14
      // Coming in, it grows to its size as it fades up.
      const settle = 0.8 + 0.2 * uniforms.uFade.value
      group.scale.setScalar((0.94 + bass * 0.04 + kick * 0.05) * settle)
      group.rotation.y += dt * (0.08 + energy * 0.35 + kick * 0.6)
      group.rotation.x = 0.4 + Math.sin(time * 0.13) * 0.25
    },
    setFade(fade) {
      uniforms.uFade.value = fade
    },
    resize(aspect, height) {
      camera.aspect = aspect
      // Further back on a taller canvas, so the orb stays the same size and the canvas is just room around it.
      camera.position.z = (ORB_DISTANCE * height) / SIZED_FOR
      camera.updateProjectionMatrix()
    },
    dispose() {
      geometry.dispose()
      wire.dispose()
      skin.dispose()
    }
  }
}

// ── Wave ──

/** Moments of the spectrum kept, front row newest. */
const WAVE_ROWS = 48
/** Rows pushed back per second. */
const WAVE_ROWS_PER_SECOND = 30
const WAVE_WIDTH = 4.2
const WAVE_DEPTH = 2.4
/** The ridge's distance at SIZED_FOR. */
const WAVE_DISTANCE = 5.67

const WAVE_VERTEX = /*glsl*/ `
uniform sampler2D uSpectrum;
uniform float uTime;
uniform float uKick;
uniform float uFade;
varying float vU;
varying float vH;
varying float vAge;
void main() {
  float u = abs(position.x) / ${(WAVE_WIDTH / 2).toFixed(2)};
  float age = (position.y + ${(WAVE_DEPTH / 2).toFixed(2)}) / ${WAVE_DEPTH.toFixed(2)};
  // Bass in the middle; the spectrum's log scale spread out to the sides.
  float s = texture2D(uSpectrum, vec2(pow(u, 0.85) * 0.92 + 0.01, age)).r;
  float h = s * 1.15 * (1.0 - 0.45 * u);
  // A low hump and a slow swell, so it's a landscape even in a quiet passage; a kick lifts the front.
  h += 0.1 * exp(-u * u * 3.0) + 0.05 * sin(position.x * 3.0 + uTime * 0.8 + position.y * 3.0) * (1.0 - u);
  h += uKick * 0.25 * exp(-u * u * 6.0) * (1.0 - age);
  h *= smoothstep(1.0, 0.82, u);
  // Coming in, the ridge rises out of the flat as it fades up.
  h *= 0.25 + 0.75 * uFade;
  vU = u;
  vH = h;
  vAge = age;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position.x, h, -position.y, 1.0);
}
`

const WAVE_FRAGMENT = /*glsl*/ `
uniform float uLevel;
uniform float uKick;
uniform float uHue;
uniform float uEnergy;
uniform float uFade;
varying float vU;
varying float vH;
varying float vAge;
${HUE_SHIFT}
vec3 ramp(float u) {
  vec3 c = vec3(1.0, 0.98, 0.84);
  c = mix(c, vec3(0.78, 1.0, 0.45), smoothstep(0.0, 0.1, u));
  c = mix(c, vec3(0.25, 0.94, 0.88), smoothstep(0.08, 0.22, u));
  c = mix(c, vec3(0.29, 0.6, 1.0), smoothstep(0.2, 0.38, u));
  c = mix(c, vec3(0.48, 0.32, 1.0), smoothstep(0.36, 0.56, u));
  c = mix(c, vec3(0.72, 0.24, 0.94), smoothstep(0.55, 0.85, u));
  return c;
}
void main() {
  // Louder, the hot middle colours spread further out; taller peaks run hotter still.
  float u = clamp(vU * (1.1 - uEnergy * 0.3) - vH * 0.06, 0.0, 1.0);
  vec3 col = hueShift(ramp(u), uHue * (0.3 + vU));
  float bright = 0.2 + vH * 0.8 + (1.0 - vU) * (0.1 + uLevel * 0.35) + uKick * 0.45 * (1.0 - vAge);
  float alpha = bright * pow(1.0 - vAge, 1.4) * smoothstep(1.0, 0.9, vU) * 0.32 * uFade;
  gl_FragColor = vec4(col, alpha);
}
`

const GLOW_FRAGMENT = /*glsl*/ `
uniform float uLevel;
uniform float uKick;
uniform float uHue;
uniform float uFade;
varying vec2 vUv;
${HUE_SHIFT}
void main() {
  vec2 d = (vUv - 0.5) * vec2(1.0, 2.2);
  float g = exp(-dot(d, d) * 14.0);
  gl_FragColor = vec4(hueShift(vec3(0.85, 1.0, 0.7), uHue * 0.5), g * (0.02 + uLevel * 0.2 + uKick * 0.25) * uFade);
}
`

function makeWave(): Look {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50)
  const history = new Uint8Array(SPECTRUM_BANDS * WAVE_ROWS)
  const texture = new THREE.DataTexture(history, SPECTRUM_BANDS, WAVE_ROWS, THREE.RedFormat, THREE.UnsignedByteType)
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  texture.needsUpdate = true
  const uniforms = { uSpectrum: { value: texture }, uTime: { value: 0 }, uLevel: { value: 0 }, uKick: { value: 0 }, uHue: { value: 0 }, uEnergy: { value: 0 }, uFade: { value: 1 } }
  const geometry = new THREE.PlaneGeometry(WAVE_WIDTH, WAVE_DEPTH, 240, WAVE_ROWS - 1)
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: WAVE_VERTEX,
    fragmentShader: WAVE_FRAGMENT,
    wireframe: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  })
  const glowGeometry = new THREE.PlaneGeometry(2.6, 1.3)
  const glowMaterial = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: GLOW_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  })
  const glow = new THREE.Mesh(glowGeometry, glowMaterial)
  glow.position.set(0, 0.55, -0.1)
  scene.add(glow, new THREE.Mesh(geometry, material))

  let owed = 0
  return {
    scene,
    camera,
    update({ time, bass, mid, kick, energy, hue, spectrum }, dt) {
      uniforms.uTime.value = time
      uniforms.uLevel.value = Math.min(1, bass * 0.7 + mid * 0.5)
      uniforms.uKick.value = kick
      uniforms.uHue.value = hue
      uniforms.uEnergy.value = energy
      owed += dt * WAVE_ROWS_PER_SECOND
      if (owed < 1) return
      const rows = Math.min(Math.floor(owed), WAVE_ROWS)
      owed -= Math.floor(owed)
      // Older moments roll back; the newest goes in front (rows repeat when frames are slow).
      history.copyWithin(SPECTRUM_BANDS * rows, 0, SPECTRUM_BANDS * (WAVE_ROWS - rows))
      for (let r = 0; r < rows; r++) history.set(spectrum, r * SPECTRUM_BANDS)
      texture.needsUpdate = true
    },
    setFade(fade) {
      uniforms.uFade.value = fade
    },
    resize(aspect, height) {
      camera.aspect = aspect
      // Further back on a taller canvas, so the ridge stays the same size.
      const distance = (WAVE_DISTANCE * height) / SIZED_FOR
      camera.position.set(0, distance * 0.22, distance)
      camera.lookAt(0, 0.62, -0.3)
      camera.updateProjectionMatrix()
    },
    dispose() {
      geometry.dispose()
      material.dispose()
      glowGeometry.dispose()
      glowMaterial.dispose()
      texture.dispose()
    }
  }
}

// ── The music ──

/**
 * Measures a level against the song's own range: the floor creeps up to the quiet and the
 * ceiling down to the loud over several seconds, and a new low or high moves them at once.
 * So a quiet track swings 0 to 1 as fully as a loud one.
 */
function gauge(minSpan = 0.08): (x: number, dt: number) => number {
  let low = 1
  let high = 0
  return (x, dt) => {
    low = x < low ? x : low + (x - low) * Math.min(1, dt * 0.15)
    high = x > high ? x : high + (x - high) * Math.min(1, dt * 0.12)
    return Math.min(1, Math.max(0, (x - low) / Math.max(high - low, minSpan)))
  }
}

/** Reads the analyser into Levels each frame: quick to rise, slower to fall, so it hits on the beat without flicker. */
function listener(): (playing: boolean, dt: number) => Levels {
  const bins = new Uint8Array(512)
  const spectrum = new Uint8Array(SPECTRUM_BANDS)
  const smooth = new Float32Array(SPECTRUM_BANDS)
  /** Each band's slow average, taken off so what changes stands out over what holds. */
  const floor = new Float32Array(SPECTRUM_BANDS)
  // Each band's place among the bins (fractional, read between two), log spaced from about
  // 70Hz to 12kHz at fftSize 1024: whole bins would make the bass a staircase.
  const at = Array.from({ length: SPECTRUM_BANDS }, (_, i) => 1.5 * Math.pow(250 / 1.5, i / (SPECTRUM_BANDS - 1)))
  const levels: Levels = { time: 0, bass: 0, mid: 0, high: 0, kick: 0, beat: false, energy: 0, hue: 0, spectrum }
  const bassGauge = gauge()
  const midGauge = gauge()
  const highGauge = gauge()
  const energyGauge = gauge(0.05)
  let bassSlow = 0
  let sinceKick = 1
  /** The kicks' swing of the colours: thrown one way then the other, easing back. */
  let swing = 0
  let swingSpeed = 0
  let side = 1
  const average = (from: number, to: number): number => {
    let sum = 0
    for (let i = from; i < to; i++) sum += bins[i]
    return sum / (to - from) / 255
  }
  const follow = (was: number, now: number, fall = 0.1): number => was + (now - was) * (now > was ? 0.6 : fall)
  return (playing, dt) => {
    // Paused, it slows to a drift rather than stopping dead.
    levels.time += dt * (playing ? 1 : 0.25)
    const analyser = playing ? musicAnalyser() : null
    if (analyser) analyser.getByteFrequencyData(bins)
    else bins.fill(0)
    const bass = analyser ? bassGauge(average(1, 6), dt) : 0
    levels.bass = follow(levels.bass, bass)
    levels.mid = follow(levels.mid, analyser ? midGauge(average(6, 60), dt) : 0)
    levels.high = follow(levels.high, analyser ? highGauge(average(60, 250), dt) : 0)
    levels.energy = follow(levels.energy, analyser ? energyGauge(average(1, 250), dt) : 0, 0.04)

    // A kick: the bass jumping well above where it's been lately.
    sinceKick += dt
    levels.beat = false
    if (bass - bassSlow > 0.22 && bass > 0.55 && sinceKick > 0.2) {
      levels.kick = 1
      levels.beat = true
      sinceKick = 0
      swingSpeed += side * (1.0 + levels.energy * 1.2)
      side = -side
    }
    bassSlow += (bass - bassSlow) * Math.min(1, dt * 4)
    levels.kick *= Math.exp(-dt * 5)

    // The colours: a slow drift round, louder drifting faster, and a springy swing on each kick.
    swingSpeed += -swing * 9 * dt - swingSpeed * 3 * dt
    swing += swingSpeed * dt
    levels.hue = Math.sin(levels.time * (0.05 + levels.energy * 0.04)) * 0.3 + swing

    for (let b = 0; b < SPECTRUM_BANDS; b++) {
      const i = Math.floor(at[b])
      const level = (bins[i] + (bins[i + 1] - bins[i]) * (at[b] - i)) / 255
      floor[b] += (level - floor[b]) * Math.min(1, dt * 0.5)
      // The analyser's in decibels, nearly never silent: some of the level as it is, and the
      // rise over its own average made large, so hits stand out; the treble (quieter than it
      // sounds) lifted toward the top.
      const base = Math.max(0, (level - 0.35) / 0.65)
      const rise = Math.max(0, level - floor[b]) * 4
      const v = Math.min(1, (base * 0.45 + rise) * (1 + (b / SPECTRUM_BANDS) * 0.8))
      smooth[b] += (v - smooth[b]) * (v > smooth[b] ? 0.7 : 0.14)
      spectrum[b] = Math.round(smooth[b] * 255)
    }
    return levels
  }
}

function VisualizerCanvas({ look, playing }: { look: Exclude<VisualizerLook, 'off'>; playing: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const playingRef = useRef(playing)
  playingRef.current = playing
  useEffect(() => {
    const host = box.current
    if (!host) return
    const canvas = document.createElement('canvas')
    canvas.className = 'music-visualizer-canvas'
    host.appendChild(canvas)
    let stopped = false
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' })
    renderer.setClearColor(0x000000, 0)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    // Cleared once a frame, then each look showing drawn over it (they add light, so they blend).
    renderer.autoClear = false
    const looks = look === 'both' ? [makeOrb(), makeWave()] : [look === 'orb' ? makeOrb() : makeWave()]
    const fit = (): void => {
      // The canvas, not its box: it spills past it for the glow.
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h, false)
      for (const l of looks) l.resize(w / h, h)
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(host)
    const listen = listener()
    const turns = switcher(looks.length)
    const due = pacer()
    let frame = 0
    let last = performance.now()
    const tick = (now: number): void => {
      frame = requestAnimationFrame(tick)
      if (!due(now)) return
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      const levels = listen(playingRef.current, dt)
      const fades = turns(levels.beat, levels.energy, playingRef.current, dt)
      renderer.clear()
      looks.forEach((l, i) => {
        // Every look follows the music, shown or not, so the next one comes in already moving.
        l.setFade(fades[i])
        l.update(levels, dt)
        if (fades[i] > 0.001) renderer.render(l.scene, l.camera)
      })
    }
    // Shaders compiled first, so the screen doesn't stall on the first frame; then each look is
    // drawn once, unseen, so its first real frame has nothing left to upload (the wireframes'
    // lines, the spectrum's texture); then it fades in.
    void Promise.all(looks.map((l) => compileScene(renderer, l.scene, l.camera, () => stopped))).then(() => {
      if (stopped) return
      for (const l of looks) {
        l.setFade(0)
        renderer.render(l.scene, l.camera)
      }
      renderer.clear()
      last = performance.now()
      frame = requestAnimationFrame(tick)
      canvas.classList.add('ready')
    })
    return () => {
      stopped = true
      cancelAnimationFrame(frame)
      observer.disconnect()
      for (const l of looks) l.dispose()
      markReleased(canvas)
      renderer.forceContextLoss()
      renderer.dispose()
      canvas.remove()
    }
  }, [look])
  return <div ref={box} className={`music-visualizer ${look}`} aria-hidden="true" />
}

/** The visualizer chosen in Settings (nothing for None), started again after the GPU resets. */
export function Visualizer({ look, playing }: { look: VisualizerLook; playing: boolean }) {
  const generation = useGpuGeneration()
  if (look === 'off') return null
  return <VisualizerCanvas key={`${look}-${generation}`} look={look} playing={playing} />
}
