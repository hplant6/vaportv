import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadTrackMemory, recall, remember, saveTrackMemory, type TrackMemory } from './trackMemory'

const audio = [
  { index: 1, name: 'Português · AAC Stereo', language: 'por' },
  { index: 2, name: 'English · 5.1 DTS', language: 'eng' }
]
const subtitles = [
  { index: 3, name: 'English', language: 'eng' },
  { index: 4, name: 'Español', language: 'spa' }
]
const empty: TrackMemory = { items: {} }

describe('remembered tracks', () => {
  it('plays a film again with the audio and subtitles picked last time', () => {
    const memory = remember(empty, 'emby:film', audio, subtitles, 2, 4, 1)
    expect(recall(memory, 'emby:film', audio, subtitles)).toEqual({ audio: 2, subtitle: 4 })
  })

  it('remembers subtitles off', () => {
    const memory = remember(empty, 'emby:film', audio, subtitles, 2, -1, 1)
    expect(recall(memory, 'emby:film', audio, subtitles)).toEqual({ audio: 2, subtitle: -1 })
  })

  it("finds them again in another episode, where the stream indexes differ", () => {
    const memory = remember(empty, 'emby:show', audio, subtitles, 2, 3, 1)
    const episode = [
      { index: 5, name: 'English · 5.1 DTS', language: 'eng' },
      { index: 6, name: 'Português · AAC Stereo', language: 'por' }
    ]
    const episodeSubs = [{ index: 9, name: 'English (Forced)', language: 'eng' }]
    expect(recall(memory, 'emby:show', episode, episodeSubs)).toEqual({ audio: 5, subtitle: 9 })
  })

  it('starts a new film in the audio language picked last, and leaves its subtitles to the server', () => {
    const memory = remember(empty, 'emby:film', audio, subtitles, 2, 4, 1)
    expect(recall(memory, 'emby:other', audio, subtitles)).toEqual({ audio: 2 })
  })

  it('leaves everything to the server when nothing was picked', () => {
    expect(recall(empty, 'emby:film', audio, subtitles)).toEqual({})
  })

  it("keeps the subtitles remembered when they can't be told this time", () => {
    let memory = remember(empty, 'emby:film', audio, subtitles, 1, 4, 1)
    memory = remember(memory, 'emby:film', audio, subtitles, 2, undefined, 2)
    expect(recall(memory, 'emby:film', audio, subtitles)).toEqual({ audio: 2, subtitle: 4 })
  })

  it('keeps only the most recent', () => {
    let memory = empty
    for (let i = 0; i < 410; i++) memory = remember(memory, `emby:${i}`, audio, subtitles, 2, -1, i)
    expect(Object.keys(memory.items)).toHaveLength(400)
    expect(memory.items['emby:0']).toBeUndefined()
    expect(memory.items['emby:409']).toBeDefined()
  })

  it('saves and loads, and starts empty without a file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tracks-'))
    const file = join(dir, 'track-choices.json')
    expect(await loadTrackMemory(file)).toEqual({ items: {} })
    const memory = remember(empty, 'emby:film', audio, subtitles, 2, 4, 1)
    await saveTrackMemory(memory, file)
    expect(await loadTrackMemory(file)).toEqual(memory)
    await rm(dir, { recursive: true })
  })
})
