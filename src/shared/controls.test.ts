import { describe, expect, it } from 'vitest'
import { DEFAULT_CONTROLS, resolveControls } from './controls'

/** Buttons as saved before Playlist existed: Artwork was `options`. */
const { playlist: _playlist, ...OLD_DEFAULTS } = DEFAULT_CONTROLS

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

  it('gives every action its own button', () => {
    const controls = resolveControls({ ...OLD_DEFAULTS, options: 2 } as never)
    expect(new Set(Object.values(controls)).size).toBe(Object.keys(controls).length)
  })
})
