import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { Reflector } from 'three/examples/jsm/objects/Reflector.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { stageHeight } from '../../stage'
import { pacer } from '../pace'
import type { ConsoleBackdropQuality } from '../../../../shared/types'
import type { Product } from '../products'

// A console's backdrop: the console in black on a black mirror floor, lit at its edges by a
// magenta tube on one side and a cyan one on the other, the camera slowly swinging round it
// like a product shot. The lights are the ones the PS3 was lit with in Blender (ps3.blend's
// "Neon Rig"), moved to three's axes: x right, y up, z towards the camera's start. The rig
// and the camera were set for the PS3 Slim; other consoles get the same, scaled to their footprint.

const WIDTH = 1920
const HEIGHT = stageHeight()

const MAGENTA = new THREE.Color(1, 0.06, 0.5)
const CYAN = new THREE.Color(0.05, 0.7, 1)
const VIOLET = new THREE.Color(0.45, 0.2, 1)
const WHITE = new THREE.Color(1, 1, 1)

/** The PS3 Slim's size across the floor (metres: 0.29 square), which everything below was set for. */
const REFERENCE_WIDTH = 0.29
/** The camera's swing: this far either side of straight on, there and back in SWING_SECONDS. */
const SWING = THREE.MathUtils.degToRad(35)
const SWING_SECONDS = 40
/** How far off it is, and how much nearer it comes as it passes the front: about 70% of the screen wide. */
const DISTANCE = 0.55
const PUSH_IN = 0.05
/** How far above the console it looks down: this much at the front, more at the ends of the swing. */
const ELEVATION = THREE.MathUtils.degToRad(30)
const RISE = THREE.MathUtils.degToRad(8)
/** Where the camera aims, this far above the console's middle (below, if negative): keeps its front edge in frame when it's this close. */
const AIM_ABOVE = -0.035
/** Lens shift: moves the console this much of the screen's height down, keeping its perspective, so it sits mid-screen rather than high. */
const SHIFT_DOWN = 0.1

/**
 * Settings → Backdrop → Console backdrops. `pixels`: drawn at this many pixels per stage pixel ('native' = the
 * screen's own, so sharp on a 4K TV, where the stage is scaled up 2x); `reflection`: the floor's reflection drawn
 * at this fraction of the stage's size (soft on purpose); `fps`: at most this many frames a second; `bloom`: the glow
 * round the brightest light (rim glints, highlights, their reflections), which Low leaves off.
 */
const QUALITY: Record<ConsoleBackdropQuality, { pixels: number | 'native'; reflection: number; fps: number; bloom: boolean }> = {
  high: { pixels: 'native', reflection: 1 / 4, fps: Infinity, bloom: true },
  medium: { pixels: 1, reflection: 1 / 4, fps: Infinity, bloom: true },
  low: { pixels: 0.75, reflection: 1 / 8, fps: 30, bloom: false }
}

/** Bloom: how strong, how wide (0-1), and how bright light has to be before tone mapping to glow. */
const BLOOM = { strength: 0.6, radius: 0.5, threshold: 0.8 }

/** The mirror floor: its reflection this dark, and fading to black from FLOOR_FADE[0] to [1] metres out. */
const FLOOR_TINT = 0x3a3a3a
const FLOOR_FADE = [0.3, 1.6]

/** Blender's Neon Rig plus a white softbox, for the PS3: [colour, intensity, position, width, height, white (dimmed by Product.white)]. */
const RIG: [THREE.Color, number, [number, number, number], number, number, boolean][] = [
  // A pale strip behind and above.
  [new THREE.Color(1, 0.92, 0.97), 4, [0, 0.53, -0.6], 0.9, 0.06, true],
  // Magenta and cyan tubes low at either side.
  [MAGENTA, 60, [-0.38, 0.05, -0.12], 0.7, 0.03, false],
  [CYAN, 60, [0.38, 0.05, -0.12], 0.7, 0.03, false],
  // A dim violet fill from the front, for the disc slot and logo.
  [VIOLET, 3, [0.15, 0.08, 0.6], 0.4, 0.4, false],
  // A white softbox above the front, so the console's shape and logo read on the TV.
  [WHITE, 10, [0, 0.6, 0.35], 0.6, 0.3, true]
]

/**
 * The rig round a console `scale` times the PS3's size, aimed at `target`, its white lights `white` as bright. Scaled whole, each
 * light keeps its size as seen from the console, so lights it the same; RectAreaLights light
 * nothing but the console (the floor is a mirror).
 */
