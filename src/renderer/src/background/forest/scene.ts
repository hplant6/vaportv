import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Tree } from '@dgreenheck/ez-tree'
import { DEFAULT_SUN_TIMES, type SunTimes } from '../../../../shared/sun'
import type { BackdropTime } from '../../../../shared/types'
import { WEATHER_CHANGED_EVENT } from '../../components/LocationDialog'
import { BACKDROP_CHANGED_EVENT } from '../SeaBackground'
import { heldMinutes, minutesOfDay, pinnedMinutes, sceneAt } from '../timeOfDay'
import { stageHeight } from '../../stage'
import { pacer } from '../pace'
import { simplex2d } from './noise'
import { GROUND_FRAGMENT, SKY_FRAGMENT, SKY_VERTEX, WIND_NOISE } from './shaders'

// Forest: a slow walk along a trail through a thick pine forest, lit by the time of day.
// The trees are Daniel Greenheck's EZ-Tree (MIT); the grass, flowers and ground are
// from its demo (src/app), with the wind shaders reworked for instancing. A handful
// of trees are generated once, then each is drawn hundreds of times as instances.

const WIDTH = 1920
const HEIGHT = stageHeight()
const ASSETS = 'backdrops/forest/'

/** Tree kinds and how many of each; every kind is one generated tree, instanced. Several seeds per size, so no two look alike side by side. */
const KINDS: { preset: string; count: number; seed: number }[] = [
  { preset: 'Pine Large', count: 60, seed: 2268 },
  { preset: 'Pine Large', count: 60, seed: 5193 },
  { preset: 'Pine Large', count: 55, seed: 8821 },
  { preset: 'Pine Medium', count: 70, seed: 6650 },
  { preset: 'Pine Medium', count: 70, seed: 1407 },
  { preset: 'Pine Medium', count: 65, seed: 9334 },
  { preset: 'Pine Small', count: 60, seed: 3071 },
  { preset: 'Pine Small', count: 60, seed: 7458 }
]
/** Trees fill everything out to here (the fog has swallowed them well before), but for the trail. */
const TREE_MAX_R = 340
/** The camera walks a trail round this ring, low down, as if on foot. */
const WALK_R = 70
const EYE_HEIGHT = 7
/** Trees keep at least this far from the middle of the trail (saplings may come a little closer). */
const TRAIL_CLEAR = 17
const SAPLING_CLEAR = 11
/** The trail's bare dirt: no grass within this of its middle, thinning out to TRAIL_EDGE. */
const TRAIL_HALF = 4.5
const TRAIL_EDGE = 8
/** Radians per second round the ring: once round in about 17 minutes. */
const WALK_SPEED = 0.006

/** Blades, planted in tufts of a few, with ground showing between them. */
const GRASS_COUNT = 26000
const GRASS_MAX_R = 280
const TUFT_BLADES = { min: 3, max: 8 }
const TUFT_RADIUS = 1.5
/** Flowers grow in little clusters, mostly in the grass either side of the trail. */
const FLOWER_CLUSTERS_PER_COLOR = 170
const FLOWERS_PER_CLUSTER = { min: 2, max: 5 }
/** Pebbles: on the trail and the dirt mostly, a few in the grass. */
const PEBBLES = 2400
const PEBBLE_SHAPES = 5
/** How far either side of the trail flowers and pebbles are strewn (beyond, they'd be too small to see). */
const STREWN = 45
/** Dirt patches: the noise's scale (world units), and the level above which it's bare (lower is more dirt). */
const PATCH_SCALE = 90
const PATCHINESS = 0.6
/** How often a tuft still grows out on the dirt. */
const DIRT_TUFTS = 0.08

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x))

// -- Time of day ---------------------------------------------------------------

/** One look of the sky and light. Colours are sRGB hex. */
interface Look {
  skyHigh: number
  skyLow: number
  light: number
  lightIntensity: number
  ambient: number
  ambientIntensity: number
}

/**
 * Looks keyed by sceneAt's `sun`: 0 sunrise, 1 sunset, 1..2 overnight. The light is the
 * sun by day and the moon by night; it fades out round each handover (1.04 and 1.96).
 */
