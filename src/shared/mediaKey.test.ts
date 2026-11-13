import { describe, expect, it } from 'vitest'
import { gameTab, playlistTakes } from './tabs'
import { mediaKey, parseMediaKey } from './mediaKey'

describe('media in playlists', () => {
  it('keeps a film by its account and item, and reads it back', () => {
    const key = mediaKey('39bbf809e8bf', 'film1')
    expect(key).toBe('media:39bbf809e8bf:film1')
    expect(parseMediaKey(key)).toEqual({ source: '39bbf809e8bf', id: 'film1' })
    expect(parseMediaKey('snes:Chrono Trigger.sfc')).toBeNull()
  })

  it('belongs to the Media tab, so Home and Media playlists take it and console ones don’t', () => {
    const tab = gameTab(mediaKey('a', 'b'))
    expect(tab).toBe('media')
    expect(playlistTakes(['home'], tab)).toBe(true)
    expect(playlistTakes(['media'], tab)).toBe(true)
    expect(playlistTakes(['snes'], tab)).toBe(false)
  })
})
