import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { launchUrl, shortcutGameId } from '../launch'
import { collectionGames, isSupported, readCollections } from './collections'
import { loadRecents, pickRecent, toRecentItem } from './recents'
import { loadSteamTab } from './steamTab'
import { scanDreamcast } from './dreamcast'
import { dreamcastContent } from './dreamcastTab'
import { parseEmuDeckSettings, shortcutAppId } from './emudeck'
import { scanGameCube } from './gamecube'
import { cleanPs3Title, parseSfo, scanPs3 } from './ps3'
import { rpcs3Args } from './ps3Tab'
import { cleanTitle, scanSwitch } from './switch'
import { normalizeName } from './steamgriddb'
import { cleanXbox360Title, scanXbox360 } from './xbox360'
import { activeUserDir, playedShortcuts, playedSteamGames, type Played } from './steam'
import { parseWpctlVolume } from '../volume'
import { assignButton, DEFAULT_CONTROLS, resolveControls } from '../../shared/controls'
import { arcadeGames, arcadeTitle, loadArcadeTab } from './arcade'
import type { Config } from '../config'
import { dumpName } from './discs'
import { libretroCover, libretroCovers, thumbnailName } from './libretroThumbnails'
import { customAppFor, customApps } from '../customApps'
import { appState, webShortcuts } from '../appSetup'
import { searchPlaces } from '../location'
import { isSwitchOff } from '../../shared/controllers'
import { childObject, childString, dumpBinaryVdf, parseBinaryVdf, parseTextVdf, type VdfObject } from './vdf'

// Builds binary VDF the way Steam writes shortcuts.vdf.
type Bin = { [key: string]: string | number | Bin }
function binaryVdf(obj: Bin): Buffer {
  const parts: Buffer[] = []
  for (const [key, value] of Object.entries(obj)) {
    const k = Buffer.from(`${key}\0`)
    if (typeof value === 'string') parts.push(Buffer.from([1]), k, Buffer.from(`${value}\0`))
    else if (typeof value === 'number') {
      const n = Buffer.alloc(4)
      n.writeUInt32LE(value)
      parts.push(Buffer.from([2]), k, n)
    } else parts.push(Buffer.from([0]), k, binaryVdf(value))
  }
  parts.push(Buffer.from([8]))
  return Buffer.concat(parts)
}

const DAY = 86400
const NOW = Date.UTC(2026, 9, 14, 12) // 2026-10-14
const now = NOW / 1000

async function fakeSteam(): Promise<{ root: string; user: string }> {
  const root = await mkdtemp(join(tmpdir(), 'steamtv-'))
  const user = join(root, 'userdata', '123')
  await mkdir(join(user, 'config', 'grid'), { recursive: true })
  await mkdir(join(root, 'steamapps'), { recursive: true })

  const manifest = (id: string, name: string): Promise<void> =>
    writeFile(join(root, 'steamapps', `appmanifest_${id}.acf`), `"AppState"\n{\n\t"appid"\t\t"${id}"\n\t"name"\t\t"${name}"\n}\n`)
  await manifest('10', 'Dead Island 2')
  await manifest('20', 'Proton 9.0')
  await manifest('30', 'Old Game')

  await writeFile(
    join(user, 'config', 'localconfig.vdf'),
    `"UserLocalConfigStore"
{
	"Software"
	{
		"Valve"
		{
			"Steam"
			{
				"apps"
				{
					"10"	{ "LastPlayed"	"${now - DAY}" }
					"20"	{ "LastPlayed"	"${now - DAY}" }
					"30"	{ "LastPlayed"	"${now - 90 * DAY}" }
					"40"	{ "LastPlayed"	"${now - DAY}" }
				}
			}
		}
	}
}
`
  )

  // Newer games keep art in hashed subfolders.
  await mkdir(join(root, 'appcache', 'librarycache', '10', 'abc123'), { recursive: true })
  await writeFile(join(root, 'appcache', 'librarycache', '10', 'abc123', 'library_600x900.jpg'), '')

  await writeFile(
    join(user, 'config', 'shortcuts.vdf'),
    binaryVdf({
      shortcuts: {
        '0': { appid: 111, AppName: 'Emby Theater', Exe: '"/usr/bin/emby"', LastPlayTime: now - 2 * DAY },
        '1': { appid: 222, AppName: 'steamtv', Exe: '"/home/deck/Applications/steamtv.AppImage"', LastPlayTime: now },
        '2': { appid: 333, appname: 'EmulationStationDE', exe: '"/x/es-de.sh"', LastPlayTime: now },
        '3': { appid: 444, AppName: 'The Witcher 3', Exe: '"/games/witcher3"', LastPlayTime: now - 3 * DAY },
        '4': { appid: 555, AppName: 'Never Played', Exe: '"/x"', LastPlayTime: 0 }
      }
    })
  )
  await writeFile(join(user, 'config', 'grid', '444p.png'), '')
  return { root, user }
}

describe('vdf', () => {
  it('parses text VDF with escapes and comments', () => {
    const vdf = parseTextVdf('// comment\n"a"\n{\n\t"b"\t\t"say \\"hi\\""\n\t"c" { "d" "1" }\n}\n')
    expect(vdf).toEqual({ a: { b: 'say "hi"', c: { d: '1' } } })
  })

  it('parses binary VDF', () => {
    const vdf = parseBinaryVdf(binaryVdf({ shortcuts: { '0': { appid: 4159378748, AppName: 'x', tags: {} } } }))
    expect(vdf).toEqual({ shortcuts: { '0': { appid: 4159378748, AppName: 'x', tags: {} } } })
  })
})

