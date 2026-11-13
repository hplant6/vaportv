import { describe, expect, it } from 'vitest'
import { assignButton, CONTROL_ACTIONS, DEFAULT_CONTROLS, resolveControls } from './controls'

/** Buttons as saved before Playlist, the left bar and Settings had one: Artwork was `options`, volume on the triggers. */
const OLD_SAVED = {
  select: 0,
  back: 1,
  options: 2,
  favorite: 3,
  previousTab: 4,
  nextTab: 5,
  volumeDown: 6,
  volumeUp: 7,
  controlsGuide: 8,
  gameMenu: 9,
  nextSong: 10,
  voiceSearch: 11
} as never

const unique = (controls: Record<string, number>): boolean => {
  const buttons = CONTROL_ACTIONS.map((a) => controls[a.id])
  return new Set(buttons).size === buttons.length
}

describe('resolveControls', () => {
  it('puts the left bar on L2, the button guide on R2 and Settings on Select by default', () => {
    const controls = resolveControls(undefined)
    expect([controls.sideBar, controls.controlsGuide, controls.settings]).toEqual([6, 7, 8])
    expect(controls.playlist).toBe(2)
    expect(unique(controls)).toBe(true)
  })

  it('keeps a button saved for Artwork (the old X action) for Playlist', () => {
    // Artwork had been moved to L3, so Next song (L3 by default) had taken X.
    const controls = resolveControls({ ...(OLD_SAVED as object), nextSong: 2, options: 10 } as never)
    expect(controls.playlist).toBe(10)
    expect(controls.nextSong).toBe(2)
  })

  it('prefers a saved Playlist button over an old Artwork one', () => {
    const controls = resolveControls({ ...DEFAULT_CONTROLS, playlist: 2, options: 10 } as never)
    expect(controls.playlist).toBe(2)
  })

  it('gives actions added since buttons were saved a free one, the saved ones kept', () => {
    // The old triggers' volume is gone, so L2 is free for the left bar; the guide stays on Select,
    // so Settings takes the next free button (R2).
    const controls = resolveControls(OLD_SAVED)
    expect(controls.controlsGuide).toBe(8)
    expect(controls.sideBar).toBe(6)
    expect(controls.settings).toBe(7)
    expect(unique(controls)).toBe(true)
  })
})

describe('assignButton', () => {
  it('swaps with the action that had the button', () => {
    const swapped = assignButton(resolveControls(undefined), 'sideBar', 3)
    expect(swapped.sideBar).toBe(3)
    expect(swapped.favorite).toBe(6)
    expect(unique(swapped)).toBe(true)
  })
})
