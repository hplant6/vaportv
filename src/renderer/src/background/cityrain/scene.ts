import * as THREE from 'three'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import { stageHeight } from '../../stage'
import { pacer } from '../pace'
import { GROUND_COLOUR, GROUND_LIGHT, GROUND_NORMALS, GROUND_PARS, GROUND_ROUGHNESS, MIST_FRAGMENT, MIST_VERTEX, RAIN_FRAGMENT, RAIN_VERTEX } from './shaders'

// City Rain: down on a wet street at night, slowly circling a puddle that mirrors the
// city's lights, with rain falling and rings spreading across the water. The city is
// the Shanghai Bund night panorama (Poly Haven, CC0), used both as the backdrop above the
// horizon (dimmed and blurred) and as the environment the wet ground reflects.

const WIDTH = 1920
const HEIGHT = stageHeight()
const ASSETS = 'backdrops/rain/'

/** The camera: this high (metres), this far from the puddle's middle, circling it once in ORBIT_SECONDS. */
const EYE_HEIGHT = 1.1
const ORBIT_RADIUS = 3.4
const ORBIT_SECONDS = 600
/** Where it looks: a little past the middle, so the puddle fills the lower half and the city the top. */
const LOOK_AT = new THREE.Vector3(0, 0.25, 0)
/** Asphalt texture tiles every this many metres. */
const TILE = 2.2
/** The backdrop's city: how bright and how blurred, behind the reflection (blurring smears its lights into a glare). */
const CITY_BRIGHTNESS = 0.07
const CITY_BLUR = 0
/** The street's size (metres): big enough that its edge is lost in the fog. */
const STREET = 400

/** The night's fog colour, which the street fades into before the mist ring. */
const FOG = 0x07080d
const MIST_RADIUS = 90
const MIST_HEIGHT = 30

/** Rain: streaks in a box round the camera, falling this fast (m/s). */
const DROPS = 4500
const RAIN_BOX = { radius: 7, height: 4 }
const FALL_SPEED = 7

async function loadTexture(loader: THREE.TextureLoader, file: string, colour: boolean): Promise<THREE.Texture> {
  const t = await loader.loadAsync(ASSETS + 'road/' + file)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.setScalar(1 / TILE)
  t.anisotropy = 8
  if (colour) t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** The street: wet asphalt, with puddles where noise says so (and always one in the middle). */
async function buildGround(scene: THREE.Scene, time: { value: number }): Promise<void> {
  const loader = new THREE.TextureLoader()
  const [map, normalMap, roughnessMap, aoMap] = await Promise.all([
    loadTexture(loader, 'aerial_asphalt_01_diff_2k.jpg', true),
    loadTexture(loader, 'aerial_asphalt_01_nor_gl_2k.jpg', false),
    loadTexture(loader, 'aerial_asphalt_01_rough_2k.jpg', false),
    loadTexture(loader, 'aerial_asphalt_01_ao_2k.jpg', false)
  ])
  const material = new THREE.MeshStandardMaterial({ map, normalMap, roughnessMap, aoMap, normalScale: new THREE.Vector2(0.8, 0.8) })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vWorld;\nvoid main() {')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `${GROUND_PARS}\nvoid main() {\n  float puddle = puddleMask(vWorld.xz);`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${GROUND_COLOUR}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${GROUND_ROUGHNESS}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${GROUND_NORMALS}`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>\n${GROUND_LIGHT}`)
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(STREET, STREET), material)
  ground.rotation.x = -Math.PI / 2
  // The asphalt maps tile in world metres (see TILE); the plane's own UVs span it once.
  const uv = ground.geometry.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * STREET, uv.getY(i) * STREET)
  scene.add(ground)
}