describe('steam library', () => {
  it('finds played, installed games and skips tools and uninstalled ones', async () => {
    const { root, user } = await fakeSteam()
    expect(await activeUserDir(root)).toBe(user)
    const games = await playedSteamGames(root, user)
    expect(games.map((g) => g.title).sort()).toEqual(['Dead Island 2', 'Old Game'])
    expect(games.find((g) => g.title === 'Dead Island 2')?.art.portrait).toMatch(/abc123\/library_600x900\.jpg$/)
  })

  it('reads shortcuts, skipping launchers and never-played entries', async () => {
    const { user } = await fakeSteam()
    const shortcuts = await playedShortcuts(user)
    expect(shortcuts.map((s) => [s.title, s.platform])).toEqual([
      ['Emby Theater', 'emby'],
      ['The Witcher 3', 'steam']
    ])
    expect(shortcuts[1].art.portrait).toMatch(/444p\.png$/)
  })

  it('recognises streaming shortcuts by name without catching games', async () => {
    const { user } = await fakeSteam()
    await writeFile(
      join(user, 'config', 'shortcuts.vdf'),
      binaryVdf({
        shortcuts: {
          '0': { appid: 1, AppName: 'Max', Exe: '"flatpak"', LastPlayTime: now },
          '1': { appid: 2, AppName: 'Max Payne 3', Exe: '"/games/maxpayne3.exe"', LastPlayTime: now },
          '2': { appid: 3, AppName: 'Paramount+', Exe: '"flatpak"', LastPlayTime: now },
          '3': { appid: 4, AppName: 'Jellyfin', Exe: '"flatpak"', LastPlayTime: now }
        }
      })
    )
    expect((await playedShortcuts(user)).map((s) => [s.title, s.platform])).toEqual([
      ['Max', 'max'],
      ['Max Payne 3', 'steam'],
      ['Paramount+', 'paramount'],
      ['Jellyfin', 'jellyfin']
    ])
  })

  it('keeps the newest plays inside the window', () => {
    const p = (title: string, ago: number): Played => ({ id: title, title, platform: 'steam', lastPlayed: now - ago * DAY, art: {} })
    const picked = pickRecent([p('a', 40), p('b', 1), p('c', 5), p('d', 2)], NOW, 30, 2)
    expect(picked.map((x) => x.title)).toEqual(['b', 'd'])
  })

  it('gives streaming apps their tile as a wide card', () => {
    const item = toRecentItem({ id: 'shortcut:1', title: 'Emby Theater', platform: 'emby', lastPlayed: now, art: {} })
    expect(item.wide).toBe('fixtures/tiles/emby.webp')
    expect(item.cover).toBeUndefined()
  })

  it('merges games and shortcuts newest first', async () => {
    const { root } = await fakeSteam()
    const recents = await loadRecents({ steamRoot: root }, NOW)
    expect(recents.map((r) => r.title)).toEqual(['Dead Island 2', 'Emby Theater', 'The Witcher 3'])
  })
})

describe('launch', () => {
  it('builds the 64-bit id Steam uses for shortcuts', () => {
    // The steamtv shortcut on the box: Steam logged this game id when it launched.
    expect(shortcutGameId(4159378748)).toBe('17864395694370979840')
  })

  it('maps cards and tiles to steam:// links', async () => {
    const { root } = await fakeSteam()
    const config = { steamRoot: root }
    expect(await launchUrl(config, 'recent', 'steam:10')).toBe('steam://rungameid/10')
    expect(await launchUrl(config, 'recent', 'shortcut:111')).toBe(`steam://rungameid/${shortcutGameId(111)}`)
    expect(await launchUrl(config, 'app', 'emby')).toBe(`steam://rungameid/${shortcutGameId(111)}`)
    expect(await launchUrl(config, 'app', 'steam')).toBe('steam://open/games')
    expect(await launchUrl(config, 'app', 'prime')).toBeNull()
    expect(await launchUrl({ ...config, favorites: { prime: 'the witcher 3' } }, 'app', 'prime')).toBe(
      `steam://rungameid/${shortcutGameId(444)}`
    )
  })
})

