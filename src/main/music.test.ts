import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { browseFiles } from './browse'
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
    expect(tracks.music.map((t) => t.name)).toEqual(['Albums · Track', 'Loose song'])
    expect(tracks.ambience.map((t) => t.name)).toEqual(['Rain (built in)', 'Waves'])
  })

  it('moves the old rain-as-music choice over to ambience', () => {
    expect(musicChoices({ music: 'builtin:rain' })).toEqual({ music: null, ambience: 'builtin:rain' })
    // Once ambience has been chosen (even as none, saved as ''), nothing moves.
    expect(musicChoices({ music: 'builtin:rain', ambience: '' })).toEqual({ music: 'builtin:rain', ambience: null })
  })

  it('plays every track of a layer when shuffled', async () => {
    const layers = await currentMusic({ musicFolder: music, music: 'shuffle', ambience: 'Ambience/Waves.wav' })
    expect(layers.music.shuffle).toBe(true)
    expect(layers.music.urls).toHaveLength(2)
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

  it('copies a file in as its kind, without overwriting one of the same name', async () => {
    const config = { musicFolder: music }
    expect(await importMusic(config, join(source, 'New tune.mp3'), 'music')).toBe(join('Music', 'New tune.mp3'))
    expect(await importMusic(config, join(source, 'New tune.mp3'), 'music')).toBe(join('Music', 'New tune (2).mp3'))
    expect(await readFile(join(music, 'Music', 'New tune (2).mp3'), 'utf8')).toBe('tune')
    await expect(importMusic(config, join(source, 'notes.txt'), 'music')).rejects.toThrow()
    expect((await musicTracks(config)).music.map((t) => t.name)).toContain('New tune (2)')
  })
})