/** Falling rain: thin streaks that stay facing the camera, wrapping round a box that follows it. */
function buildRain(scene: THREE.Scene, time: { value: number }, centre: { value: THREE.Vector3 }): void {
  const base = new THREE.PlaneGeometry(1, 1)
  base.translate(0, 0.5, 0)
  const geometry = new THREE.InstancedBufferGeometry().copy(base as unknown as THREE.InstancedBufferGeometry)
  geometry.instanceCount = DROPS
  const seeds = new Float32Array(DROPS * 4)
  for (let i = 0; i < DROPS; i++) seeds.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4)
  geometry.setAttribute('seed', new THREE.InstancedBufferAttribute(seeds, 4))
  const material = new THREE.ShaderMaterial({
    vertexShader: RAIN_VERTEX,
    fragmentShader: RAIN_FRAGMENT,
    uniforms: {
      uTime: time,
      uCentre: centre,
      uBox: { value: new THREE.Vector2(RAIN_BOX.radius, RAIN_BOX.height) },
      uSpeed: { value: FALL_SPEED }
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    // Turned to the camera in the shader, which way round a quad ends up isn't fixed.
    side: THREE.DoubleSide
  })
  const rain = new THREE.Mesh(geometry, material)
  // Its streaks are placed in the shader, so the mesh's bounds say nothing useful.
  rain.frustumCulled = false
  scene.add(rain)
}

/**
 * Mist where the street meets the city: a ring round the camera, the fog's colour at the
 * bottom fading out upwards, so the dark street doesn't end in a hard line.
 */
function buildMist(scene: THREE.Scene, centre: { value: THREE.Vector3 }): void {
  const material = new THREE.ShaderMaterial({
    vertexShader: MIST_VERTEX,
    fragmentShader: MIST_FRAGMENT,
    uniforms: { uColour: { value: new THREE.Color(FOG) }, uCentre: centre, uHeight: { value: MIST_HEIGHT } },
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    fog: false
  })
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(MIST_RADIUS, MIST_RADIUS, MIST_HEIGHT, 48, 1, true).translate(0, MIST_HEIGHT / 2, 0), material)
  ring.frustumCulled = false
  scene.add(ring)
}

/** Starts City Rain on `canvas`; onReady once its first frame is drawn. Returns a stop function. */
export function startCityRain(canvas: HTMLCanvasElement, onReady: () => void, onError: (err: unknown) => void): () => void {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(1)
  renderer.setSize(WIDTH, HEIGHT, false)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.0

  const scene = new THREE.Scene()
  // The street fades into the dark before it reaches the city.
  scene.fog = new THREE.FogExp2(FOG, 0.12)
  const camera = new THREE.PerspectiveCamera(50, WIDTH / HEIGHT, 0.05, 200)

  const time = { value: 0 }
  const centre = { value: new THREE.Vector3() }
  let ready = false
  let stopped = false
  const pmrem = new THREE.PMREMGenerator(renderer)
  Promise.all([
    new HDRLoader().loadAsync(ASSETS + 'shanghai_bund_2k.hdr').then((hdr) => {
      hdr.mapping = THREE.EquirectangularReflectionMapping
      scene.environment = pmrem.fromEquirectangular(hdr).texture
      scene.background = hdr
      scene.backgroundIntensity = CITY_BRIGHTNESS
      scene.backgroundBlurriness = CITY_BLUR
    }),
    buildGround(scene, time)
  ])
    .then(() => {
      if (stopped) return
      buildRain(scene, time, centre)
      buildMist(scene, centre)
      return renderer.compileAsync(scene, camera).then(() => {
        if (!stopped) ready = true
      })
    })
    .catch(onError)

  let shown = false
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
    time.value += last === null ? 0 : Math.min((now - last) / 1000, 0.1)
    last = now

    const angle = (time.value / ORBIT_SECONDS) * Math.PI * 2
    camera.position.set(ORBIT_RADIUS * Math.cos(angle), EYE_HEIGHT, ORBIT_RADIUS * Math.sin(angle))
    camera.lookAt(LOOK_AT)
    centre.value.copy(camera.position)
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
    scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      m.geometry.dispose()
      for (const mat of [m.material].flat()) mat.dispose()
    })
    pmrem.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
  }
}