describe('collections', () => {
  it('lists collections, skipping Hidden and deleted ones, Favorites first', async () => {
    const { user } = await fakeSteam()
    await mkdir(join(user, 'config', 'cloudstorage'), { recursive: true })
    const entry = (id: string, value: object | null) => [
      `user-collections.${id}`,
      value ? { key: `user-collections.${id}`, value: JSON.stringify(value) } : { key: `user-collections.${id}`, is_deleted: true }
    ]
    await writeFile(
      join(user, 'config', 'cloudstorage', 'cloud-storage-namespace-1.json'),
      JSON.stringify([
        entry('uc-b', { id: 'uc-b', name: 'Couch co-op', added: [10, 20, 30], removed: [20] }),
        entry('hidden', { id: 'hidden', name: 'Hidden', added: [1] }),
        entry('uc-gone', null),
        entry('uc-dyn', { id: 'uc-dyn', name: 'Installed locally', added: [], removed: [], filterSpec: { nFormatVersion: 2 } }),
        entry('favorite', { id: 'favorite', name: 'Favorites', added: [10] }),
        ['some-other-key', { value: '{}' }]
      ])
    )
    const collections = await readCollections(user)
    expect(collections.map((c) => [c.name, c.dynamic, c.appids.length])).toEqual([
      ['Favorites', false, 1],
      ['Couch co-op', false, 2],
      ['Installed locally', true, 0]
    ])
    expect(collections[1].appids).toEqual([10, 30])
  })

  it('applies play-state filters and refuses others', async () => {
    const { user } = await fakeSteam()
    await mkdir(join(user, 'config', 'cloudstorage'), { recursive: true })
    // Steam's layout: nine groups; group 1 is play state.
    const spec = (playState: number[], extra: Record<string, unknown> = {}) => ({
      nFormatVersion: 2,
      strSearchText: '',
      filterGroups: Array.from({ length: 9 }, (_, i) => ({ rgOptions: i === 1 ? playState : [], bAcceptUnion: i === 0 })),
      ...extra
    })
    const dynamicEntry = (id: string, filterSpec: object) => [
      `user-collections.${id}`,
      { value: JSON.stringify({ id, name: id, added: [], removed: [], filterSpec }) }
    ]
    const genre = spec([]) as { filterGroups: { rgOptions: number[] }[] }
    genre.filterGroups[2].rgOptions = [7]
    await writeFile(
      join(user, 'config', 'cloudstorage', 'cloud-storage-namespace-1.json'),
      JSON.stringify([
        dynamicEntry('installed', spec([1])),
        dynamicEntry('played', spec([3])),
        dynamicEntry('unplayed', spec([4])),
        dynamicEntry('not-installed', spec([2])),
        dynamicEntry('search', spec([], { strSearchText: 'zelda' })),
        dynamicEntry('genre', genre)
      ])
    )
    const games = [
      { appid: '1', title: 'Played game', lastPlayed: 100 },
      { appid: '2', title: 'New game', lastPlayed: 0 }
    ]
    const byId = Object.fromEntries((await readCollections(user)).map((c) => [c.id, c]))
    const titles = (id: string): string[] => collectionGames(byId[id], games).map((g) => g.title)
    expect(titles('installed')).toEqual(['Played game', 'New game'])
    expect(titles('played')).toEqual(['Played game'])
    expect(titles('unplayed')).toEqual(['New game'])
    expect(['not-installed', 'search', 'genre'].map((id) => isSupported(byId[id]))).toEqual([false, false, false])
  })

  it('builds Steam tab rows from chosen collections, installed games only', async () => {
    const { root, user } = await fakeSteam()
    await mkdir(join(user, 'config', 'cloudstorage'), { recursive: true })
    await writeFile(
      join(user, 'config', 'cloudstorage', 'cloud-storage-namespace-1.json'),
      JSON.stringify([
        ['user-collections.favorite', { value: JSON.stringify({ id: 'favorite', name: 'Favorites', added: [30, 10, 99] }) }],
        ['user-collections.uc-x', { value: JSON.stringify({ id: 'uc-x', name: 'Other', added: [10] }) }]
      ])
    )
    const { layout, rows } = await loadSteamTab({ steamRoot: root })
    expect(layout).toBe('rows')
    expect(rows.map((r) => [r.name, r.items.map((i) => i.title), r.notInstalled])).toEqual([
      // Recently played first (installed games, newest first; Proton is a tool, not a game).
      ['Recently played', ['Dead Island 2', 'Old Game'], 0],
      // Default selection is Favorites; most recently played first; app 99 isn't installed.
      ['Favorites', ['Dead Island 2', 'Old Game'], 1]
    ])
    const { rows: both } = await loadSteamTab({ steamRoot: root, steamCollections: ['favorite', 'uc-x'] })
    expect(both.map((r) => r.name)).toEqual(['Recently played', 'Favorites', 'Other'])
    // With no collections chosen, the tab still shows what was played.
    const { rows: none } = await loadSteamTab({ steamRoot: root, steamCollections: [] })
    expect(none.map((r) => r.name)).toEqual(['Recently played'])
  })
})

describe('switch', () => {
  it('cleans release-folder names', () => {
    expect(cleanTitle('Astral.Chain.NSW-VENOM')).toBe('Astral Chain')
    expect(cleanTitle('Bloodstained_Ritual_of_the_Night_NSW-VENOM')).toBe('Bloodstained Ritual of the Night')
    expect(cleanTitle('Cruisn_Blast.xci')).toBe('Cruisn Blast')
    expect(cleanTitle('Metal_Slug_Tactics_MULTI_NSW-HR')).toBe('Metal Slug Tactics')
    expect(cleanTitle('Bloodstained.Curse.Of.The.Moon.retail-Rakuvfinhel')).toBe('Bloodstained Curse Of The Moon')
  })

  it('finds base games, skipping updates, DLC and folders with nothing playable', async () => {
    const root = await mkdtemp(join(tmpdir(), 'steamtv-switch-'))
    const file = async (path: string): Promise<void> => {
      await mkdir(join(root, path, '..'), { recursive: true })
      await writeFile(join(root, path), '')
    }
    await file('Bayonetta/Bayonetta [010076F0049A2000][v0][BASE].nsp')
    await file('Bayonetta/Bayonetta 1.1 [010076F0049A2800][v65536][UPD].nsp')
    await file('Astral.Chain.NSW-VENOM/Astral.Chain.NSW-VENOM.xci')
    await file('Cuphead/ROM.xci')
    await file('Cuphead DLC/Cuphead DLC [0100A5C00D163001][v0][DLC].nsp')
    await file('Breath.of.the.Wild/exeFS/main')
    await file('Loose Game [0100000000010000][v0][BASE].nsp')
    await file('metadata.txt')

    const games = await scanSwitch(root, { Cuphead: 'Cuphead: The Delicious Last Course' })
    expect(games.map((g) => [g.title, g.titleId ?? null, g.path.slice(root.length + 1)])).toEqual([
      ['Astral Chain', null, 'Astral.Chain.NSW-VENOM/Astral.Chain.NSW-VENOM.xci'],
      ['Bayonetta', '010076F0049A2000', 'Bayonetta/Bayonetta [010076F0049A2000][v0][BASE].nsp'],
      ['Cuphead: The Delicious Last Course', null, 'Cuphead/ROM.xci'],
      ['Loose Game', '0100000000010000', 'Loose Game [0100000000010000][v0][BASE].nsp']
    ])
  })
})

