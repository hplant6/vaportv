import { describe, expect, it } from 'vitest'
import { handle, initialState, tick, type PlayerState } from './playerUi'
import { padDecoder, padId } from './padInput'
import { matchTracks, shortcutList } from './externalPlayer'
import { DEFAULT_CONTROLS } from '../../shared/controls'
import { assText, fit, renderOsd } from './playerOsd'

const fonts = { display: 'Tilt Warp', body: 'Bricolage Grotesque 96pt ExtraBold', bodyBold: 'Bricolage Grotesque 96pt ExtraBold ExtraBold' }

function playing(over: Partial<PlayerState> = {}): PlayerState {
  return { ...initialState('Bugonia', '2025', 0), loading: false, duration: 7200, position: 600, ...over }
}

describe('player controls', () => {
  it('A plays and pauses from the seek bar', () => {
    const [paused, commands] = handle(playing(), 'select', 100)
    expect(commands).toEqual([{ pause: true }])
    expect(paused.paused).toBe(true)
    expect(handle(paused, 'select', 200)[1]).toEqual([{ pause: false }])
  })

  it('B stops, or closes Audio & subtitles first', () => {
    expect(handle(playing(), 'back', 100)[1]).toEqual([{ stop: true }])
    const withTracks = playing({ audio: [{ id: 1, name: 'English' }, { id: 2, name: 'French' }], aid: 1 })
    const [open] = handle(withTracks, 'tracks', 100)
    expect(open.menu).toEqual({ column: 'audio', row: 0 })
    const [closed, commands] = handle(open, 'back', 200)
    expect(closed.menu).toBeNull()
    expect(commands).toEqual([])
  })

  it('scrubs with the D-pad and jumps once the presses stop', () => {
    let [state] = handle(playing(), 'right', 100)
    // A two-hour film: 1/120th is 60 s a press.
    expect(state.scrub?.to).toBe(660)
    ;[state] = handle(state, 'right', 300)
    expect(state.scrub!.to).toBeGreaterThan(720)
    const [settled, commands] = tick(state, 300 + 701)
    expect(commands).toEqual([{ seek: state.scrub!.to }])
    expect(settled.scrub).toBeNull()
  })

  it('the triggers skip 10 seconds and add up the total said', () => {
    let [state, commands] = handle(playing(), 'skipOn', 100)
    expect(commands).toEqual([{ seek: 610 }])
    ;[state, commands] = handle(state, 'skipOn', 400)
    expect(commands).toEqual([{ seek: 620 }])
    expect(state.skipped?.by).toBe(20)
  })

  it('down goes to the buttons; left and right step along them', () => {
    let [state] = handle(playing(), 'down', 100)
    expect(state.row).toBe('buttons')
    expect(state.button).toBe('playPause')
    ;[state] = handle(state, 'left', 200)
    expect(state.button).toBe('back')
    const [, commands] = handle(state, 'select', 300)
    expect(commands).toEqual([{ seek: 590 }])
  })

  it('a first up or down with the bar hidden only shows it', () => {
    const hidden = playing({ barUntil: 0 })
    const [state] = handle(hidden, 'down', 10_000)
    expect(state.row).toBe('seek')
    expect(state.barUntil).toBeGreaterThan(10_000)
  })

  it('picks subtitles in the menu, Off included', () => {
    const state = playing({ audio: [{ id: 1, name: 'English' }], subtitles: [{ id: 1, name: 'English SDH' }], aid: 1, sid: null })
    let [open] = handle(state, 'tracks', 100)
    ;[open] = handle(open, 'right', 200)
    expect(open.menu).toEqual({ column: 'subtitles', row: 0 })
    ;[open] = handle(open, 'down', 300)
    const [picked, commands] = handle(open, 'select', 400)
    expect(commands).toEqual([{ subtitle: 1 }])
    expect(picked.sid).toBe(1)
    expect(picked.menu).toBeNull()
  })

  it('says so when there are no other tracks', () => {
    const [state] = handle(playing({ audio: [{ id: 1, name: 'English' }] }), 'tracks', 100)
    expect(state.menu).toBeNull()
    expect(state.note?.text).toMatch(/no other audio/)
  })
})

