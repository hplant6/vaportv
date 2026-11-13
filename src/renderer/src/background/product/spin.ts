import * as THREE from 'three'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { pacer } from '../pace'
import type { Product } from '../products'
import { addRig, buildConsole, environment } from './scene'

// A console turning slowly on the spot, as in the early PlayStation's menus: the left bar's
// (SideBar.tsx). The same model, fixes and neon rig as the tab backdrop's product shot
// (scene.ts), without its mirror floor or glow, on a clear background so the bar's backdrop
// shows round it. It's small, so drawn plainly: at most the screen's own pixels, 30 frames a
// second, and not at all while vaporTV's in the background (a game's running).

/** One turn every this many seconds. */
const TURN_SECONDS = 24
/** How far above the console the camera looks down. */
const ELEVATION = THREE.MathUtils.degToRad(18)
const FOV = 26
/** Room left round the console as it turns (1: touching the edges at its widest). */
const MARGIN = 1.08
const FPS = 30

/** Starts `product` turning on `canvas` (sized by CSS); onReady once its first frame is drawn. Returns a stop function. */
export function startSpin(canvas: HTMLCanvasElement, product: Product, onReady: () => void, onError: (err: unknown) => void): () => void {
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  // The stage is scaled to the screen: draw at the screen's pixels, but never more than one per stage pixel.
  const scale = canvas.getBoundingClientRect().width / width || 1
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' })
  renderer.setPixelRatio(Math.min(1, scale * window.devicePixelRatio))
  renderer.setSize(width, height, false)
  renderer.setClearColor(0x000000, 0)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = product.exposure ?? 1
  RectAreaLightUniformsLib.init()

  const scene = new THREE.Scene()
  scene.environment = environment(renderer)
  scene.environmentIntensity = 0.6
  const camera = new THREE.PerspectiveCamera(FOV, width / height, 0.01, 50)
  // The console turns inside this; the lights stay put, so its magenta side's always on the left.
  const turntable = new THREE.Group()
  scene.add(turntable)

  let ready = false
  let stopped = false
  // What it stands in: tilted back for a handheld, so its screen faces the camera as it turns.
  const stand = new THREE.Group()
  turntable.add(stand)
  buildConsole(stand, product)
    .then((flat) => {
      if (stopped) return
      let size = flat
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
      const tall = (size.y / 2) * Math.cos(ELEVATION) + across * Math.sin(ELEVATION)
      const halfV = THREE.MathUtils.degToRad(FOV / 2)
      const halfH = Math.atan(Math.tan(halfV) * camera.aspect)
      const distance = MARGIN * Math.max(across / Math.tan(halfH), tall / Math.tan(halfV))
      camera.position.copy(target).add(new THREE.Vector3().setFromSphericalCoords(distance, Math.PI / 2 - ELEVATION, 0))
      camera.lookAt(target)
      addRig(scene, Math.max(size.x, size.z) / 0.29, target, product.white ?? 1)
      return renderer.compileAsync(scene, camera).then(() => {
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
    angle += last === null ? 0 : (Math.min((now - last) / 1000, 0.1) / TURN_SECONDS) * Math.PI * 2
    last = now
    turntable.rotation.y = angle
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
    window.removeEventListener('blur', onBlur)
    window.removeEventListener('focus', onFocus)
    scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      m.geometry.dispose()
      for (const mat of [m.material].flat()) {
        for (const value of Object.values(mat)) if (value instanceof THREE.Texture) value.dispose()
        mat.dispose()
      }
    })
    scene.environment?.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
  }
}