// Builds a PARAM.SFO the way Sony lays it out: header, index, key table, data table.
function sfo(values: Record<string, string>): Buffer {
  const keys = Object.keys(values)
  const keyTable = Buffer.concat(keys.map((k) => Buffer.from(`${k}\0`)))
  const data = keys.map((k) => Buffer.from(`${values[k]}\0`))
  const index = Buffer.alloc(16 * keys.length)
  let keyOffset = 0
  let dataOffset = 0
  keys.forEach((k, i) => {
    index.writeUInt16LE(keyOffset, i * 16)
    index.writeUInt16LE(0x0204, i * 16 + 2)
    index.writeUInt32LE(data[i].length, i * 16 + 4)
    index.writeUInt32LE(data[i].length, i * 16 + 8)
    index.writeUInt32LE(dataOffset, i * 16 + 12)
    keyOffset += k.length + 1
    dataOffset += data[i].length
  })
  const header = Buffer.alloc(20)
  header.writeUInt32BE(0x00505346, 0)
  header.writeUInt32LE(0x0101, 4)
  header.writeUInt32LE(20 + index.length, 8)
  header.writeUInt32LE(20 + index.length + keyTable.length, 12)
  header.writeUInt32LE(keys.length, 16)
  return Buffer.concat([header, index, keyTable, ...data])
}

describe('ps3', () => {
  it('reads PARAM.SFO', () => {
    expect(parseSfo(sfo({ CATEGORY: 'HG', TITLE: 'Journey', TITLE_ID: 'NPUA80542' }))).toEqual({
      CATEGORY: 'HG',
      TITLE: 'Journey',
      TITLE_ID: 'NPUA80542'
    })
    expect(parseSfo(Buffer.from('not an sfo'))).toEqual({})
  })

  it('cleans store titles', () => {
    expect(cleanPs3Title('Dead Space™ 3\nHDD')).toBe('Dead Space 3 HDD')
    expect(cleanPs3Title('Call Of Duty® 4: Modern Warfare')).toBe('Call Of Duty 4: Modern Warfare')
  })

  it('finds installed games and disc folders, skipping patches', async () => {
    const root = await mkdtemp(join(tmpdir(), 'steamtv-ps3-'))
    const put = async (path: string, values: Record<string, string>): Promise<void> => {
      await mkdir(join(root, path, '..'), { recursive: true })
      await writeFile(join(root, path), sfo(values))
    }
    await put('hdd0/game/NPUA80542/PARAM.SFO', { CATEGORY: 'HG', TITLE: 'Journey', TITLE_ID: 'NPUA80542' })
    await put('hdd0/game/BCUS98111/PARAM.SFO', { CATEGORY: 'GD', TITLE: 'God of War III', TITLE_ID: 'BCUS98111' })
    await put('discs/God of War III (USA)/PS3_GAME/PARAM.SFO', { CATEGORY: 'DG', TITLE: 'God of War® III', TITLE_ID: 'BCUS98111' })
    await put('discs/Skate 3 (USA)/Skate 3 (USA)/PS3_GAME/PARAM.SFO', { CATEGORY: 'DG', TITLE: 'Skate 3', TITLE_ID: 'BLUS30464' })
    await mkdir(join(root, 'discs', 'Not a game'), { recursive: true })

    const games = await scanPs3(join(root, 'hdd0'), join(root, 'discs'), { NPUA80542: 'Journey (PSN)' })
    expect(games.map((g) => [g.title, g.titleId, g.kind, g.path.slice(root.length + 1)])).toEqual([
      ['God of War III', 'BCUS98111', 'disc', 'discs/God of War III (USA)'],
      ['Journey (PSN)', 'NPUA80542', 'hdd', 'hdd0/game/NPUA80542'],
      ['Skate 3', 'BLUS30464', 'disc', 'discs/Skate 3 (USA)/Skate 3 (USA)']
    ])
    // Both kinds boot by their EBOOT.BIN.
    expect(games.map((g) => rpcs3Args(g)[2].slice(root.length + 1))).toEqual([
      'discs/God of War III (USA)/PS3_GAME/USRDIR/EBOOT.BIN',
      'hdd0/game/NPUA80542/USRDIR/EBOOT.BIN',
      'discs/Skate 3 (USA)/Skate 3 (USA)/PS3_GAME/USRDIR/EBOOT.BIN'
    ])
  })
})

