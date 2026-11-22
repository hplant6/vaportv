import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => '/nowhere' } }))
const played: string[] = []
vi.mock('node:child_process', async (original) => {
  const real = await original<typeof import('node:child_process')>()
  return {
    ...real,
    // paplay: notes what it was given and finishes at once.
    spawn: (cmd: string, args: string[]) => {
      if (cmd !== 'paplay') return real.spawn(cmd, args)
      played.push(args[0])
      const child = Object.assign(new EventEmitter(), { kill: () => {}, pid: 1 })
      setTimeout(() => child.emit('close', 0), 5)
      return child
    }
  }
})

const { setJapaneseVoice, speak, whenQuiet } = await import('./speech')
const { voicePrompt } = await import('./claude')

describe('speaking Japanese with another voice', () => {
  it('keeps sentences in order when a later one is made first', async () => {
    const delays: Record<string, number> = { 'いち。': 60, 'に。': 5 }
    setJapaneseVoice(async (text) => {
      await new Promise((r) => setTimeout(r, delays[text]))
      return `/tmp/nowhere-${text}.wav`
    })
    void speak('いち。')
    void speak('に。')
    await new Promise((r) => setTimeout(r, 0))
    await whenQuiet()
    expect(played).toEqual(['/tmp/nowhere-いち。.wav', '/tmp/nowhere-に。.wav'])
    setJapaneseVoice(null)
  })

  it('asks Claude for kanji only when the voice can read it', () => {
    expect(voicePrompt(false)).toContain('no kanji')
    expect(voicePrompt(true)).not.toContain('no kanji')
    expect(voicePrompt(true)).toContain('written normally with kanji')
  })
})
