import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => '/nowhere' } }))

describe('netflix extension', () => {
  it("takes only this extension's record and checksum out of Chrome's settings", async () => {
    const { forget } = await import('./netflixExtension')
    const dir = await mkdtemp(join(tmpdir(), 'steamtv-prefs-'))
    const file = join(dir, 'Preferences')
    const prefs = {
      extensions: { settings: { ours: { manifest: { version: '0.1.0' } }, other: { manifest: { version: '9' } } } },
      protection: { macs: { extensions: { settings: { ours: 'AAA', other: 'BBB' } } } },
      browser: { keep: true }
    }
    await writeFile(file, JSON.stringify(prefs))
    await forget(file, 'ours')
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({
      extensions: { settings: { other: { manifest: { version: '9' } } } },
      protection: { macs: { extensions: { settings: { other: 'BBB' } } } },
      browser: { keep: true }
    })
    // Nothing to take: the file's left as it was.
    await writeFile(file, '{"a":1}')
    await forget(file, 'ours')
    expect(await readFile(file, 'utf8')).toBe('{"a":1}')
    await rm(dir, { recursive: true, force: true })
  })
})