describe('xbox360', () => {
  it('takes the title from No-Intro names', () => {
    expect(cleanXbox360Title('BioShock 2 (USA, Europe) (En,Fr,Es).iso')).toBe('BioShock 2')
    expect(cleanXbox360Title('Dark Souls (USA) (En,Fr,Es) (Rev 1).iso')).toBe('Dark Souls')
  })

  it('compares SteamGridDB names loosely', () => {
    expect(normalizeName('Halo - Reach')).toBe(normalizeName('Halo: Reach'))
    expect(normalizeName('SOULCALIBUR Ⅴ')).toBe(normalizeName('SoulCalibur V'))
    expect(normalizeName('Command & Conquer 3')).toBe(normalizeName('Command and Conquer 3'))
    expect(normalizeName('SOULCALIBUR Ⅴ')).not.toBe(normalizeName('SoulCalibur'))
  })

  it('lists each game once, from the disc that boots', async () => {
    const root = await mkdtemp(join(tmpdir(), 'steamtv-x360-'))
    const files = [
      'BioShock (World) (En,Fr,De,Es,It).iso',
      'Halo 4 (World) (Disc 1).iso',
      'Halo 4 (World) (Disc 2).iso',
      'Grand Theft Auto V (World) (Disc 2) (Play).iso',
      'Borderlands 2 - Add-On Content Pack (USA).iso',
      'Watch_Dogs.m3u/Watch_Dogs (USA) (Disc 1) (Installation Disc).iso',
      'Watch_Dogs.m3u/Watch_Dogs (USA) (Disc 2) (Game Disc).iso',
      'Watch_Dogs.m3u/Watch_Dogs.m3u',
      'readme.txt'
    ]
    for (const f of files) {
      await mkdir(join(root, f, '..'), { recursive: true })
      await writeFile(join(root, f), '')
    }
    const games = await scanXbox360(root, { 'BioShock (World) (En,Fr,De,Es,It).iso': 'BioShock (Xbox)' })
    expect(games.map((g) => [g.title, g.path.slice(root.length + 1)])).toEqual([
      ['BioShock (Xbox)', 'BioShock (World) (En,Fr,De,Es,It).iso'],
      ['Grand Theft Auto V', 'Grand Theft Auto V (World) (Disc 2) (Play).iso'],
      ['Halo 4', 'Halo 4 (World) (Disc 1).iso'],
      ['Watch_Dogs', 'Watch_Dogs.m3u/Watch_Dogs (USA) (Disc 2) (Game Disc).iso']
    ])
  })
})

describe('gamecube', () => {
  it('opens multi-disc games by their .m3u list and skips preview discs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'steamtv-gc-'))
    const files = [
      'Eternal Darkness - Sanity\'s Requiem (USA).rvz',
      'Resident Evil 4 (USA).m3u/Resident Evil 4 (USA) (Disc 1).rvz',
      'Resident Evil 4 (USA).m3u/Resident Evil 4 (USA) (Disc 2).rvz',
      'Resident Evil 4 (USA).m3u/Resident Evil 4 (USA).m3u',
      'Star Wars - Rogue Squadron III - Rebel Strike (USA) (Limited Edition Preview Disc).rvz',
      'media/covers/whatever.png'
    ]
    for (const f of files) {
      await mkdir(join(root, f, '..'), { recursive: true })
      await writeFile(join(root, f), '')
    }
    const games = await scanGameCube(root)
    expect(games.map((g) => [g.id, g.title])).toEqual([
      ['gamecube:Eternal Darkness - Sanity\'s Requiem (USA).rvz', "Eternal Darkness - Sanity's Requiem"],
      ['gamecube:Resident Evil 4 (USA).m3u/Resident Evil 4 (USA).m3u', 'Resident Evil 4']
    ])
  })
})

describe('dreamcast', () => {
  it('groups discs two levels down, drops duplicate formats and writes disc lists', async () => {
    const root = await mkdtemp(join(tmpdir(), 'steamtv-dc-'))
    const files = [
      'AeroWings (USA)/AeroWings (USA).cue',
      'AeroWings (USA)/AeroWings (USA) (Track 1).bin',
      'Death Crimson OX (USA)/Death Crimson OX (USA).cue',
      'Death Crimson OX (USA).chd',
      'Resident Evil 2/Resident Evil 2 (USA) (Disc 1)/Resident Evil 2 (USA) (Disc 1).cue',
      'Resident Evil 2/Resident Evil 2 (USA) (Disc 2)/Resident Evil 2 (USA) (Disc 2).cue',
      'Sega Bass Fishing v1.000 (1999)(Sega)(US)[!].gdi',
      'House of the Dead 2, The (USA).cue',
      'Cool Herders (USA) (Unl)/Cool Herders (USA) (Unl) (Track 01).bin'
    ]
    for (const f of files) {
      await mkdir(join(root, f, '..'), { recursive: true })
      await writeFile(join(root, f), '')
    }
    const games = await scanDreamcast(root)
    expect(games.map((g) => [g.title, g.discs.length, g.path.slice(root.length + 1)])).toEqual([
      ['AeroWings', 1, 'AeroWings (USA)/AeroWings (USA).cue'],
      ['Death Crimson OX', 1, 'Death Crimson OX (USA).chd'],
      ['Resident Evil 2', 2, 'Resident Evil 2/Resident Evil 2 (USA) (Disc 1)/Resident Evil 2 (USA) (Disc 1).cue'],
      ['Sega Bass Fishing', 1, 'Sega Bass Fishing v1.000 (1999)(Sega)(US)[!].gdi'],
      ['The House of the Dead 2', 1, 'House of the Dead 2, The (USA).cue']
    ])
    // Single disc: the file itself. Multi-disc: a .m3u with one disc per line.
    expect(await dreamcastContent(games[0])).toBe(games[0].path)
    const list = await dreamcastContent(games[2])
    expect(list.endsWith('Resident Evil 2.m3u')).toBe(true)
    expect((await readFile(list, 'utf8')).trim().split('\n')).toEqual(games[2].discs)
  })
})

