import { describe, expect, it } from 'vitest'
import { actionsOn, assignButton, CONTROL_ACTIONS, DEFAULT_CONTROLS, isHold, resolveControls } from './controls'

/** Buttons as saved before Playlist existed: Artwork was `options`. */
const { playlist: _playlist, sideBar: _sideBar, ...OLD_DEFAULTS } = DEFAULT_CONTROLS

describe('resolveControls', () => {
  it('gives X to Playlist by default', () => {
    expect(resolveControls(undefined).playlist).toBe(2)
  })

  it('keeps a button saved for Artwork (the old X action) for Playlist', () => {
    // Artwork had been moved to L3, so Next song (L3 by default) had taken X.
    const controls = resolveControls({ ...OLD_DEFAULTS, nextSong: 2, options: 10 } as never)
    expect(controls.playlist).toBe(10)
    expect(controls.nextSong).toBe(2)
  })

  it('prefers a saved Playlist button over an old Artwork one', () => {
    const controls = resolveControls({ ...DEFAULT_CONTROLS, playlist: 2, options: 10 } as never)
    expect(controls.playlist).toBe(2)
  })

  it('gives every action its own button, a press and a hold apart', () => {
    for (const saved of [undefined, { ...OLD_DEFAULTS, options: 2 } as never]) {
      const controls = resolveControls(saved)
      for (const hold of [false, true]) {
        const buttons = CONTROL_ACTIONS.filter((a) => isHold(a.id) === hold).map((a) => controls[a.id])
        expect(new Set(buttons).size).toBe(buttons.length)
      }
    }
  })
})

describe('press and hold', () => {
  it('taps Select for the left bar and holds it for the button guide', () => {
    const controls = resolveControls(undefined)
    expect(actionsOn(controls, 8)).toEqual({ press: 'sideBar', hold: 'controlsGuide' })
    expect(actionsOn(controls, 0)).toEqual({ press: 'select', hold: undefined })
  })

  it('keeps the guide on Select for buttons saved before the left bar, the bar taking Select’s tap', () => {
    const controls = resolveControls({ ...OLD_DEFAULTS })
    expect(controls.controlsGuide).toBe(8)
    expect(controls.sideBar).toBe(8)
  })

  it('gives the left bar a free button when Select’s tap was taken', () => {
    // Next song had been put on Select, and the guide on L3.
    const controls = resolveControls({ ...OLD_DEFAULTS, nextSong: 8, controlsGuide: 10 })
    expect(controls.nextSong).toBe(8)
    expect(controls.sideBar).toBe(10)
    expect(actionsOn(controls, 10)).toEqual({ press: 'sideBar', hold: 'controlsGuide' })
  })

  it('swaps a press only with a press, and a hold only with a hold', () => {
    const controls = resolveControls(undefined)
    // The guide's hold to X: X's press (Playlist) stays; Select keeps the bar.
    const moved = assignButton(controls, 'controlsGuide', 2)
    expect(actionsOn(moved, 2)).toEqual({ press: 'playlist', hold: 'controlsGuide' })
    expect(actionsOn(moved, 8)).toEqual({ press: 'sideBar', hold: undefined })
    // The bar's tap to Y: Favorite takes Select.
    const swapped = assignButton(controls, 'sideBar', 3)
    expect(swapped.favorite).toBe(8)
    expect(swapped.controlsGuide).toBe(8)
  })
})
