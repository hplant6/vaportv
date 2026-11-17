import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

let home = ''
vi.mock('node:os', async (real) => ({ ...(await real<typeof import('node:os')>()), homedir: () => home }))
vi.mock('./library/art', () => ({ artUrl: (f: string) => f }))
vi.mock('./musicIndex', () => ({
  indexedSong: (path: string) => ({ path, title: path.split('/').pop(), artist: 'A' }),
  librarySongs: async () => []
}))

beforeAll(async () => {
  home = await mkdtemp(join(tmpdir(), 'vaportv-playlists-'))
})

describe('music playlists', () => {
  it('makes, adds, moves, removes, renames and deletes', async () => {
    const m = await import('./musicPlaylists')
    const id = await m.createPlaylist('Road trip', ['/m/1', '/m/2'], { seed: '/m/1' })
    expect(await m.addToPlaylist(id, ['/m/2', '/m/3'])).toBe(1)
    await m.moveInPlaylist(id, 2, 0)
    await m.removeFromPlaylist(id, '/m/2')
    await m.changePlaylist(id, { name: 'Drive', home: true })
    let [p] = await m.musicPlaylists()
    expect(p).toMatchObject({ name: 'Drive', home: true, canFresh: true, fresh: false })
    expect(p.songs.map((s) => s.path)).toEqual(['/m/3', '/m/1'])
    await m.changePlaylist(id, { fresh: true })
    expect(await m.freshenPlaylist(id, async () => ['/m/9'])).toBe(false) // just updated: not due
    expect(await m.freshenPlaylist(id, async () => ['/m/9'], true)).toBe(true)
    ;[p] = await m.musicPlaylists()
    expect(p.songs.map((s) => s.path)).toEqual(['/m/9'])
    await m.deletePlaylist(id)
    expect(await m.musicPlaylists()).toEqual([])
  })
})