// Against the copy of the real box made by `npm run snapshot` (skipped without one).
const snapshot = join(__dirname, '../../../fixtures/box/Steam')
describe.skipIf(!existsSync(snapshot))('box snapshot', () => {
  it('produces recents with art for most games', async () => {
    const recents = await loadRecents({ steamRoot: snapshot, recentDays: 3650, recentLimit: 50 })
    expect(recents.length).toBeGreaterThan(5)
    expect(recents.some((r) => /steamtv|EmulationStation/i.test(r.title))).toBe(false)
    const games = recents.filter((r) => r.platform === 'steam')
    expect(games.filter((r) => r.cover).length / games.length).toBeGreaterThan(0.7)
  })
})

describe('EmuDeck', () => {
  it('reads paths from its settings, quotes and $HOME included', () => {
    const paths = parseEmuDeckSettings(
      [
        'emulationPath="/run/media/deck/SATA"/Emulation',
        'romsPath="/run/media/deck/SATA"/Emulation/roms',
        'toolsPath="$HOME/Emulation/tools"',
        'doRetroArch=true'
      ].join('\n')
    )
    expect(paths.romsPath).toBe('/run/media/deck/SATA/Emulation/roms')
    expect(paths.toolsPath).toMatch(/\/Emulation\/tools$/)
    expect(paths.toolsPath).not.toContain('$HOME')
  })

  it("derives Xenia's prefix id the way EmuDeck does", () => {
    const exe = '"/usr/bin/env bash" "/run/media/deck/SATA/Emulation/tools/launchers/xenia.sh"'
    // The prefix EmuDeck created on a real box for this layout.
    expect(shortcutAppId(exe, 'Xenia')).toBe(2832997896)
  })
})

describe('installer', () => {
  it("updates an existing vaporTV shortcut in place, keeping its id", async () => {
    const { upsertShortcut } = await import('../installer')
    const real = 'fixtures/box/Steam/userdata/19236920/config/shortcuts.vdf'
    if (!existsSync(real)) return
    const vdf = parseBinaryVdf(await readFile(real))
    const before = Object.keys(childObject(vdf, 'shortcuts') ?? {}).length
    const { appid, updated } = upsertShortcut(vdf, '/home/deck/Applications/steamtv.AppImage')
    expect(updated).toBe(true)
    expect(appid).toBe(4159378748)
    expect(Object.keys(childObject(vdf, 'shortcuts') ?? {}).length).toBe(before)
    // Still writes back as valid binary VDF.
    expect(parseBinaryVdf(dumpBinaryVdf(vdf))).toEqual(vdf)
  })

  it('adds a new shortcut with the id Steam would give it', async () => {
    const { upsertShortcut } = await import('../installer')
    const vdf: VdfObject = { shortcuts: {} }
    const { appid, updated } = upsertShortcut(vdf, '/home/deck/Applications/vaporTV.AppImage')
    expect(updated).toBe(false)
    expect(appid).toBe(shortcutAppId('"/home/deck/Applications/vaporTV.AppImage"', 'vaporTV'))
    const entry = childObject(vdf, 'shortcuts', '0')
    expect(childString(entry, 'AppName')).toBe('vaporTV')
    expect(childString(entry, 'LaunchOptions')).toBe('LD_PRELOAD= %command%')
    expect(childString(entry, 'Exe')).toBe('"/home/deck/Applications/vaporTV.AppImage"')
  })
})

describe('wpctl volume', () => {
  it('reads the level and mute state', () => {
    expect(parseWpctlVolume('Volume: 0.45\n')).toEqual({ level: 45, muted: false })
    expect(parseWpctlVolume('Volume: 1.00 [MUTED]\n')).toEqual({ level: 100, muted: true })
    expect(parseWpctlVolume('nothing')).toBeNull()
  })
})

describe('controls', () => {
  it('swaps a button another action had', () => {
    const next = assignButton(DEFAULT_CONTROLS, 'select', 1)
    expect(next.select).toBe(1)
    expect(next.back).toBe(0)
  })
  it('takes a free button without touching the others', () => {
    const next = assignButton(DEFAULT_CONTROLS, 'favorite', 10)
    expect(next).toEqual({ ...DEFAULT_CONTROLS, favorite: 10 })
  })
  it('fills saved choices over the defaults and drops unusable ones', () => {
    expect(resolveControls({ back: 8, select: 16 } as never)).toEqual({ ...DEFAULT_CONTROLS, back: 8 })
    expect(resolveControls(undefined)).toEqual(DEFAULT_CONTROLS)
  })
})