export function addRig(scene: THREE.Scene, scale: number, target: THREE.Vector3, white: number): void {
  for (const [colour, intensity, [x, y, z], width, height, isWhite] of RIG) {
    const light = new THREE.RectAreaLight(colour, intensity * (isWhite ? white : 1), width * scale, height * scale)
    light.position.set(x, y, z).multiplyScalar(scale)
    light.lookAt(target)
    scene.add(light)
  }
}

/**
 * What the console's gloss reflects: a dark room with a strip of each colour either side
 * and a pale one behind, so its top shades from magenta to cyan as the camera swings.
 */
export function environment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const room = new THREE.Scene()
  room.background = new THREE.Color(0x000000)
  const strip = (colour: THREE.Color, x: number, y: number, z: number, w: number, h: number): void => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: colour, side: THREE.DoubleSide }))
    mesh.position.set(x, y, z)
    mesh.lookAt(0, 0, 0)
    room.add(mesh)
  }
  strip(MAGENTA.clone().multiplyScalar(3), -4, 0.4, -1.5, 3, 0.6)
  strip(CYAN.clone().multiplyScalar(3), 4, 0.4, -1.5, 3, 0.6)
  strip(new THREE.Color(1, 0.92, 0.97).multiplyScalar(1.5), 0, 3, -4, 6, 0.3)
  const pmrem = new THREE.PMREMGenerator(renderer)
  const texture = pmrem.fromScene(room, 0.02).texture
  pmrem.dispose()
  room.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh) {
      m.geometry.dispose()
      ;(m.material as THREE.Material).dispose()
    }
  })
  return texture
}

/**
 * Black mirror floor: a Reflector, with a disc over it darkening the reflection away from the console.
 * Its reflection is drawn small (`size` of the stage), which softens it like the glossy (not polished) floor in Blender, and costs less.
 */
function buildFloor(scene: THREE.Scene, size: number): Reflector {
  const mirror = new Reflector(new THREE.PlaneGeometry(20, 20), {
    color: FLOOR_TINT,
    textureWidth: Math.round(WIDTH * size),
    textureHeight: Math.round(HEIGHT * size),
    clipBias: 0.003
  })
  mirror.rotation.x = -Math.PI / 2
  scene.add(mirror)
  const fade = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.ShaderMaterial({
      uniforms: { uFade: { value: new THREE.Vector2(FLOOR_FADE[0], FLOOR_FADE[1]) } },
      vertexShader: 'varying vec2 vXZ; void main() { vXZ = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec2 uFade; varying vec2 vXZ; void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, smoothstep(uFade.x, uFade.y, length(vXZ))); }',
      transparent: true,
      depthWrite: false
    })
  )
  fade.rotation.x = -Math.PI / 2
  fade.position.y = 0.0005
  scene.add(fade)
  return mirror
}

declare const __MODEL_KEY__: string

