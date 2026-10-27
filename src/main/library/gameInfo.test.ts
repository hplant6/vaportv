import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { esdeInfo, parseGamelist } from './esdeGamelists'
import { libretroInfo, parseRdb, type DbEntry } from './libretroDb'

/** A string as MessagePack. */
const str = (s: string): Buffer => {
  const b = Buffer.from(s)
  return b.length < 32 ? Buffer.concat([Buffer.from([0xa0 | b.length]), b]) : Buffer.concat([Buffer.from([0xd9, b.length]), b])
}

/** A map of strings and small numbers as MessagePack. */
const map = (fields: Record<string, string | number | Buffer>): Buffer =>
  Buffer.concat([
    Buffer.from([0x80 | Object.keys(fields).length]),
    ...Object.entries(fields).flatMap(([k, v]) => [
      str(k),
      typeof v === 'number' ? Buffer.from([0xcd, v >> 8, v & 0xff]) : Buffer.isBuffer(v) ? Buffer.concat([Buffer.from([0xc4, v.length]), v]) : str(v)
    ])
  ])

describe('libretro database', () => {
  it('reads a game’s details and drops rows that only have hashes', () => {
    const rdb = Buffer.concat([
      Buffer.from('RARCHDB\0'),
      Buffer.alloc(8),
      map({ name: 'Crash Bandicoot (USA)', rom_name: 'Crash Bandicoot (USA).bin', releaseyear: 1996, genre: 'Action', users: 1, developer: 'Naughty Dog, Inc', crc: Buffer.from([0x41, 0xb5]) }),
      map({ name: 'Crash Bandicoot (USA) (Demo)', crc: Buffer.from([1, 2]) }),
      Buffer.from([0xc0])
    ])
    expect(parseRdb(rdb)).toEqual([
      { name: 'Crash Bandicoot (USA)', rom: 'Crash Bandicoot (USA).bin', info: { year: '1996', genre: 'Action', players: '1', developer: 'Naughty Dog, Inc' } }
    ])
  })

  it('finds a game by its dump name, its set’s file, or else its title (USA first)', async () => {
    const cache = await mkdtemp(join(tmpdir(), 'steamtv-db-'))
    process.env.STEAMTV_LIBRETRO_DB_CACHE = cache
    const entries: DbEntry[] = [
      { name: 'Okami (Europe)', info: { year: '2007' } },
      { name: 'Okami (USA)', info: { year: '2006', genre: 'Action' } },
      { name: 'Street Fighter II: The World Warrior (World 910522)', rom: 'sf2.zip', info: { developer: 'Capcom' } }
    ]
    await writeFile(join(cache, 'Test.json'), JSON.stringify(entries))
    expect(await libretroInfo(['Test'], ['Okami (Europe)'], 'Okami')).toEqual({ year: '2007' })
    expect(await libretroInfo(['Test'], ['Nothing like it', 'sf2'], 'Street Fighter II')).toEqual({ developer: 'Capcom' })
    expect(await libretroInfo(['Test'], ['Okami (Japan)'], 'Okami')).toEqual({ year: '2006', genre: 'Action' })
    expect(await libretroInfo(['Test'], [], 'Kameo')).toBeNull()
  })
})

describe('ES-DE gamelists', () => {
  const xml = `<?xml version="1.0"?>
<gameList>
	<game>
		<path>./Aladdin (USA).zip</path>
		<name>Disney&apos;s Aladdin</name>
		<desc>Jafar &amp; the lamp.</desc>
		<rating>0.8</rating>
		<releasedate>19940127T000000</releasedate>
		<developer>Capcom</developer>
		<genre>Platform</genre>
		<players>1-2</players>
	</game>
	<game>
		<path>./Final Fantasy VII (USA)/Final Fantasy VII (USA).m3u</path>
		<desc>Cloud.</desc>
	</game>
	<game>
		<path>./Unscraped.zip</path>
		<name>Unscraped</name>
	</game>
</gameList>`

  it('reads each game’s details by its file name', () => {
    const games = parseGamelist(xml)
    expect(games.get('aladdin (usa)')).toEqual({ year: '1994', genre: 'Platform', players: '1-2', developer: 'Capcom', description: 'Jafar & the lamp.', rating: 0.8 })
    expect(games.has('unscraped')).toBe(false)
  })

  beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'steamtv-esde-'))
    await mkdir(join(dir, 'psx'))
    await writeFile(join(dir, 'psx', 'gamelist.xml'), xml)
    process.env.STEAMTV_ESDE_GAMELISTS = dir
  })

  it('finds a game by any of its files, whatever the folder', async () => {
    expect(await esdeInfo(['psx'], ['/roms/psx/FF7/Final Fantasy VII (USA) (Disc 1).chd', '/roms/psx/FF7/Final Fantasy VII (USA).m3u'])).toEqual({ description: 'Cloud.' })
    expect(await esdeInfo(['psx'], ['/roms/psx/Tekken (USA).chd'])).toBeNull()
    expect(await esdeInfo(['n64'], ['/roms/n64/Aladdin (USA).zip'])).toBeNull()
  })
})