const LOOKS: [at: number, look: Look][] = [
  [0.0, { skyHigh: 0x3a5f9e, skyLow: 0xf0a070, light: 0xffa060, lightIntensity: 0.9, ambient: 0x8090b0, ambientIntensity: 0.5 }],
  [0.1, { skyHigh: 0x2f6fd8, skyLow: 0xa8c8f0, light: 0xffe4b8, lightIntensity: 2.6, ambient: 0xb0c4e0, ambientIntensity: 0.75 }],
  [0.5, { skyHigh: 0x2356d8, skyLow: 0x9cc0f2, light: 0xfff2dc, lightIntensity: 3.0, ambient: 0xb8cce8, ambientIntensity: 0.85 }],
  [0.88, { skyHigh: 0x3460b8, skyLow: 0xe0b896, light: 0xffd0a0, lightIntensity: 2.2, ambient: 0xa8b0c8, ambientIntensity: 0.65 }],
  [1.0, { skyHigh: 0x2a3a78, skyLow: 0xff8a50, light: 0xff7a40, lightIntensity: 1.0, ambient: 0x8a7890, ambientIntensity: 0.45 }],
  [1.04, { skyHigh: 0x18204c, skyLow: 0x7a4a5a, light: 0xff6040, lightIntensity: 0.05, ambient: 0x5a5878, ambientIntensity: 0.3 }],
  [1.15, { skyHigh: 0x04070f, skyLow: 0x0e1628, light: 0x8fa8d8, lightIntensity: 0.45, ambient: 0x3a4a70, ambientIntensity: 0.18 }],
  [1.85, { skyHigh: 0x04070f, skyLow: 0x0e1628, light: 0x8fa8d8, lightIntensity: 0.45, ambient: 0x3a4a70, ambientIntensity: 0.18 }],
  [1.96, { skyHigh: 0x0e1838, skyLow: 0x3a3550, light: 0x8fa8d8, lightIntensity: 0.05, ambient: 0x4a5878, ambientIntensity: 0.25 }]
]

const scratch = { a: new THREE.Color(), b: new THREE.Color() }

/** `out` set to the colour between hex a and b, `t` of the way. */
function mixHex(out: THREE.Color, a: number, b: number, t: number): THREE.Color {
  return out.copy(scratch.a.setHex(a)).lerp(scratch.b.setHex(b), t)
}

/** The two looks either side of `sun`, and how far between them it is. */
function looksAt(sun: number): [Look, Look, number] {
  for (let i = 0; i < LOOKS.length; i++) {
    const [from, a] = LOOKS[i]
    const [to, b] = LOOKS[(i + 1) % LOOKS.length]
    const end = i + 1 < LOOKS.length ? to : to + 2
    if (sun >= from && sun < end) return [a, b, (sun - from) / (end - from)]
  }
  return [LOOKS[0][1], LOOKS[0][1], 0]
}

/** Where the light comes from: the sun's arc by day, a fixed moon by night. */
function lightDirection(sun: number, out: THREE.Vector3): THREE.Vector3 {
  const day = sun < 1.04 || sun >= 1.96
  if (!day) return out.setFromSphericalCoords(1, THREE.MathUtils.degToRad(50), THREE.MathUtils.degToRad(200))
  // Predawn's 1.96..2 is just before 0: the sun just below the horizon (kept a touch above, so it still lights).
  const s = sun >= 1.96 ? sun - 2 : sun
  const elevation = Math.max(2, Math.sin(Math.PI * clamp01(s)) * 58)
  const azimuth = 90 + 180 * s
  return out.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elevation), THREE.MathUtils.degToRad(azimuth))
}

// -- Wind ----------------------------------------------------------------------

/**
 * Sways an instanced material's vertices in the wind, more the higher up they are
 * (`heightFrom` is position.y for grass and flowers, uv.y for leaves). The demo's
 * shaders ignored the instance matrix; this moves each instance into place first.
 */
