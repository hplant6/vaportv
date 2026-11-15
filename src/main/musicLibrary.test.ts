import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => '/nowhere' }, protocol: {}, net: {} }))

const { browseMusic, titleFromName } = await import('./musicLibrary')
const { paletteFromPixels } = await import('../renderer/src/music/palette')

describe('titleFromName', () => {
  it('drops a track number and the extension', () => {
    expect(titleFromName('/m/03 - Song Name.flac')).toBe('Song Name')
    expect(titleFromName('/m/12. Another One.mp3')).toBe('Another One')
    expect(titleFromName('/m/A2 Side Two.ogg')).toBe('Side Two')
  })

  it('keeps names that are only numbers, or start with a number that belongs', () => {
    expect(titleFromName('/m/1999.mp3')).toBe('1999')
    expect(titleFromName('/m/99 Luftballons.mp3')).toBe('Luftballons')
    expect(titleFromName('/m/Intro.wav')).toBe('Intro')
  })
})

describe('paletteFromPixels', () => {
  const pixels = (colours: [number, number, number][]): Uint8ClampedArray => new Uint8ClampedArray(colours.flatMap(([r, g, b]) => [r, g, b, 255]))

  it('puts the commonest lively colour first and ignores black and white', () => {
    const red: [number, number, number] = [220, 40, 40]
    const blue: [number, number, number] = [40, 60, 210]
    const p = paletteFromPixels(pixels([...Array(30).fill(red), ...Array(10).fill(blue), ...Array(50).fill([0, 0, 0]), ...Array(50).fill([255, 255, 255])]))
    expect(p[0]).toBe('#dc2828')
    expect(p[1]).toBe('#283cd2')
  })

  it('falls back to vaporTV colours for a cover that is all black', () => {
    expect(paletteFromPixels(pixels(Array(20).fill([0, 0, 0])))).toEqual(['#ee960d', '#7b3fe4', '#1fb5c9'])
  })
})

describe('browseMusic', () => {
  it("leaves out a NAS's snapshot and recycle folders and Windows' own, and sorts numbers as numbers", async () => {
    const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises')
    const { homedir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = await mkdtemp(join(homedir(), '.vaportv-music-test-'))
    try {
      for (const name of ['@Recently-Snapshot', '@Recycle', '#recycle', '$RECYCLE.BIN', 'System Volume Information', 'Album 10', 'Album 2']) await mkdir(join(dir, name))
      for (const name of ['10 Ten.mp3', '2 Two.flac', 'notes.txt']) await writeFile(join(dir, name), '')
      const names = (await browseMusic(dir)).map((e) => e.name)
      expect(names).toEqual(['Album 2', 'Album 10', '2 Two.flac', '10 Ten.mp3'])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
