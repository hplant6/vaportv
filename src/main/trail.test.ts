import { describe, expect, it } from 'vitest'
import type { IpcMain } from 'electron'
import { summarize, trail, trailEntries, traceIpc } from './trail'

describe('activity trail', () => {
  it('says what came back by its shape, never its values', () => {
    expect(summarize(undefined)).toBe('done')
    expect(summarize([1, 2, 3])).toBe('3 items')
    expect(summarize('Holiday photos')).toBe('text (14)')
    expect(summarize({ albums: [1, 2], artists: [3], title: 'x' })).toBe('{ albums: 2, artists: 1 }')
    expect(summarize({ a: 1, b: 2 })).toBe('{ 2 fields }')
  })

  it('counts repeats of the same call and result instead of adding lines', () => {
    const before = trailEntries().length
    for (let i = 0; i < 5; i++) trail(`home:get ${i} ms → 3 items`, 'home:get → 3 items')
    const after = trailEntries()
    expect(after.length).toBe(before + 1)
    expect(after[after.length - 1]).toMatch(/\[main\] home:get 4 ms → 3 items \(×5\)$/)
  })

  it('keeps only the newest entries', () => {
    for (let i = 0; i < 3100; i++) trail(`n ${i}`)
    const all = trailEntries()
    expect(all.length).toBe(3000)
    expect(all[all.length - 1]).toMatch(/n 3099$/)
    expect(all[0]).toMatch(/n 100$/)
  })

  it('traces each call: its time and result, or its error', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const ipc = { handle: (channel: string, fn: (...args: unknown[]) => unknown) => void handlers.set(channel, fn) } as unknown as IpcMain
    traceIpc(ipc)
    ipc.handle('music:albums', async () => [1, 2])
    ipc.handle('media:play', async () => {
      throw new Error('server said 401')
    })
    await handlers.get('music:albums')!({})
    await expect(handlers.get('media:play')!({})).rejects.toThrow('401')
    const tail = trailEntries().slice(-2)
    expect(tail[0]).toMatch(/music:albums \d+ ms → 2 items$/)
    expect(tail[1]).toMatch(/media:play \d+ ms → error: server said 401$/)
  })
})