function addWind(material: THREE.Material, uniforms: { uTime: { value: number } }, opts: { heightFrom: string; strength: number; frequency: number; scale: number }): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', `uniform float uTime;\n${WIND_NOISE}\nvoid main() {`)
      .replace(
        '#include <project_vertex>',
        /*glsl*/ `
        vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        vec2 worldXZ = (modelMatrix * mvPosition).xz;
        float windOffset = 6.28 * simplex2d(worldXZ / ${opts.scale.toFixed(1)});
        float t = uTime * ${opts.frequency.toFixed(2)};
        vec3 sway = ${opts.heightFrom} * vec3(${opts.strength.toFixed(2)}, 0.0, ${opts.strength.toFixed(2)}) *
          (0.6 * sin(t + windOffset) * cos(1.4 * t + windOffset) + 0.25 * sin(2.3 * t + 1.3 * windOffset));
        mvPosition.xyz += sway;
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;
        `
      )
  }
  // Each variant compiles its own program (the strengths are baked in).
  material.customProgramCacheKey = () => `wind:${opts.heightFrom}:${opts.strength}:${opts.frequency}:${opts.scale}`
}

// -- Scattering ----------------------------------------------------------------

/** A deterministic random source, so the forest is the same each time. */
function random(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 0..1, above PATCHINESS where the ground is bare dirt (the ground shader's own test). */
const patchNoise = (x: number, z: number): number => 0.5 + 0.5 * simplex2d(x / PATCH_SCALE, z / PATCH_SCALE)

/** How far (x, z) is from the middle of the trail. */
const fromTrail = (x: number, z: number): number => Math.abs(Math.hypot(x, z) - WALK_R)

/** `count` random spots out to `maxR`, at least `clear` off the trail and `gap` apart from each other. */
function scatter(rand: () => number, count: number, maxR: number, clear: number, taken: THREE.Vector2[], gap: number): THREE.Vector2[] {
  const spots: THREE.Vector2[] = []
  for (let tries = 0; spots.length < count && tries < count * 40; tries++) {
    // sqrt keeps the density even across the disc rather than bunched in the middle.
    const r = Math.sqrt(rand()) * maxR
    const theta = rand() * Math.PI * 2
    const p = new THREE.Vector2(r * Math.cos(theta), r * Math.sin(theta))
    if (fromTrail(p.x, p.y) < clear) continue
    if (taken.some((q) => q.distanceToSquared(p) < gap * gap)) continue
    taken.push(p)
    spots.push(p)
  }
  return spots
}

// -- Building ------------------------------------------------------------------

const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()))

async function buildTrees(scene: THREE.Scene, wind: { uTime: { value: number } }, cancelled: () => boolean): Promise<void> {
  const rand = random(20261023)
  const taken: THREE.Vector2[] = []
  const dummy = new THREE.Object3D()
  for (const kind of KINDS) {
    // One tree a frame, so generating them doesn't stall the page for long.
    await nextFrame()
    if (cancelled()) return
    const tree = new Tree()
    tree.loadPreset(kind.preset)
    tree.options.seed = kind.seed
    tree.generate()

    const sapling = kind.preset.endsWith('Small')
    const spots = scatter(rand, kind.count, TREE_MAX_R, sapling ? SAPLING_CLEAR : TRAIL_CLEAR, taken, sapling ? 6 : 10)
    const leaves = tree.leavesMesh.material as THREE.MeshPhongMaterial
    addWind(leaves, wind, { heightFrom: 'uv.y', strength: 0.5, frequency: 0.6, scale: 70 })
    const placements = spots.map((p) => {
      dummy.position.set(p.x, 0, p.y)
      dummy.rotation.set(0, rand() * Math.PI * 2, 0)
      dummy.scale.setScalar(0.8 + rand() * 0.45)
      dummy.updateMatrix()
      return dummy.matrix.clone()
    })
    for (const source of [tree.branchesMesh, tree.leavesMesh]) {
      const mesh = new THREE.InstancedMesh(source.geometry, source.material, spots.length)
      placements.forEach((m, i) => mesh.setMatrixAt(i, m))
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.computeBoundingSphere()
      scene.add(mesh)
    }
  }
}

