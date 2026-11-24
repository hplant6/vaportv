import * as THREE from 'three'
import { compileScene } from '../compileScene'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { pacer } from '../pace'
import type { Product } from '../products'
import { addRig, borrowConsole, environment } from './scene'
import { reportContextLost } from '../gpuRecovery'

// A console turning slowly on the spot, as in the early PlayStation's menus: the left bar's
// (SideBar.tsx). The same model, fixes and neon rig as the tab backdrop's product shot
// (scene.ts), without its mirror floor or glow, on a clear background so the bar's backdrop
// shows round it. It's small, so drawn plainly: at most the screen's own pixels, 30 frames a
// second, and not at all while vaporTV's in the background (a game's running).
//
// Every turning view (the left bar's, the More screen's tile under the cursor) draws with one
// renderer, kept for the session, and copies its picture onto its own canvas: one WebGL context,
// and each kind of material's shaders compiled once rather than for every view, which was most
// of the wait before a console appeared.

type Shared = { renderer: THREE.WebGLRenderer; environment: THREE.Texture; width: number; height: number }
let shared: Shared | null = null

function sharedRenderer(): Shared {
  if (shared && !shared.renderer.getContext().isContextLost()) return shared
  const canvas = document.createElement('canvas')
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' })
  renderer.setPixelRatio(1)
  renderer.setClearColor(0x000000, 0)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.setScissorTest(true)
  RectAreaLightUniformsLib.init()
  // Not on the page, so gpuRecovery's listener can't hear it: tell it, and the views start again.
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault()
    shared = null
    reportContextLost('turning consoles')
  })
  shared = { renderer, environment: environment(renderer), width: 0, height: 0 }
  return shared
}

/** Draws `scene` `width` by `height` pixels in the shared renderer's corner, and copies it onto `target`. */
function draw(s: Shared, scene: THREE.Scene, camera: THREE.Camera, exposure: number, target: CanvasRenderingContext2D): void {
  const { width, height } = target.canvas
  if (width > s.width || height > s.height) {
    s.width = Math.max(s.width, width)
    s.height = Math.max(s.height, height)
    s.renderer.setSize(s.width, s.height, false)
  }
  const r = s.renderer
  r.toneMappingExposure = exposure
  // GL counts up from the bottom: the corner's at the canvas's bottom left.
  r.setViewport(0, 0, width, height)
  r.setScissor(0, 0, width, height)
  r.render(scene, camera)
  target.clearRect(0, 0, width, height)
  target.drawImage(r.domElement, 0, s.height - height, width, height, 0, 0, width, height)
}

/** One turn every this many seconds (the left bar's; the More screen's tiles pass their own). */
const TURN_SECONDS = 24
/** How far above the console the camera looks down (a product's spin.elevation instead, if it has one). */
const ELEVATION = 18
const FOV = 26
/** Room left round the console as it turns (1: touching the edges at its widest); a product's spin.margin instead. */
const MARGIN = 1.1
const FPS = 30

/**
 * Whether all of a console that turns within `radius` of its middle, `height` tall, shows inside
 * the frame with `margin` to spare: the rims of the cylinder it sweeps, top and bottom.
 */
function fits(camera: THREE.PerspectiveCamera, radius: number, height: number, margin: number): boolean {
  const point = new THREE.Vector3()
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2
    for (const y of [0, height]) {
      point.set(Math.cos(a) * radius, y, Math.sin(a) * radius).project(camera)
      if (Math.abs(point.x) * margin > 1 || Math.abs(point.y) * margin > 1) return false
    }
  }
  return true
}