/** A model as private-assets.mjs encrypted it (12-byte IV, then AES-256-GCM ciphertext and tag), decrypted. */
async function loadModel(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: ${response.status}`)
  const data = new Uint8Array(await response.arrayBuffer())
  const hex = __MODEL_KEY__.match(/../g) ?? []
  const key = await crypto.subtle.importKey('raw', new Uint8Array(hex.map((b) => parseInt(b, 16))), 'AES-GCM', false, ['decrypt'])
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: data.subarray(0, 12) }, key, data.subarray(12))
}

/** The console, its base centred on the origin. Returns its size. */
export async function buildConsole(scene: THREE.Object3D, product: Product): Promise<THREE.Vector3> {
  const gltf = await new GLTFLoader().parseAsync(await loadModel(product.model), '')
  const model = gltf.scene
  const box = new THREE.Box3().setFromObject(model)
  const centre = box.getCenter(new THREE.Vector3())
  model.position.set(-centre.x, -box.min.y, -centre.z)
  if (product.fix) {
    model.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) for (const material of [m.material].flat()) product.fix!(material as THREE.MeshStandardMaterial)
    })
  }
  scene.add(model)
  return box.getSize(new THREE.Vector3())
}

/** Starts `product`'s backdrop on `canvas` at `quality`; onReady once its first frame is drawn. Returns a stop function. */
export function startProduct(
  canvas: HTMLCanvasElement,
  product: Product,
  quality: ConsoleBackdropQuality,
  onReady: () => void,
  onError: (err: unknown) => void,
  /** When the camera's swing began (performance.now() time): set, it joins the swing there rather than starting it,
   *  so the screensaver's consoles share one continuous camera move. */
  epoch?: number
): () => void {
  const level = QUALITY[quality]
  // The screen's own pixels per stage pixel: 2 on a 4K TV, under 1 on a Deck. Medium and low never draw more than the screen has.
  const native = (window.innerWidth * window.devicePixelRatio) / WIDTH
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(level.pixels === 'native' ? native : Math.min(level.pixels, native))
  renderer.setSize(WIDTH, HEIGHT, false)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = product.exposure ?? 1
  RectAreaLightUniformsLib.init()

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x000000)
  scene.environment = environment(renderer)
  scene.environmentIntensity = 0.6
  const camera = new THREE.PerspectiveCamera(32, WIDTH / HEIGHT, 0.02, 50)
  camera.setViewOffset(WIDTH, HEIGHT, -(product.shiftRight ?? 0) * WIDTH, -(SHIFT_DOWN + (product.shiftDown ?? 0)) * HEIGHT, WIDTH, HEIGHT)
  const mirror = buildFloor(scene, level.reflection)

  // With bloom, the scene's drawn in linear light to a multisampled half-float target, glows added, then tone mapped
  // (OutputPass uses the renderer's ACES and exposure) and drawn to the screen.
  let composer: EffectComposer | null = null
  if (level.bloom && product.bloom !== false) {
    const pixels = renderer.getPixelRatio()
    const buffer = new THREE.WebGLRenderTarget(WIDTH * pixels, HEIGHT * pixels, { type: THREE.HalfFloatType, samples: 4 })
    composer = new EffectComposer(renderer, buffer)
    composer.addPass(new RenderPass(scene, camera))
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(WIDTH, HEIGHT), BLOOM.strength, BLOOM.radius, BLOOM.threshold))
    composer.addPass(new OutputPass())
  }

  // Set once the console's loaded: everything's scaled to its footprint (the longer of width and depth, so the camera
  // stays as far off a deep console's front edge as it does the PS3's).
  const target = new THREE.Vector3()
  const aim = new THREE.Vector3()
  let scale = 1
  let ready = false
  let stopped = false
  buildConsole(scene, product)
    .then((size) => {
      if (stopped) return
      scale = Math.max(size.x, size.z) / REFERENCE_WIDTH
      target.set(0, size.y / 2, 0)
      aim.copy(target).setY(target.y + AIM_ABOVE * scale)
      addRig(scene, scale, target, product.white ?? 1)
      return renderer.compileAsync(scene, camera).then(() => {
        if (!stopped) ready = true
      })
    })
    .catch(onError)

  let shown = false
  let time = 0
  let last: number | null = null
  let raf = 0
  const pace = pacer(level.fps)
  const offset = new THREE.Vector3()
  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame)
    if (document.hidden || !ready) {
      last = null
      return
    }
    if (!pace(now)) return
    if (!shown && epoch !== undefined) time = Math.max(0, (now - epoch) / 1000)
    else time += last === null ? 0 : Math.min((now - last) / 1000, 0.1)
    last = now

    // A sine swing slows into each end on its own; `front` is 1 passing straight on, 0 at the ends.
    const phase = (time / SWING_SECONDS) * Math.PI * 2
    const front = Math.cos(phase) ** 2
    const distance = ((DISTANCE - PUSH_IN * front) * scale) / (product.zoom ?? 1)
    const elevation = (product.elevation === undefined ? ELEVATION : THREE.MathUtils.degToRad(product.elevation)) + RISE * (1 - front)
    offset.setFromSphericalCoords(distance, Math.PI / 2 - elevation, SWING * Math.sin(phase))
    camera.position.copy(target).add(offset)
    camera.lookAt(aim)
    if (composer) composer.render()
    else renderer.render(scene, camera)
    if (!shown) {
      shown = true
      onReady()
    }
  }
  raf = requestAnimationFrame(frame)

  return () => {
    stopped = true
    cancelAnimationFrame(raf)
    mirror.dispose()
    scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh || o === mirror) return
      m.geometry.dispose()
      for (const mat of [m.material].flat()) {
        for (const value of Object.values(mat)) if (value instanceof THREE.Texture) value.dispose()
        mat.dispose()
      }
    })
    scene.environment?.dispose()
    composer?.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
  }
}