async function buildGrass(scene: THREE.Scene, wind: { uTime: { value: number } }, glow: THREE.MeshPhongMaterial[]): Promise<void> {
  const loader = new GLTFLoader()
  const [grass, ...flowers] = await Promise.all(
    ['grass.glb', 'flower_white.glb', 'flower_blue.glb', 'flower_yellow.glb'].map((f) => loader.loadAsync(ASSETS + f).then((g) => g.scene.children[0]))
  )
  const rand = random(7)
  const dummy = new THREE.Object3D()

  const blade = grass as THREE.Mesh
  const material = new THREE.MeshPhongMaterial({
    map: (blade.material as THREE.MeshStandardMaterial).map,
    emissive: new THREE.Color(0x308040),
    emissiveIntensity: 0.05,
    alphaTest: 0.5,
    side: THREE.DoubleSide
  })
  material.color.multiplyScalar(0.6)
  glow.push(material)
  addWind(material, wind, { heightFrom: 'position.y', strength: 0.3, frequency: 1.0, scale: 400 })
  const mesh = new THREE.InstancedMesh(blade.geometry, material, GRASS_COUNT)
  const color = new THREE.Color()
  let n = 0
  for (let tries = 0; tries < GRASS_COUNT && n < GRASS_COUNT; tries++) {
    const r = Math.sqrt(rand()) * GRASS_MAX_R
    const theta = rand() * Math.PI * 2
    const cx = r * Math.cos(theta)
    const cz = r * Math.sin(theta)
    // Bare dirt where the ground shader paints it, but for the odd lone tuft.
    if (patchNoise(cx, cz) > PATCHINESS && rand() > DIRT_TUFTS) continue
    // The trail is trodden bare in the middle, with grass coming back towards its edges.
    const trail = fromTrail(cx, cz)
    if (trail < TRAIL_HALF || (trail < TRAIL_EDGE && rand() > (trail - TRAIL_HALF) / (TRAIL_EDGE - TRAIL_HALF))) continue
    const blades = TUFT_BLADES.min + Math.floor(rand() * (TUFT_BLADES.max - TUFT_BLADES.min + 1))
    // A tuft shares a shade, each blade a little off it.
    const g = 0.3 + rand() * 0.3
    for (let b = 0; b < blades && n < GRASS_COUNT; b++) {
      const a = rand() * Math.PI * 2
      const d = Math.sqrt(rand()) * TUFT_RADIUS
      dummy.position.set(cx + d * Math.cos(a), 0, cz + d * Math.sin(a))
      dummy.rotation.set(0, rand() * Math.PI * 2, 0)
      dummy.scale.set(4 + rand(), 3 + 2.5 * rand(), 4 + rand())
      dummy.updateMatrix()
      mesh.setMatrixAt(n, dummy.matrix)
      mesh.setColorAt(n, color.setRGB(0.25 + rand() * 0.1, g + rand() * 0.06, 0.1))
      n++
    }
  }
  mesh.count = n
  mesh.receiveShadow = true
  mesh.computeBoundingSphere()
  scene.add(mesh)

  // Flowers: each is a few meshes (petals, stem); every part becomes one instanced mesh.
  for (const flower of flowers) {
    const spots: THREE.Matrix4[] = []
    for (let c = 0, tries = 0; c < FLOWER_CLUSTERS_PER_COLOR && tries < FLOWER_CLUSTERS_PER_COLOR * 20; tries++) {
      // Nearer the trail is likelier, so most are close enough to see.
      // Not right at the trail's edge, where one would fill the lens.
      const off = TRAIL_EDGE + 2 + Math.pow(rand(), 1.8) * STREWN
      const r = WALK_R + (rand() < 0.5 ? -off : off)
      const theta = rand() * Math.PI * 2
      const cx = r * Math.cos(theta)
      const cz = r * Math.sin(theta)
      if (patchNoise(cx, cz) > PATCHINESS) continue
      c++
      const count = FLOWERS_PER_CLUSTER.min + Math.floor(rand() * (FLOWERS_PER_CLUSTER.max - FLOWERS_PER_CLUSTER.min + 1))
      for (let f = 0; f < count; f++) {
        const a = rand() * Math.PI * 2
        const d = rand() * 1.8
        dummy.position.set(cx + d * Math.cos(a), 0, cz + d * Math.sin(a))
        dummy.rotation.set(0, rand() * Math.PI * 2, 0)
        dummy.scale.setScalar(0.024 + 0.016 * rand())
        dummy.updateMatrix()
        spots.push(dummy.matrix.clone())
      }
    }
    // The model's own transform is replaced by each instance's (as the demo's clones did), not added to.
    flower.position.set(0, 0, 0)
    flower.rotation.set(0, 0, 0)
    flower.scale.set(1, 1, 1)
    flower.updateMatrixWorld(true)
    flower.traverse((part) => {
      if (!(part as THREE.Mesh).isMesh) return
      const m = part as THREE.Mesh
      const src = m.material as THREE.MeshStandardMaterial
      const mat = new THREE.MeshPhongMaterial({ map: src.map, color: src.color })
      addWind(mat, wind, { heightFrom: '0.2 * position.y', strength: 0.3, frequency: 1.0, scale: 400 })
      // Bake the part's place within the flower into its geometry, so instances need only the flower's matrix.
      const geometry = m.geometry.clone().applyMatrix4(m.matrixWorld)
      const inst = new THREE.InstancedMesh(geometry, mat, spots.length)
      spots.forEach((s, i) => inst.setMatrixAt(i, s))
      inst.computeBoundingSphere()
      scene.add(inst)
    })
  }
}

