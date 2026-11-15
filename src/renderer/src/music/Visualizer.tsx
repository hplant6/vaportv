import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { FALLBACK, paletteFromPixels } from './palette'
import { musicAnalyser } from './player'

// The Music app's visualizer, coloured from the album cover: a glowing blob that swells with
// the bass and ripples with the mids, a ring of particles that pulses with the treble, and the
// cover itself floating in front, rocking a little on the beat. Without a cover, vaporTV's
// own amber and violet.

function loadPalette(url: string | undefined): Promise<[string, string, string]> {
  if (!url) return Promise.resolve(FALLBACK)
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 48
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return resolve(FALLBACK)
      ctx.drawImage(img, 0, 0, 48, 48)
      try {
        resolve(paletteFromPixels(ctx.getImageData(0, 0, 48, 48).data))
      } catch {
        resolve(FALLBACK)
      }
    }
    img.onerror = () => resolve(FALLBACK)
    img.src = url
  })
}

// Ashima's 3D simplex noise (MIT), for the blob's surface.
const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`

/** Full screen behind the now-playing screen. `cover`: the song's cover address. */
export function Visualizer({ cover }: { cover?: string }) {
  const host = useRef<HTMLDivElement>(null)
  const coverRef = useRef(cover)
  const swap = useRef<((url: string | undefined) => void) | null>(null)

  useEffect(() => {
    coverRef.current = cover
    swap.current?.(cover)
  }, [cover])

  useEffect(() => {
    const el = host.current
    if (!el) return
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    renderer.setPixelRatio(1)
    renderer.setSize(el.clientWidth, el.clientHeight)
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 0.1, 100)
    camera.position.set(0, 0, 9)

    const colours = { a: new THREE.Color(FALLBACK[0]), b: new THREE.Color(FALLBACK[1]), c: new THREE.Color(FALLBACK[2]) }
    const target = { a: colours.a.clone(), b: colours.b.clone(), c: colours.c.clone() }

    // Behind everything: the cover's colours, dark, drifting.
    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        depthWrite: false,
        uniforms: { uTime: { value: 0 }, uA: { value: colours.a }, uB: { value: colours.b }, uBass: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.999, 1.0); }',
        fragmentShader: /* glsl */ `
          varying vec2 vUv; uniform float uTime; uniform vec3 uA; uniform vec3 uB; uniform float uBass;
          ${NOISE}
          void main(){
            float n = snoise(vec3(vUv * 1.6, uTime * 0.05)) * 0.5 + 0.5;
            vec3 col = mix(uB, uA, n) * (0.16 + uBass * 0.08);
            float vignette = smoothstep(1.25, 0.2, length(vUv - 0.5) * 1.6);
            gl_FragColor = vec4(col * vignette, 1.0);
          }`
      })
    )
    backdrop.frustumCulled = false
    scene.add(backdrop)

    // The blob: a sphere pushed out by noise, more with the bass, rippling with the mids.
    const blobMaterial = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: { uTime: { value: 0 }, uBass: { value: 0 }, uMid: { value: 0 }, uA: { value: colours.a }, uB: { value: colours.b }, uC: { value: colours.c } },
      vertexShader: /* glsl */ `
        uniform float uTime; uniform float uBass; uniform float uMid;
        varying vec3 vNormal; varying float vLift; varying vec3 vView;
        ${NOISE}
        void main(){
          float n = snoise(normal * 1.3 + uTime * 0.25);
          float ripple = snoise(normal * 4.0 + uTime * 0.9) * uMid * 0.22;
          float lift = n * (0.18 + uBass * 0.55) + ripple;
          vec3 p = position + normal * lift;
          vLift = lift;
          vNormal = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; uniform float uBass;
        varying vec3 vNormal; varying float vLift; varying vec3 vView;
        void main(){
          float rim = pow(1.0 - max(dot(vNormal, vView), 0.0), 2.2);
          vec3 base = mix(uB, uA, smoothstep(-0.25, 0.45, vLift));
          vec3 col = base * (0.35 + uBass * 0.5) + uC * rim * (0.9 + uBass);
          gl_FragColor = vec4(col, 0.92);
        }`
    })
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(1.7, 48), blobMaterial)
    blob.position.set(1.9, 0.1, 0)
    scene.add(blob)

    // The ring: particles round the blob, flung out by the treble.
    const COUNT = 2400
    const positions = new Float32Array(COUNT * 3)
    const seeds = new Float32Array(COUNT)
    for (let i = 0; i < COUNT; i++) {
      seeds[i] = Math.random()
      positions[i * 3 + 2] = (Math.random() - 0.5) * 0.6
    }
    const ringGeometry = new THREE.BufferGeometry()
    ringGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    ringGeometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    const ringMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uHigh: { value: 0 }, uBass: { value: 0 }, uA: { value: colours.a }, uC: { value: colours.c } },
      vertexShader: /* glsl */ `
        attribute float aSeed; uniform float uTime; uniform float uHigh; uniform float uBass;
        varying float vSeed;
        void main(){
          float angle = aSeed * 6.2831853 + uTime * (0.08 + aSeed * 0.12);
          float radius = 2.6 + sin(aSeed * 40.0 + uTime) * 0.15 + uHigh * (0.4 + aSeed * 1.4) + uBass * 0.25;
          vec3 p = vec3(cos(angle) * radius, sin(angle) * radius * 0.92, position.z);
          vSeed = aSeed;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (2.0 + aSeed * 3.5 + uHigh * 4.0) * (9.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uA; uniform vec3 uC; varying float vSeed;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          gl_FragColor = vec4(mix(uA, uC, vSeed), (1.0 - d * 2.0) * 0.8);
        }`
    })
    const ring = new THREE.Points(ringGeometry, ringMaterial)
    ring.position.copy(blob.position)
    scene.add(ring)

    // The cover, floating in front on the left.
    const coverMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 })
    const coverMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 3.1), coverMaterial)
    coverMesh.position.set(-3.4, 0.55, 1.2)
    scene.add(coverMesh)
    const loader = new THREE.TextureLoader()
    loader.setCrossOrigin('anonymous')
    let alive = true
    const showCover = (url: string | undefined): void => {
      void loadPalette(url).then(([a, b, c]) => {
        if (!alive) return
        target.a.set(a)
        target.b.set(b)
        target.c.set(c)
      })
      if (!url) {
        coverMaterial.map?.dispose()
        coverMaterial.map = null
        coverMaterial.opacity = 0
        coverMaterial.needsUpdate = true
        return
      }
      loader.load(url, (texture) => {
        if (!alive || coverRef.current !== url) return texture.dispose()
        texture.colorSpace = THREE.SRGBColorSpace
        coverMaterial.map?.dispose()
        coverMaterial.map = texture
        coverMaterial.opacity = 1
        coverMaterial.needsUpdate = true
      })
    }
    swap.current = showCover
    showCover(coverRef.current)

    const bins = new Uint8Array(512)
    const level = { bass: 0, mid: 0, high: 0 }
    const band = (from: number, to: number): number => {
      let sum = 0
      for (let i = from; i < to; i++) sum += bins[i]
      return sum / (to - from) / 255
    }
    const clock = new THREE.Clock()
    let frame = 0
    const tick = (): void => {
      frame = requestAnimationFrame(tick)
      const dt = Math.min(clock.getDelta(), 0.1)
      const t = clock.elapsedTime
      const analyser = musicAnalyser()
      if (analyser) analyser.getByteFrequencyData(bins)
      else bins.fill(0)
      // Quick to rise, slower to fall, so it moves with the beat without flicker.
      const follow = (key: keyof typeof level, value: number): void => {
        level[key] += (value - level[key]) * (value > level[key] ? 0.5 : 0.12)
      }
      follow('bass', Math.pow(band(1, 10), 1.6))
      follow('mid', band(10, 80))
      follow('high', Math.pow(band(80, 260), 0.9))
      for (const key of ['a', 'b', 'c'] as const) colours[key].lerp(target[key], Math.min(1, dt * 1.5))

      for (const m of [blobMaterial, ringMaterial, backdrop.material as THREE.ShaderMaterial]) m.uniforms.uTime.value = t
      blobMaterial.uniforms.uBass.value = level.bass
      blobMaterial.uniforms.uMid.value = level.mid
      ringMaterial.uniforms.uHigh.value = level.high
      ringMaterial.uniforms.uBass.value = level.bass
      ;(backdrop.material as THREE.ShaderMaterial).uniforms.uBass.value = level.bass
      blob.rotation.y += dt * (0.12 + level.mid * 0.4)
      blob.rotation.x = Math.sin(t * 0.2) * 0.25
      ring.rotation.z += dt * 0.05
      const s = 1 + level.bass * 0.12
      blob.scale.setScalar(s)
      coverMesh.position.y = 0.55 + Math.sin(t * 0.7) * 0.08
      coverMesh.rotation.y = 0.18 + Math.sin(t * 0.45) * 0.06
      coverMesh.rotation.z = Math.sin(t * 0.6) * 0.015 + level.bass * 0.02
      coverMesh.scale.setScalar(1 + level.bass * 0.035)
      renderer.render(scene, camera)
    }
    tick()

    const onResize = (): void => {
      renderer.setSize(el.clientWidth, el.clientHeight)
      camera.aspect = el.clientWidth / el.clientHeight
      camera.updateProjectionMatrix()
    }
    window.addEventListener('resize', onResize)
    return () => {
      alive = false
      swap.current = null
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', onResize)
      coverMaterial.map?.dispose()
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh
        mesh.geometry?.dispose()
        const material = mesh.material as THREE.Material | undefined
        material?.dispose()
      })
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return <div className="music-visualizer" ref={host} aria-hidden="true" />
}
