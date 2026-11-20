import { describe, expect, it, vi } from 'vitest'
import type * as THREE from 'three'
import { compileScene } from './compileScene'

/** A renderer whose one material's shader is ready after `readyAfter` checks; dispose() forgets it, as three's does. */
function fakeRenderer(readyAfter: number) {
  const material = {} as THREE.Material
  let checks = 0
  const properties = new Map<object, { currentProgram?: { isReady(): boolean } }>([[material, { currentProgram: { isReady: () => ++checks > readyAfter } }]])
  return {
    renderer: {
      compile: () => new Set([material]),
      properties: { get: (m: object) => properties.get(m) ?? {} }
    } as unknown as THREE.WebGLRenderer,
    dispose: () => properties.clear()
  }
}

describe('compileScene', () => {
  it('resolves once the shaders are ready', async () => {
    vi.useFakeTimers()
    const { renderer } = fakeRenderer(3)
    const done = vi.fn()
    void compileScene(renderer, {} as THREE.Object3D, {} as THREE.Camera, () => false).then(done)
    await vi.advanceTimersByTimeAsync(100)
    expect(done).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('stops checking, without throwing, once torn down mid-compile', async () => {
    vi.useFakeTimers()
    const { renderer, dispose } = fakeRenderer(1000)
    let stopped = false
    const done = vi.fn()
    void compileScene(renderer, {} as THREE.Object3D, {} as THREE.Camera, () => stopped).then(done)
    await vi.advanceTimersByTimeAsync(30)
    stopped = true
    dispose()
    await expect(vi.advanceTimersByTimeAsync(200)).resolves.not.toThrow()
    expect(done).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    vi.useRealTimers()
  })
})