/** A lumpy, squashed rock: an icosphere pushed in and out by noise. */
function pebbleShape(seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 2)
  const pos = g.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const bump = 0.22 * simplex2d(v.x * 1.3 + seed * 7.1, v.y * 1.3 + v.z * 1.1) + 0.1 * simplex2d(v.z * 3.1 + seed, v.x * 3.1 - v.y)
    v.multiplyScalar(1 + bump)
    pos.setXYZ(i, v.x, v.y * 0.55, v.z * 0.8)
  }
  // Welded first, or every face would shade flat as its own facet.
  const welded = mergeVertices(g.deleteAttribute('normal').deleteAttribute('uv'))
  welded.computeVertexNormals()
  return welded
}

function buildPebbles(scene: THREE.Scene): void {
  const rand = random(99)
  const dummy = new THREE.Object3D()
  const color = new THREE.Color()
  const material = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 })
  const perShape = Math.ceil(PEBBLES / PEBBLE_SHAPES)
  for (let k = 0; k < PEBBLE_SHAPES; k++) {
    const mesh = new THREE.InstancedMesh(pebbleShape(k + 1), material, perShape)
    let n = 0
    for (let tries = 0; n < perShape && tries < perShape * 20; tries++) {
      const off = Math.pow(rand(), 1.5) * STREWN
      const r = WALK_R + (rand() < 0.5 ? -off : off)
      const theta = rand() * Math.PI * 2
      const x = r * Math.cos(theta)
      const z = r * Math.sin(theta)
      // Bare ground keeps nearly all of them; grass hides most.
      const bare = fromTrail(x, z) < TRAIL_EDGE || patchNoise(x, z) > PATCHINESS
      if (!bare && rand() > 0.15) continue
      // Mostly small stones, the odd bigger one.
      const size = 0.15 + Math.pow(rand(), 3) * 0.9
      dummy.position.set(x, size * 0.12, z)
      dummy.rotation.set((rand() - 0.5) * 0.4, rand() * Math.PI * 2, (rand() - 0.5) * 0.4)
      dummy.scale.set(size * (0.8 + rand() * 0.5), size * (0.7 + rand() * 0.5), size * (0.8 + rand() * 0.5))
      dummy.updateMatrix()
      mesh.setMatrixAt(n, dummy.matrix)
      // Greys, some warmer, some mossier (linear values: sRGB about 0.3 to 0.5).
      const tone = 0.07 + rand() * 0.12
      const tint = rand()
      mesh.setColorAt(n, tint < 0.6 ? color.setRGB(tone, tone * 0.97, tone * 0.92) : tint < 0.85 ? color.setRGB(tone * 1.05, tone * 0.9, tone * 0.75) : color.setRGB(tone * 0.85, tone, tone * 0.7))
      n++
    }
    mesh.count = n
    mesh.receiveShadow = true
    mesh.computeBoundingSphere()
    scene.add(mesh)
  }
}

