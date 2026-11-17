import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

let home = ''
vi.mock('node:os', async (real) => ({ ...(await real<typeof import('node:os')>()), homedir: () => home }))
vi.mock('./claudeLogin', () => ({ lanAddress: () => '127.0.0.1' }))

beforeAll(async () => {
  home = await mkdtemp(join(tmpdir(), 'vaportv-phone-'))
})

describe('safeName', async () => {
  const { safeName } = await import('./phoneUpload')
  it('keeps an album folder, refuses going up and non-music', () => {
    expect(safeName('Album/01 Song.flac')).toBe(join('Album', '01 Song.flac'))
    expect(safeName('../../.bashrc')).toBeNull()
    expect(safeName('../../evil.mp3')).toBe('evil.mp3')
    expect(safeName('notes.txt')).toBeNull()
  })
})

describe('the page', () => {
  let stop: () => void = () => {}
  afterAll(() => stop())
  it('saves a song sent to it, and a second of the same name beside it', async () => {
    const m = await import('./phoneUpload')
    stop = m.stopPhoneUpload
    const events: string[] = []
    const url = await new Promise<string>((done) =>
      m.startPhoneUpload((e) => {
        events.push(e.phase)
        if (e.phase === 'ready') done(e.url)
      })
    )
    expect((await fetch(url)).status).toBe(200)
    const put = (name: string, body: string) => fetch(`${url}/file?name=${encodeURIComponent(name)}`, { method: 'PUT', body })
    expect((await put('Album/a.mp3', 'one')).status).toBe(200)
    expect((await put('Album/a.mp3', 'two')).status).toBe(200)
    expect((await put('x.exe', 'no')).status).toBe(415)
    expect((await fetch(url.replace(/\/[^/]+$/, '/wrong'))).status).toBe(404)
    const folder = join(home, 'Music', 'From your phone', 'Album')
    expect(await readFile(join(folder, 'a.mp3'), 'utf8')).toBe('one')
    expect(await readFile(join(folder, 'a (2).mp3'), 'utf8')).toBe('two')
    expect(events.filter((e) => e === 'received')).toHaveLength(2)
  })
})