describe('arcade', () => {
  it('shortens MAME names to the game', () => {
    expect(arcadeTitle('Street Fighter II: The World Warrior (World 910522)')).toBe('Street Fighter II: The World Warrior')
    expect(arcadeTitle('Metal Slug - Super Vehicle-001')).toBe('Metal Slug - Super Vehicle-001')
    expect(arcadeTitle('Samurai Shodown II / Shin Samurai Spirits - Haohmaru Jigokuhen')).toBe('Samurai Shodown II')
  })

  it('finds sets across the boards, names them and leaves BIOS out', async () => {
    const root = await mkdtemp(join(tmpdir(), 'steamtv-arcade-'))
    const files: Record<string, string[]> = {
      naomi: ['cvs2.zip', 'naomi.zip'],
      cps: ['sf2ua.zip', 'dino.nv'],
      cps2: ['sfa3.zip'],
      neogeo: ['mslug.zip', 'neogeo.zip'],
      arcade: ['victlapw.zip', 'cpzn1.zip', 'mystery1.zip', '720.zip']
    }
    for (const [dir, names] of Object.entries(files)) {
      await mkdir(join(root, dir), { recursive: true })
      for (const name of names) await writeFile(join(root, dir, name), '')
    }
    await mkdir(join(root, 'naomi', 'cvs2'))
    await writeFile(join(root, 'naomi', 'cvs2', 'gdl-0008.chd'), '')
    process.env.STEAMTV_ARCADE_ROMS = root
    try {
      const games = await arcadeGames({ arcadeTitles: { mystery1: 'Mystery Game' } } as Config)
      const byId = Object.fromEntries(games.map((g) => [g.id, g]))
      expect(Object.keys(byId).sort()).toEqual([
        'arcade:arcade/720',
        'arcade:arcade/mystery1',
        'arcade:arcade/victlapw',
        'arcade:cps/sf2ua',
        'arcade:cps2/sfa3',
        'arcade:naomi/cvs2',
        'arcade:neogeo/mslug'
      ])
      expect(byId['arcade:naomi/cvs2']).toMatchObject({ system: 'naomi', core: 'flycast', title: 'Capcom Vs. SNK 2: Mark Of The Millennium 2001' })
      // A clone searches for (and shares) its parent's art.
      expect(byId['arcade:cps/sf2ua']).toMatchObject({ system: 'cps', core: 'fbneo', artTitle: 'Street Fighter II: The World Warrior' })
      expect(byId['arcade:arcade/victlapw'].title).toBe('Ace Driver: Victory Lap')
      expect(byId['arcade:arcade/mystery1'].title).toBe('Mystery Game')
      expect(byId['arcade:arcade/720']).toMatchObject({ system: 'arcade', core: 'mame' })

      // A core chosen for one game is the one it opens in; the board's stays its default.
      const chosen = await arcadeGames({ arcadeGameCores: { 'arcade:arcade/720': 'mame2003_plus' } } as Config)
      expect(chosen.find((g) => g.id === 'arcade:arcade/720')).toMatchObject({ core: 'mame2003_plus', defaultCore: 'mame' })
      expect(chosen.find((g) => g.id === 'arcade:cps2/sfa3')).toMatchObject({ core: 'fbneo', defaultCore: 'fbneo' })

      // Carousels turned off are left out of the tab.
      const tab = await loadArcadeTab({ arcadeRowsHidden: ['neogeo', 'cps'] } as Config)
      expect(tab.rows.map((row) => row.id)).toEqual(['naomi', 'arcade'])
    } finally {
      delete process.env.STEAMTV_ARCADE_ROMS
    }
  })
})

describe('libretro thumbnails', () => {
  it('names files the way the thumbnail server does', () => {
    expect(thumbnailName('Street Fighter II: The World Warrior (World 910522)')).toBe('Street Fighter II_ The World Warrior (World 910522)')
    expect(thumbnailName('Cannon Spike / Gun Spike')).toBe('Cannon Spike _ Gun Spike')
  })

  it("takes a disc game's dump name from its first disc", () => {
    const disc = (path: string, discs = [path]) => ({ id: 'x', title: 'x', path, discs })
    expect(dumpName(disc('/r/gc/Metroid Prime 2 - Echoes (USA).rvz'))).toBe('Metroid Prime 2 - Echoes (USA)')
    expect(dumpName(disc('/l/sh.m3u', ['/r/dc/Shenmue (USA) (Disc 1).chd', '/r/dc/Shenmue (USA) (Disc 2).chd']))).toBe('Shenmue (USA)')
  })

  it('finds a cover by exact name, else by title preferring USA', async () => {
    process.env.STEAMTV_THUMBNAIL_CACHE = await mkdtemp(join(tmpdir(), 'steamtv-thumbs-'))
    const listing = ['Ikaruga (Europe)', 'Ikaruga (USA)', 'Ikaruga (Japan)', 'F-Zero GX (Japan)', 'Super Smash Bros. Melee (USA) (Rev 2)']
    vi.stubGlobal('fetch', async () => new Response(listing.map((n) => `<a href="${encodeURIComponent(n)}.png">x</a>`).join('')))
    try {
      const game = (title: string, thumbnailNames?: string[]) => ({ id: 'gamecube:x', title, platform: 'gamecube', artKey: 'k', thumbnailNames })
      expect((await libretroCover(game('Smash', ['Super Smash Bros. Melee (USA) (Rev 2)'])))?.name).toBe('Super Smash Bros. Melee (USA) (Rev 2)')
      expect((await libretroCover(game('Ikaruga', ['Ikaruga (Brazil)'])))?.name).toBe('Ikaruga (USA)')
      expect((await libretroCover(game('F-Zero GX')))?.url).toBe('https://thumbnails.libretro.com/Nintendo%20-%20GameCube/Named_Boxarts/F-Zero%20GX%20(Japan).png')
      expect(await libretroCover(game('Metroid Prime'))).toBeNull()
      expect((await libretroCovers(game('Ikaruga'))).map((t) => t.name)).toEqual(['Ikaruga (Europe)', 'Ikaruga (USA)', 'Ikaruga (Japan)'])
    } finally {
      vi.unstubAllGlobals()
      delete process.env.STEAMTV_THUMBNAIL_CACHE
    }
  })
})