async function buildGround(scene: THREE.Scene, glow: THREE.MeshPhongMaterial[]): Promise<void> {
  const textures = new THREE.TextureLoader()
  const [grass, dirt, normal] = await Promise.all(['grass.jpg', 'dirt_color.jpg', 'dirt_normal.jpg'].map((f) => textures.loadAsync(ASSETS + f)))
  for (const t of [grass, dirt, normal]) t.wrapS = t.wrapT = THREE.RepeatWrapping
  grass.colorSpace = dirt.colorSpace = THREE.SRGBColorSpace

  const material = new THREE.MeshPhongMaterial({ emissive: 0xffffff, emissiveIntensity: 0.01, normalMap: normal, shininess: 0.1 })
  glow.push(material)
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGrass = { value: grass }
    shader.uniforms.uDirt = { value: dirt }
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vWorld;\nvoid main() {')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `varying vec3 vWorld;\nuniform sampler2D uGrass;\nuniform sampler2D uDirt;\n${WIND_NOISE}\nvoid main() {`)
      .replace('#include <map_fragment>', GROUND_FRAGMENT(PATCH_SCALE, PATCHINESS, WALK_R, TRAIL_HALF + 1))
      .replace(
        '#include <normal_fragment_maps>',
        'vec3 mapN = texture2D(normalMap, vWorld.xz / 30.0).xyz * 2.0 - 1.0;\nmapN.xy *= normalScale;\nnormal = normalize(tbn * mapN);'
      )
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), material)
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)
}

// -- Running -------------------------------------------------------------------

