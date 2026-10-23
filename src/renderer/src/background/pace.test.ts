import { describe, expect, it, vi } from 'vitest'

let battery = false
vi.mock('../power', () => ({ onBattery: () => battery }))

describe('backdrop pacing', () => {
  it('draws every frame on mains power and every other 60Hz frame on battery', async () => {
    const { pacer } = await import('./pace')
    const frames = Array.from({ length: 60 }, (_, i) => i * (1000 / 60))
    battery = false
    const mains = pacer()
    expect(frames.filter((t) => mains(t)).length).toBe(60)
    battery = true
    const onBattery = pacer()
    expect(frames.filter((t) => onBattery(t)).length).toBe(30)
  })
})
