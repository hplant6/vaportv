import type * as THREE from 'three'

/**
 * Compiles `scene`'s shaders and resolves once they're all ready to draw, as three's
 * `renderer.compileAsync` does, but stops checking once `stopped()` says the scene's been
 * torn down. three's own goes on checking on a timer after its renderer is disposed, and
 * then throws ("reading 'isReady'": the More screen's tiles, passed over quickly).
 */
export function compileScene(renderer: THREE.WebGLRenderer, scene: THREE.Object3D, camera: THREE.Camera, stopped: () => boolean): Promise<void> {
  const materials = renderer.compile(scene, camera) as unknown as Set<THREE.Material>
  return new Promise((resolve) => {
    const check = (): void => {
      if (stopped()) return
      for (const material of materials) {
        const program = (renderer.properties.get(material) as { currentProgram?: { isReady(): boolean } }).currentProgram
        if (!program || program.isReady()) materials.delete(material)
      }
      if (materials.size === 0) resolve()
      else setTimeout(check, 10)
    }
    check()
  })
}