describe('controller decoding', () => {
  it('turns a hat into directions and triggers into buttons 6 and 7', () => {
    const seen: unknown[] = []
    const decoder = padDecoder((what) => seen.push(what))
    decoder.abs(0x11, -1)
    decoder.abs(0x11, 0)
    decoder.abs(0x05, 255)
    decoder.abs(0x05, 200)
    decoder.abs(0x05, 0)
    decoder.key(0x130, 1)
    decoder.key(0x130, 0)
    expect(seen).toEqual([{ direction: 'up' }, { direction: null }, { button: 7 }, { button: 0 }])
  })
})

describe('track matching', () => {
  const play = {
    audioStreams: [
      { index: 1, name: 'English · Dolby Digital+ 5.1' },
      { index: 2, name: 'French · AC3 5.1' }
    ],
    subtitleStreams: [
      { index: 5, name: 'English (external)', url: 'http://x/sub.srt' },
      { index: 3, name: 'English' },
      { index: 4, name: 'French' }
    ]
  }

  it("uses the server's names when the lists line up, the file's own subtitles before files beside it", () => {
    const tracks = [
      { id: 1, type: 'video' as const },
      { id: 1, type: 'audio' as const, lang: 'eng' },
      { id: 2, type: 'audio' as const, lang: 'fre' },
      { id: 1, type: 'sub' as const, lang: 'eng' },
      { id: 2, type: 'sub' as const, lang: 'fre' },
      { id: 3, type: 'sub' as const, external: true }
    ]
    const matched = matchTracks(tracks, play)
    expect(matched.audio.map((t) => t.name)).toEqual(['English · Dolby Digital+ 5.1', 'French · AC3 5.1'])
    expect(matched.subtitles.map((t) => t.name)).toEqual(['English', 'French', 'English (external)'])
    expect(matched.subtitleIndex.get(5)).toBe(3)
    expect(matched.audioIndex.get(2)).toBe(2)
  })

  it("falls back to mpv's names when they don't", () => {
    const matched = matchTracks([{ id: 1, type: 'audio', lang: 'eng', codec: 'eac3', 'demux-channel-count': 6 }], play)
    expect(matched.audio).toEqual([{ id: 1, name: 'English · 5.1 · EAC3' }])
    expect(matched.audioIndex.size).toBe(0)
  })
})

describe('drawing', () => {
  it('keeps text literal and cuts long names', () => {
    expect(assText('a{b}c\\N')).toBe('a(b)c⧵N')
    expect(fit('A very long subtitle track name indeed', 200, 22)).toMatch(/…$/)
  })

  it('draws the bar while it shows and nothing once it hides', () => {
    const state = playing()
    expect(renderOsd(state, 0, fonts)).toContain('Bugonia')
    expect(renderOsd({ ...state, barUntil: 0 }, 10_000, fonts)).toBe('')
    expect(renderOsd({ ...state, keysShown: true, shortcuts: [{ keys: 'A', what: 'Play / pause' }] }, 0, fonts)).toContain('Shortcuts')
  })
})

describe('controller shortcuts', () => {
  it('the controller button opens the panel and B closes it before stopping', () => {
    let [state] = handle(playing(), 'down', 100)
    for (let i = 0; i < 3; i++) [state] = handle(state, 'right', 200 + i)
    expect(state.button).toBe('keys')
    ;[state] = handle(state, 'select', 300)
    expect(state.keysShown).toBe(true)
    const [closed, commands] = handle(state, 'back', 400)
    expect(closed.keysShown).toBe(false)
    expect(commands).toEqual([])
  })

  it('names the buttons as the controller in use marks them', () => {
    const xbox = shortcutList(DEFAULT_CONTROLS, 'xbox')
    expect(xbox[0]).toEqual({ keys: 'A', what: 'Play / pause' })
    expect(xbox.find((s) => s.what === '10 seconds back / on')?.keys).toBe('L2 / R2')
    expect(shortcutList(DEFAULT_CONTROLS, 'ps5')[0].keys).toBe('Cross')
  })

  it("finds the first real controller, not Steam's copy", () => {
    const devices = [
      'I: Bus=0003 Vendor=28de Product=11ff Version=0001\nN: Name="Microsoft X-Box 360 pad 0"\nH: Handlers=event17 js1',
      'I: Bus=0003 Vendor=054c Product=0ce6 Version=8111\nN: Name="DualSense Wireless Controller"\nH: Handlers=event18 js2'
    ].join('\n\n')
    expect(padId(devices)).toBe('DualSense Wireless Controller (Vendor: 054c Product: 0ce6)')
  })
})
