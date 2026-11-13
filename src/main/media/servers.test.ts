import { describe, expect, it, vi } from 'vitest'

let config: Record<string, unknown> = {}
vi.mock('electron', () => ({ app: { getVersion: () => '0.0.0' }, net: {}, protocol: {} }))
vi.mock('../config', () => ({
  loadConfig: async () => config,
  saveConfig: async (patch: Record<string, unknown>) => {
    config = { ...config, ...patch }
  }
}))

const { accounts, merged } = await import('./servers')
const item = (source: string, id: string, lastPlayed?: string) => ({ source, id, title: id, subtitle: '', progress: 0.5, lastPlayed })

describe('media servers', () => {
  it('merges every server into one row, newest first, undated last', () => {
    const row = merged([
      [item('emby', 'a', '2026-11-10T10:00:00Z'), item('emby', 'b')],
      [item('jelly', 'c', '2026-11-12T10:00:00Z'), item('jelly', 'd', '2026-11-11T10:00:00Z')]
    ])
    expect(row.map((i) => i.id)).toEqual(['c', 'd', 'a', 'b'])
  })

  it("moves an Emby sign-in from before there could be several into the list, keeping its device id", async () => {
    config = { emby: { url: 'http://box:8096', serverName: 'LargeBox', userId: 'u1', userName: 'henry', token: 'tok' }, embyDeviceId: 'dev1' }
    const list = await accounts()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ kind: 'emby', url: 'http://box:8096', serverName: 'LargeBox', userName: 'henry', token: 'tok' })
    expect(list[0].key).toMatch(/^[0-9a-f]{12}$/)
    expect(config.emby).toBeUndefined()
    expect(config.mediaDeviceId).toBe('dev1')
    expect(await accounts()).toEqual(list)
  })
})
