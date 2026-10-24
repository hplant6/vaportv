import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { browseFiles, openFile, wasOpened } from './browse'
import { currentMusic, importMusic, musicChoices, musicTracks } from './music'

// The browser and importer only touch home and drive mounts, so the fixture lives in home.
let root: string
let music: string
let source: string

beforeAll(async () => {
  await mkdir(join(homedir(), '.cache'), { recursive: true })
  root = await mkdtemp(join(homedir(), '.cache', 'steamtv-music-test-'))
  music = join(root, 'Music')
  source = join(root, 'USB')
  await mkdir(join(music, 'Ambience'), { recursive: true })
  await mkdir(join(music, 'Albums'), { recursive: true })
  await mkdir(join(source, 'Sub'), { recursive: true })
  await writeFile(join(music, 'Loose song .wav'), 'a')
  await writeFile(join(music, 'Albums', 'Track.mp3'), 'b')
  await writeFile(join(music, 'Ambience', 'Waves.wav'), 'c')
  await writeFile(join(source, 'New tune.mp3'), 'tune')
  await writeFile(join(source, 'notes.txt'), 'x')
  await writeFile(join(source, 'Beach.jpg'), 'img')
  await writeFile(join(source, 'Fire.mp4'), 'vid')
})

afterAll(() => rm(root, { recursive: true, force: true }))

describe('background music', () => {
  it('splits tracks into music and ambience', async () => {
    const tracks = await musicTracks({ musicFolder: music })
    // The built-in Chris Zabriskie tracks first, each with its credit, then the folder's.
    expect(tracks.music).toHaveLength(9)
    expect(tracks.music.slice(0, 7).every((t) => t.file.startsWith('builtin:zabriskie-') && t.credit?.includes('CC BY 4.0'))).toBe(true)
    expect(tracks.music.slice(7).map((t) => t.name)).toEqual(['Albums · Track', 'Loose song'])
    expect(tracks.ambience.map((t) => t.name)).toEqual(['Rain (built in)', 'Crickets (built in)', 'Ocean waves (built in)', 'Birdsong (built in)', 'Waves'])
  })

  it('moves the old rain-as-music choice over to ambience', () => {
    expect(musicChoices({ music: 'builtin:rain' })).toEqual({ music: null, ambience: 'builtin:rain' })
    // Once ambience has been chosen (even as none, saved as ''), nothing moves.
    expect(musicChoices({ music: 'builtin:rain', ambience: '' })).toEqual({ music: 'builtin:rain', ambience: null })
  })

  it('plays a playlist: the built-in one until any are saved, in its order, less missing tracks', async () => {
    const builtIn = await currentMusic({ musicFolder: music, music: 'playlist:zabriskie' })
    expect(builtIn.music.urls).toHaveLength(7)
    expect(builtIn.music.shuffle).toBe(false)
    const mine = await currentMusic({
      musicFolder: music,
      music: 'playlist:mine',
      playlists: [{ id: 'mine', name: 'Mine', files: ['Loose song .wav', 'gone.mp3', 'builtin:zabriskie-cut-to-rip-torn'], shuffle: true }]
    })
    expect(mine.music.urls.map((u) => decodeURIComponent(u).split('/').pop())).toEqual(['Loose song .wav', 'zabriskie-cut-to-rip-torn.ogg'])
    expect(mine.music.shuffle).toBe(true)
    // Saved playlists replace the built-in one.
    expect((await currentMusic({ musicFolder: music, music: 'playlist:zabriskie', playlists: [] })).music.urls).toEqual([])
  })

  it('plays every track of a layer when shuffled', async () => {
    const layers = await currentMusic({ musicFolder: music, music: 'shuffle', ambience: 'Ambience/Waves.wav' })
    expect(layers.music.shuffle).toBe(true)
    expect(layers.music.urls).toHaveLength(9)
    expect(layers.ambience).toMatchObject({ shuffle: false })
    expect(layers.ambience.urls).toHaveLength(1)
  })

  it('browses folders and the files asked for, and nothing outside home and the drives', async () => {
    const names = async (kind: 'audio' | 'backdrop'): Promise<string[][]> => (await browseFiles(source, kind)).map((e) => [e.name, e.kind])
    expect(await names('audio')).toEqual([
      ['Sub', 'folder'],
      ['New tune.mp3', 'file']
    ])
    expect(await names('backdrop')).toEqual([
      ['Sub', 'folder'],
      ['Beach.jpg', 'file'],
      ['Fire.mp4', 'file']
    ])
    await expect(browseFiles('/etc', 'audio')).rejects.toThrow()
  })

  it('shows the Files app everything, with sizes and what it can open', async () => {
    const all = await browseFiles(source, 'all')
    expect(all.map((e) => [e.name, e.kind, e.media])).toEqual([
      ['Sub', 'folder', undefined],
      ['Beach.jpg', 'file', 'image'],
      ['Fire.mp4', 'file', 'video'],
      ['New tune.mp3', 'file', 'audio'],
      ['notes.txt', 'file', undefined]
    ])
    expect(all.find((e) => e.name === 'New tune.mp3')).toMatchObject({ size: 4, modified: expect.any(Number) })
  })

  it('lets the page load only files the Files app opened, from home and the drives', async () => {
    const file = join(source, 'Beach.jpg')
    expect(wasOpened(file)).toBe(false)
    expect(await openFile(file)).toContain(encodeURIComponent(file))
    expect(wasOpened(file)).toBe(true)
    expect(wasOpened(join(source, 'Fire.mp4'))).toBe(false)
    await expect(openFile('/etc/hostname')).rejects.toThrow()
    await expect(openFile(join(source, 'Sub'))).rejects.toThrow()
  })

  it('copies a file in as its kind, without overwriting one of the same name', async () => {
    const config = { musicFolder: music }
    expect(await importMusic(config, join(source, 'New tune.mp3'), 'music')).toBe(join('Music', 'New tune.mp3'))
    expect(await importMusic(config, join(source, 'New tune.mp3'), 'music')).toBe(join('Music', 'New tune (2).mp3'))
    expect(await readFile(join(music, 'Music', 'New tune (2).mp3'), 'utf8')).toBe('tune')
    await expect(importMusic(config, join(source, 'notes.txt'), 'music')).rejects.toThrow()
    expect((await musicTracks(config)).music.map((t) => t.name)).toContain('New tune (2)')
  })
})

describe('media ranges', () => {
  it('reads Range headers as a web server would', async () => {
    const { parseRange } = await import('./library/mediaRange')
    expect(parseRange(null, 1000)).toBeNull()
    expect(parseRange('bytes=0-', 1000)).toEqual({ start: 0, end: 999 })
    expect(parseRange('bytes=100-199', 1000)).toEqual({ start: 100, end: 199 })
    expect(parseRange('bytes=900-5000', 1000)).toEqual({ start: 900, end: 999 })
    expect(parseRange('bytes=-200', 1000)).toEqual({ start: 800, end: 999 })
    expect(parseRange('bytes=1000-', 1000)).toBe('unsatisfiable')
  })
})
