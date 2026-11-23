import { describe, expect, it } from 'vitest'
import { switcher, type SwitchTiming } from './visualizerSwitch'

const TIMING: SwitchTiming = { minHold: 15, maxHold: 40, giveUp: 70, fade: 0.7, drop: 0.3 }
const DT = 1 / 60

/** Runs `seconds` of frames; `beatAt(t)` says whether a kick lands on the frame at t. */
function run(s: ReturnType<typeof switcher>, seconds: number, opts: { beatAt?: (t: number) => boolean; energy?: (t: number) => number; playing?: boolean; from?: number } = {}) {
  let fades: Float32Array = new Float32Array(0)
  const from = opts.from ?? 0
  for (let t = from; t < from + seconds; t += DT) fades = s(opts.beatAt?.(t) ?? false, opts.energy?.(t) ?? 0.5, opts.playing ?? true, DT)
  return Array.from(fades)
}

const everyHalfSecond = (t: number): boolean => Math.abs(t % 0.5) < DT / 2

describe('visualizer switching', () => {
  it('starts on the first look and holds it through steady beats until maxHold', () => {
    const s = switcher(2, TIMING)
    expect(run(s, 39, { beatAt: everyHalfSecond })).toEqual([1, 0])
  })

  it('changes on the first kick after maxHold, cross-fading over `fade`', () => {
    const s = switcher(2, TIMING)
    run(s, 40.2) // no kicks yet
    const mid = run(s, 0.35, { beatAt: (t) => t < DT, from: 0 })
    expect(mid[0]).toBeGreaterThan(0.1)
    expect(mid[1]).toBeGreaterThan(0.1)
    expect(run(s, 0.5)).toEqual([0, 1])
  })

  it('changes sooner on a new section: a kick with the loudness jumping', () => {
    const s = switcher(2, TIMING)
    run(s, 16, { energy: () => 0.2 })
    expect(run(s, 1, { beatAt: (t) => t < DT, energy: () => 0.9 })).toEqual([0, 1])
  })

  it('a loudness jump before minHold does not change it', () => {
    const s = switcher(2, TIMING)
    run(s, 5, { energy: () => 0.2 })
    expect(run(s, 1, { beatAt: (t) => t < DT, energy: () => 0.9 })).toEqual([1, 0])
  })

  it('changes without a kick after giveUp (music with no beat)', () => {
    const s = switcher(2, TIMING)
    expect(run(s, 70.8)).toEqual([0, 1])
  })

  it('holds while paused', () => {
    const s = switcher(2, TIMING)
    expect(run(s, 200, { playing: false, beatAt: everyHalfSecond })).toEqual([1, 0])
  })

  it('takes turns: back to the first after a second change', () => {
    const s = switcher(2, TIMING)
    run(s, 70.8)
    expect(run(s, 70.8)).toEqual([1, 0])
  })

  it('never changes with a single look', () => {
    const s = switcher(1, TIMING)
    expect(run(s, 200, { beatAt: everyHalfSecond })).toEqual([1])
  })
})