/** Starts the forest on `canvas`; onReady once its first frame is drawn. Returns a stop function. */
export function startForest(canvas: HTMLCanvasElement, onReady: () => void, onError: (err: unknown) => void): () => void {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(1)
  renderer.setSize(WIDTH, HEIGHT, false)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = 1.6

  const scene = new THREE.Scene()
  const fog = new THREE.FogExp2(0x9cc0f2, 0.0026)
  scene.fog = fog

  const camera = new THREE.PerspectiveCamera(52, WIDTH / HEIGHT, 0.5, 2000)

  const skyUniforms = {
    uHigh: { value: new THREE.Color() },
    uLow: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3() },
    uSunColor: { value: new THREE.Color() },
    uDay: { value: 1 },
    uStars: { value: 0 }
  }
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1500, 32, 16),
    new THREE.ShaderMaterial({ vertexShader: SKY_VERTEX, fragmentShader: SKY_FRAGMENT, uniforms: skyUniforms, side: THREE.BackSide, depthWrite: false, fog: false })
  )
  sky.renderOrder = -1
  scene.add(sky)

  const light = new THREE.DirectionalLight(0xffffff, 3)
  light.castShadow = true
  light.shadow.mapSize.set(2048, 2048)
  Object.assign(light.shadow.camera, { left: -160, right: 160, top: 160, bottom: -160, near: 1, far: 800 })
  light.shadow.bias = -0.0008
  light.shadow.normalBias = 0.3
  scene.add(light, light.target)
  const ambient = new THREE.HemisphereLight(0xffffff, 0xffffff, 0.6)
  scene.add(ambient)

  const wind = { uTime: { value: 0 } }
  // The demo's grass and ground glow a little so they're never black; by night that glow would be all you'd see.
  const glow: THREE.MeshPhongMaterial[] = []
  let stopped = false
  buildPebbles(scene)
  Promise.all([buildGround(scene, glow), buildGrass(scene, wind, glow), buildTrees(scene, wind, () => stopped)])
    .then(() => {
      if (stopped) return
      // Compile everything before the first frame shows, so it doesn't stutter in.
      return renderer.compileAsync(scene, camera).then(() => {
        if (!stopped) ready = true
      })
    })
    .catch(onError)

  let sun: SunTimes = DEFAULT_SUN_TIMES
  const loadSun = (): void => {
    window.steamtv.getSunTimes().then((times) => {
      if (times) sun = times
    })
  }
  loadSun()
  window.addEventListener(WEATHER_CHANGED_EVENT, loadSun)
  let held: BackdropTime = 'auto'
  const loadHeld = (): void => {
    window.steamtv.getBackdrop().then(({ time }) => (held = time))
  }
  loadHeld()
  window.addEventListener(BACKDROP_CHANGED_EVENT, loadHeld)
  const pinned = pinnedMinutes()

  const dir = new THREE.Vector3()
  const ahead = new THREE.Vector3()
  const applyTime = (): void => {
    const state = sceneAt(pinned ?? heldMinutes(held, sun) ?? minutesOfDay(new Date()), sun)
    const [a, b, t] = looksAt(state.sun)
    mixHex(skyUniforms.uHigh.value, a.skyHigh, b.skyHigh, t)
    mixHex(skyUniforms.uLow.value, a.skyLow, b.skyLow, t)
    mixHex(light.color, a.light, b.light, t)
    light.intensity = THREE.MathUtils.lerp(a.lightIntensity, b.lightIntensity, t)
    mixHex(ambient.color, a.ambient, b.ambient, t)
    ambient.intensity = THREE.MathUtils.lerp(a.ambientIntensity, b.ambientIntensity, t)
    ambient.groundColor.copy(ambient.color).multiplyScalar(0.3)
    const daylight = clamp01(light.intensity / LOOKS[2][1].lightIntensity)
    for (const m of glow) {
      m.userData.glow ??= m.emissiveIntensity
      m.emissiveIntensity = m.userData.glow * daylight
    }
    // The far trees fade into the sky at the horizon.
    fog.color.copy(skyUniforms.uLow.value)
    lightDirection(state.sun, dir)
    skyUniforms.uSunDir.value.copy(dir)
    skyUniforms.uSunColor.value.copy(light.color)
    skyUniforms.uDay.value = state.sun < 1.04 || state.sun >= 1.96 ? 1 : 0
    skyUniforms.uStars.value = state.stars
    // The shadow box follows the camera; the light shines from `dir` onto it.
    light.target.position.set(camera.position.x, 0, camera.position.z)
    light.position.copy(light.target.position).addScaledVector(dir, 400)
  }

  let ready = false
  let shown = false
  let time = 0
  let last: number | null = null
  let raf = 0
  const pace = pacer()
  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame)
    if (document.hidden || !ready) {
      last = null
      return
    }
    if (!pace(now)) return
    time += last === null ? 0 : Math.min((now - last) / 1000, 0.1)
    last = now

    // Walk the ring, looking ahead and out between the trees.
    const angle = time * WALK_SPEED
    camera.position.set(WALK_R * Math.cos(angle), EYE_HEIGHT + Math.sin(time * 0.15) * 0.4, WALK_R * Math.sin(angle))
    // Along the trail (a touch outward, as it curves away), tipped up a little towards the canopy.
    const outward = 0.12
    ahead.set(-Math.sin(angle) + outward * Math.cos(angle), 0, Math.cos(angle) + outward * Math.sin(angle)).normalize()
    camera.lookAt(camera.position.x + ahead.x * 100, EYE_HEIGHT + 14, camera.position.z + ahead.z * 100)
    sky.position.copy(camera.position)

    wind.uTime.value = time
    applyTime()
    renderer.render(scene, camera)
    if (!shown) {
      shown = true
      onReady()
    }
  }
  raf = requestAnimationFrame(frame)

  return () => {
    stopped = true
    cancelAnimationFrame(raf)
    window.removeEventListener(WEATHER_CHANGED_EVENT, loadSun)
    window.removeEventListener(BACKDROP_CHANGED_EVENT, loadHeld)
    scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      m.geometry.dispose()
      for (const mat of [m.material].flat()) mat.dispose()
    })
    renderer.dispose()
    renderer.forceContextLoss()
  }
}