/** Starts `product` turning on `canvas` (sized by CSS); onReady once its first frame is drawn. Returns a stop function. */
export function startSpin(canvas: HTMLCanvasElement, product: Product, onReady: () => void, onError: (err: unknown) => void, turnSeconds = TURN_SECONDS): () => void {
  const elevation = THREE.MathUtils.degToRad(product.spin?.elevation ?? ELEVATION)
  const margin = product.spin?.margin ?? MARGIN
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  // The stage is scaled to the screen: draw at the screen's pixels, but never more than one per stage pixel.
  const scale = canvas.getBoundingClientRect().width / width || 1
  const pixels = Math.min(1, scale * window.devicePixelRatio)
  canvas.width = Math.round(width * pixels)
  canvas.height = Math.round(height * pixels)
  const target = canvas.getContext('2d')
  if (!target) throw new Error('no 2D canvas')
  const s = sharedRenderer()
  const renderer = s.renderer
  const exposure = product.exposure ?? 1

  const scene = new THREE.Scene()
  scene.environment = s.environment
  scene.environmentIntensity = 0.6
  const camera = new THREE.PerspectiveCamera(FOV, width / height, 0.01, 50)
  // The console turns inside this; the lights stay put, so its magenta side's always on the left.
  const turntable = new THREE.Group()
  scene.add(turntable)

  let ready = false
  let stopped = false
  let release: (() => void) | null = null
  // What it stands in: tilted back for a handheld, so its screen faces the camera as it turns.
  const stand = new THREE.Group()
  turntable.add(stand)
  borrowConsole(stand, product)
    .then((borrowed) => {
      release = borrowed.release
      if (stopped) return release()
      let size = borrowed.size
      if (product.spinTilt) {
        stand.rotation.x = THREE.MathUtils.degToRad(product.spinTilt)
        // Back on the floor and in the middle, tilted: the box it fills now.
        const box = new THREE.Box3().setFromObject(stand)
        const centre = box.getCenter(new THREE.Vector3())
        stand.position.set(-centre.x, -box.min.y, -centre.z)
        size = box.getSize(new THREE.Vector3())
      }
      const target = new THREE.Vector3(0, size.y / 2, 0)
      // Far enough off that it fits however it's turned. Across, the widest it gets is its footprint's diagonal;
      // up and down, its height (seen a little from above) plus that diagonal foreshortened by looking down at it.
      const across = Math.hypot(size.x, size.z) / 2
      const tall = (size.y / 2) * Math.cos(elevation) + across * Math.sin(elevation)
      const halfV = THREE.MathUtils.degToRad(FOV / 2)
      const halfH = Math.atan(Math.tan(halfV) * camera.aspect)
      const distance = margin * Math.max(across / Math.tan(halfH), tall / Math.tan(halfV))
      const place = (d: number): void => {
        camera.position.copy(target).add(new THREE.Vector3().setFromSphericalCoords(d, Math.PI / 2 - elevation, 0))
        camera.lookAt(target)
        camera.updateMatrixWorld()
      }
      // That's as seen from far off. Up close, the edge nearest the camera looms larger and lower
      // (it was cut off at the bottom), so back off until every point it can turn through fits.
      let fit = distance
      place(fit)
      for (let tries = 0; tries < 40 && !fits(camera, across, size.y, margin); tries++) place((fit *= 1.04))
      addRig(scene, Math.max(size.x, size.z) / 0.29, target, product.white ?? 1)
      return compileScene(renderer, scene, camera, () => stopped).then(() => {
        if (!stopped) ready = true
      })
    })
    .catch(onError)

  // Stopped while vaporTV's behind a game; the first frame's still drawn so there's a console to see.
  let away = false
  const onBlur = (): void => {
    away = true
  }
  const onFocus = (): void => {
    away = false
  }
  window.addEventListener('blur', onBlur)
  window.addEventListener('focus', onFocus)

  let shown = false
  let angle = 0
  let last: number | null = null
  let raf = 0
  const pace = pacer(FPS)
  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame)
    if (!ready || document.hidden || (away && shown)) {
      last = null
      return
    }
    if (!pace(now)) return
    angle += last === null ? 0 : (Math.min((now - last) / 1000, 0.1) / turnSeconds) * Math.PI * 2
    last = now
    turntable.rotation.y = angle
    if (renderer.getContext().isContextLost()) return
    draw(s, scene, camera, exposure, target)
    if (!shown) {
      shown = true
      onReady()
    }
  }
  raf = requestAnimationFrame(frame)

  return () => {
    stopped = true
    cancelAnimationFrame(raf)
    window.removeEventListener('blur', onBlur)
    window.removeEventListener('focus', onFocus)
    // The console's kept for next time (scene.ts); the shared renderer and its environment stay.
    release?.()
  }
}