describe('custom apps', () => {
  it('reads your own tiles, kept to the tiles folder, and finds them by shortcut name', () => {
    const config = {
      customApps: [
        { id: 'jme', name: 'Jme', shortcut: 'JME', tile: '../../etc/jme.webp' },
        { id: 'doki', name: 'Doki' },
        { id: '', name: 'nameless' }
      ]
    } as Config
    const apps = customApps(config)
    expect(apps.map((a) => a.id)).toEqual(['jme', 'doki'])
    expect(decodeURIComponent(apps[0].tile!)).toContain(join('.config', 'steamtv', 'tiles', 'jme.webp'))
    expect(apps[1].shortcuts).toEqual(['Doki'])
    expect(customAppFor(config, 'jme')?.id).toBe('jme')
    expect(customAppFor(config, 'Netflix')).toBeUndefined()
  })
})

describe('app setup', () => {
  it('says how each kind of app gets set up', () => {
    expect(appState('netflix', true)).toEqual({ ready: true })
    expect(appState('netflix', false)).toEqual({ ready: false, setup: 'web' })
    expect(appState('esde', false)).toEqual({ ready: false, setup: 'emudeck' })
    expect(appState('someone-elses', false)).toEqual({ ready: false, setup: 'shortcut' })
    expect(webShortcuts(['netflix', 'youtube'])).toEqual([
      {
        name: 'Netflix',
        exe: '"flatpak"',
        startDir: './',
        launchOptions: '"run" "com.google.Chrome" "--kiosk" "--start-fullscreen" "--no-first-run" "--noerrdialogs" "https://www.netflix.com/browse"'
      }
    ])
    // On a 4K TV the sites are drawn at 2x, so their text is readable from the couch.
    expect(webShortcuts(['netflix'], 2)[0].launchOptions).toContain('"--force-device-scale-factor=2" "https://www.netflix.com/browse"')
  })

  it("adds and updates shortcuts in Steam's real file without disturbing the rest", async () => {
    const source = 'fixtures/box/Steam/userdata/19236920/config/shortcuts.vdf'
    const dir = await mkdtemp(join(tmpdir(), 'steamtv-shortcuts-'))
    const vdf = join(dir, 'shortcuts.vdf')
    await writeFile(vdf, await readFile(source))
    const before = childObject(parseBinaryVdf(await readFile(vdf)), 'shortcuts')!
    const entries = [...webShortcuts(['netflix']), { name: 'Crunchyroll', exe: '"flatpak"', startDir: './', launchOptions: '"run" "x"' }]
    await writeFile(join(dir, 'entries.json'), JSON.stringify(entries))
    const out = execFileSync('python3', ['session/add-app-shortcuts.py', vdf, join(dir, 'entries.json')]).toString()
    expect(out).toContain('updated Netflix')
    expect(out).toContain('added Crunchyroll')

    const after = childObject(parseBinaryVdf(await readFile(vdf)), 'shortcuts')!
    const byName = (s: VdfObject, name: string) =>
      Object.values(s).find((e) => typeof e === 'object' && Object.entries(e).some(([k, v]) => k.toLowerCase() === 'appname' && v === name)) as VdfObject
    expect(Object.keys(after)).toHaveLength(Object.keys(before).length + 1)
    expect(byName(after, 'Netflix').appid).toBe(byName(before, 'Netflix').appid)
    expect(byName(after, 'Crunchyroll').appid).toBe(shortcutAppId('"flatpak"', 'Crunchyroll'))
    // Everything else is as it was.
    for (const [key, entry] of Object.entries(before)) {
      if (byName(before, 'Netflix') !== entry) expect(after[key]).toEqual(entry)
    }
    expect(existsSync(`${vdf}.vaportv-backup`)).toBe(true)
  })
})

describe('weather location', () => {
  it('turns place search results into names with their country', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json({
        results: [
          { name: 'Portland', admin1: 'Oregon', country: 'United States', country_code: 'US', latitude: 45.5, longitude: -122.7 },
          { name: 'Berlin', country: 'Germany', country_code: 'DE', latitude: 52.5, longitude: 13.4 }
        ]
      })
    )
    try {
      expect(await searchPlaces('x')).toEqual([
        { name: 'Portland, Oregon, United States', latitude: 45.5, longitude: -122.7, country: 'US' },
        { name: 'Berlin, Germany', latitude: 52.5, longitude: 13.4, country: 'DE' }
      ])
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('controller switched off', () => {
  const flydigi = { id: 'Flydigi VADER3 (STANDARD GAMEPAD Vendor: 045e Product: 028e)', index: 0, connected: true }
  const steamPad = { id: 'Microsoft X-Box 360 pad 0 (STANDARD GAMEPAD Vendor: 28de Product: 11ff)', index: 1, connected: true }

  it("ignores Steam's virtual controller coming and going as a real one connects", () => {
    // What happened on the box: the Flydigi connected and Steam's pad blinked out.
    expect(isSwitchOff(steamPad, [flydigi], 2)).toBe(false)
    expect(isSwitchOff(steamPad, [flydigi], 60_000)).toBe(false)
  })

  it('ignores disconnects just after a controller connected', () => {
    expect(isSwitchOff(flydigi, [steamPad], 1500)).toBe(false)
  })

  it('counts the last real controller going away', () => {
    expect(isSwitchOff(flydigi, [steamPad], 60_000)).toBe(true)
    expect(isSwitchOff(flydigi, [], 60_000)).toBe(true)
  })

  it('not while another real controller is still on', () => {
    const second = { id: 'Xbox Wireless Controller (Vendor: 045e Product: 0b13)', index: 2, connected: true }
    expect(isSwitchOff(flydigi, [steamPad, second], 60_000)).toBe(false)
  })
})
