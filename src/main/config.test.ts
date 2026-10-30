import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { saveConfig, type Config } from './config'

// config.json lives under the home Electron reports; here, a folder of the test's own.
vi.mock('electron', () => ({ app: { getPath: () => process.env.VAPORTV_TEST_HOME } }))

const saved = async (): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(join(process.env.VAPORTV_TEST_HOME!, '.config', 'steamtv', 'config.json'), 'utf8'))

describe('config', () => {
  beforeAll(async () => {
    process.env.VAPORTV_TEST_HOME = await mkdtemp(join(tmpdir(), 'vaportv-config-'))
  })
  afterAll(async () => {
    await rm(process.env.VAPORTV_TEST_HOME!, { recursive: true, force: true })
  })

  it('keeps every one of many saves made at once', async () => {
    await Promise.all(Array.from({ length: 50 }, (_, i) => saveConfig({ [`key${i}`]: i } as Partial<Config>)))
    const config = await saved()
    for (let i = 0; i < 50; i++) expect(config[`key${i}`]).toBe(i)
  })

  it('works a patch out from the config as it is when its turn comes', async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => saveConfig((config) => ({ steamCollections: [...(config.steamCollections ?? []), String(i)] })))
    )
    expect((await saved()).steamCollections).toHaveLength(20)
  })

  it('is readable only by its owner', async () => {
    await saveConfig({ welcomeSeen: true })
    const { mode } = await stat(join(process.env.VAPORTV_TEST_HOME!, '.config', 'steamtv', 'config.json'))
    expect(mode & 0o777).toBe(0o600)
  })
})
