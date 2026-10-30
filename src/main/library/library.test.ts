import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
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
import { connectedFamily, controllerFamily, isSwitchOff } from '../../shared/controllers'
import { buttonName } from '../../shared/controls'
import { parseSleepBlocker } from '../power'
import { exifDate } from '../screensaver'
import { deviceKind, parseDevices } from '../bluetooth'
import { parseNetworks, terseFields } from '../wifi'
import { hasKey, remoteKeyboards } from '../remoteKeys'
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
					"10"	{ "LastPlayed"	"${now - DAY}"	"Playtime"	"754" }
					"20"	{ "LastPlayed"	"${now - DAY}" }
					"30"	{ "LastPlayed"	"${now - 90 * DAY}" }
					"40"	{ "LastPlayed"	"${now - DAY}" }
					"-294967296"	{ "Playtime"	"95" }
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
        '4': { appid: 555, AppName: 'Never Played', Exe: '"/x"', LastPlayTime: 0 },
        // Steam files a shortcut's play time under its id as a signed 32-bit number.
        '5': { appid: 4000000000, AppName: 'Hades', Exe: '"/games/hades"', LastPlayTime: now - 4 * DAY }
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
    expect(games.map((g) => [g.title, g.playtime])).toContainEqual(['Dead Island 2', 754])
    expect(games.find((g) => g.title === 'Old Game')?.playtime).toBe(0)
  })

  it('reads shortcuts, skipping launchers and never-played entries', async () => {
    const { user } = await fakeSteam()
    const shortcuts = await playedShortcuts(user)
    expect(shortcuts.map((s) => [s.title, s.platform])).toEqual([
      ['Emby Theater', 'emby'],
      ['The Witcher 3', 'steam'],
      ['Hades', 'steam']
    ])
    expect(shortcuts[1].art.portrait).toMatch(/444p\.png$/)
    expect(shortcuts.map((s) => s.playtime)).toEqual([0, 0, 95])
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
    const tiles = { emby: 'steamtv-art://emby-wide.png' }
    const item = toRecentItem({ id: 'shortcut:1', title: 'Emby Theater', platform: 'emby', lastPlayed: now, art: {} }, tiles)
    expect(item.wide).toBe('steamtv-art://emby-wide.png')
    expect(item.cover).toBeUndefined()
  })

  it('leaves an app without art to its name (no bundled logos)', () => {
    const item = toRecentItem({ id: 'shortcut:1', title: 'Emby Theater', platform: 'emby', lastPlayed: now, art: {} })
    expect(item.wide).toBeUndefined()
    expect(item.cover).toBeUndefined()
  })

  it('merges games and shortcuts newest first', async () => {
    const { root } = await fakeSteam()
    const recents = await loadRecents({ steamRoot: root }, NOW)
    expect(recents.map((r) => r.title)).toEqual(['Dead Island 2', 'Emby Theater', 'The Witcher 3', 'Hades'])
    // Play time shows where Steam has counted some.
    expect(recents.map((r) => r.playtime)).toEqual([754, undefined, undefined, 95])
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
      { appid: '1', title: 'Played game', lastPlayed: 100, playtime: 5 },
      { appid: '2', title: 'New game', lastPlayed: 0, playtime: 0 }
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
    // The button guide's default (Select) went to Back, so it takes the free B.
    expect(resolveControls({ back: 8, select: 16 } as never)).toEqual({ ...DEFAULT_CONTROLS, back: 8, controlsGuide: 1 })
    expect(resolveControls(undefined)).toEqual(DEFAULT_CONTROLS)
  })
  it('gives buttons saved before voice search its R3', () => {
    const { voiceSearch: _, ...before } = DEFAULT_CONTROLS
    expect(resolveControls(before as never).voiceSearch).toBe(11)
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

describe('sleep blocks', () => {
  // systemd-inhibit --list --no-legend, as on the box during the photos copy.
  const list = [
    'NetworkManager 0    root 1583  NetworkManager  sleep      NetworkManager needs to turn off networks   delay',
    'Realtime Kit   0    root 1781  rtkit-daemon    sleep      Demote realtime scheduling and stop canary. delay',
    'Photos copy    1000 deck 22225 systemd-inhibit sleep:idle Copying the Google Photos export to NZB     block',
    'cecd           1000 deck 1861  cecd            sleep      Put TV to sleep                             delay'
  ].join('\n')

  it('finds a block on sleep, with its reason', () => {
    expect(parseSleepBlocker(list)).toBe('Copying the Google Photos export to NZB')
  })

  it("ignores delay locks and blocks on other things", () => {
    expect(parseSleepBlocker(list.split('\n').filter((l) => !l.startsWith('Photos')).join('\n'))).toBeNull()
    expect(parseSleepBlocker('Shutdown guard   1000 deck 5 x   shutdown   Saving   block')).toBeNull()
  })
})

describe('exifDate', () => {
  const exif = (...dates: string[]): Buffer => Buffer.from(`\xff\xd8\xff\xe1Exif\0\0MM${dates.join('\0junk\0')}\0`, 'latin1')

  it('takes the earliest date: when it was taken, not when it was last edited', () => {
    expect(exifDate(exif('2024:01:05 09:00:00', '2019:07:04 18:30:12', '2019:07:04 18:30:12'))).toBe('2019-07-04T18:30:12')
  })

  it('skips the blank dates cameras leave', () => {
    expect(exifDate(exif('0000:00:00 00:00:00', '2021:12:25 08:15:00'))).toBe('2021-12-25T08:15:00')
  })

  it('is null without any', () => {
    expect(exifDate(Buffer.from('no metadata here'))).toBeNull()
  })
})

describe('bluetooth', () => {
  it("reads bluetoothctl's device list", () => {
    const list = 'Device 12:34:56:78:9A:BC Sofabaton X2\nDevice AA:BB:CC:DD:EE:FF 12-34-56-78-9A-BC\nsome other line\n'
    expect(parseDevices(list)).toEqual([
      { address: '12:34:56:78:9A:BC', name: 'Sofabaton X2' },
      { address: 'AA:BB:CC:DD:EE:FF', name: '12-34-56-78-9A-BC' }
    ])
  })

  it('tells what a device is from its icon', () => {
    expect(deviceKind('input-keyboard')).toBe('keyboard')
    expect(deviceKind('audio-headset')).toBe('audio')
    expect(deviceKind('input-gaming')).toBe('controller')
    expect(deviceKind(undefined)).toBe('other')
  })
})

describe('wifi', () => {
  it("splits nmcli's terse lines, keeping escaped colons", () => {
    expect(terseFields('*:Cafe\\: Guest:70:WPA2')).toEqual(['*', 'Cafe: Guest', '70', 'WPA2'])
    expect(terseFields(' :back\\\\slash:5:--')).toEqual([' ', 'back\\slash', '5', '--'])
  })

  it('lists each network once, the one in use first, then saved, then by signal', () => {
    const list = [' :Neighbour:80:WPA2', '*:Home:60:WPA2', ' :Home:90:WPA2', ' ::70:WPA2', ' :Cafe:40:--', ' :Office:30:WPA2'].join('\n')
    const networks = parseNetworks(list, new Set(['Office']))
    expect(networks.map((n) => n.ssid)).toEqual(['Home', 'Office', 'Neighbour', 'Cafe'])
    expect(networks[0]).toEqual({ ssid: 'Home', signal: 60, secure: true, saved: false, connected: true })
    expect(networks.find((n) => n.ssid === 'Cafe')?.secure).toBe(false)
  })
})

describe('remote power', () => {
  // From a box: its own power button, a USB TV remote's system keys, a Sofabaton hub.
  const devices = [
    'I: Bus=0019 Vendor=0000 Product=0001 Version=0000\nN: Name="Power Button"\nH: Handlers=kbd event0 \nB: KEY=8000 10000000000000 0',
    'I: Bus=0003 Vendor=25a7 Product=0122 Version=0101\nN: Name="ZYSD.Ltd HCY RC System Control"\nH: Handlers=kbd event5 \nB: KEY=4000 10000000000000 0',
    'I: Bus=0005 Vendor=2717 Product=32b8 Version=0001\nN: Name="ble-Sofabaton FA80 Keyboard"\nH: Handlers=sysrq kbd event21 \nB: KEY=3f00033fff 0 0 483ffff17aff32d bfd4444600000000 1 130ff38b17d007 ffff7bfad9415fff ffbeffdfffefffff fffffffffffffffe',
    'I: Bus=0003 Vendor=045e Product=028e Version=0114\nN: Name="Microsoft X-Box 360 pad"\nH: Handlers=event7 js0 \nB: KEY=7cdb000000000000 0 0 0 0'
  ].join('\n\n')

  it('reads key capabilities', () => {
    expect(hasKey('8000 10000000000000 0', 116)).toBe(true)
    expect(hasKey('7cdb000000000000 0 0 0 0', 116)).toBe(false)
  })

  it("watches keyboards with a Power key, not the box's own button or controllers; remotes' Home counts", () => {
    expect(remoteKeyboards(devices)).toEqual([
      // The USB remote's System Control part: Power, but no Home on it.
      { path: '/dev/input/event5', remote: false },
      { path: '/dev/input/event21', remote: true }
    ])
  })

  it("leaves an ordinary keyboard's Home alone", () => {
    const keyboard = 'I: Bus=0003 Vendor=046d Product=c31c Version=0110\nN: Name="Logitech USB Keyboard"\nH: Handlers=sysrq kbd event9 \nB: KEY=10004000000000 0'
    expect(hasKey('10004000000000 0', 102)).toBe(true)
    expect(hasKey('10004000000000 0', 116)).toBe(true)
    expect(remoteKeyboards(keyboard)).toEqual([{ path: '/dev/input/event9', remote: false }])
  })
})

describe('controller family', () => {
  it("tells a controller's maker from its id", () => {
    expect(controllerFamily('Microsoft X-Box 360 pad (STANDARD GAMEPAD Vendor: 045e Product: 028e)')).toBe('xbox')
    expect(controllerFamily('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)')).toBe('ps5')
    expect(controllerFamily('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)')).toBe('ps4')
    expect(controllerFamily('Sony PLAYSTATION(R)3 Controller (Vendor: 054c Product: 0268)')).toBe('ps3')
    expect(controllerFamily('Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)')).toBe('switch')
  })

  it("goes by the real controller, not Steam's stand-in for it", () => {
    const steam = { id: 'Microsoft X-Box 360 pad 0 (STANDARD GAMEPAD Vendor: 28de Product: 11ff)', connected: true }
    const dualsense = { id: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', connected: true }
    expect(connectedFamily([steam, dualsense])).toBe('ps5')
    expect(connectedFamily([steam])).toBe('xbox')
  })

  it("names buttons as each maker does", () => {
    expect(buttonName(0)).toBe('A')
    expect(buttonName(0, 'ps5')).toBe('Cross')
    expect(buttonName(8, 'ps4')).toBe('Share')
    expect(buttonName(0, 'switch')).toBe('B')
  })
})

describe('updater', () => {
  it('compares release versions', async () => {
    const { newer } = await import('../updater')
    expect(newer('v1.0.0', '0.9.9')).toBe(true)
    expect(newer('0.10.0', '0.9.0')).toBe(true)
    expect(newer('1.0', '1.0.0')).toBe(false)
    expect(newer('v1.0.1', 'v1.0.1')).toBe(false)
    expect(newer('0.2.0', '1.0.0')).toBe(false)
    expect(newer('v1.1.0-beta', '1.0.0')).toBe(false)
  })

  it('installs only what the key signed', async () => {
    const { signedBy } = await import('../updater')
    const { createHash, generateKeyPairSync, sign } = await import('node:crypto')
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const digest = createHash('sha256').update('vaporTV').digest()
    const signature = sign(null, digest, privateKey).toString('base64') + '\n'
    expect(signedBy(digest, signature, publicKey)).toBe(true)
    expect(signedBy(createHash('sha256').update('something else').digest(), signature, publicKey)).toBe(false)
    expect(signedBy(digest, sign(null, digest, generateKeyPairSync('ed25519').privateKey).toString('base64'), publicKey)).toBe(false)
    expect(signedBy(digest, 'not a signature', publicKey)).toBe(false)
    // vaporTV's own key, not a test one, by default.
    expect(signedBy(digest, signature)).toBe(false)
  })
})

describe('boot video', () => {
  const tree = (customization: string): string =>
    `"InstallConfigStore"\n{\n\t"Software"\n\t{\n\t\t"Valve"\n\t\t{\n\t\t}\n\t}\n${customization}}\n`
  const startupMovie = async (text: string): Promise<VdfObject | undefined> => {
    const { parseTextVdf, childObject } = await import('./vdf')
    return childObject(parseTextVdf(text), 'InstallConfigStore', 'Customization', 'StartupMovie')
  }

  it('sets the startup movie in place, keeping the rest', async () => {
    const { withStartupMovie } = await import('../bootVideo')
    const before = tree(
      `\t"Customization"\n\t{\n\t\t"StartupMovie"\n\t\t{\n\t\t\t"Shuffle"\t\t"1"\n\t\t\t"MovieID"\t\t"0"\n\t\t\t"LocalPath"\t\t""\n\t\t}\n\t\t"Screensaver"\n\t\t{\n\t\t\t"WhileInGame"\t\t"0"\n\t\t}\n\t}\n`
    )
    const after = withStartupMovie(before, '/uioverrides/movies/vaportv.webm')
    expect(await startupMovie(after)).toEqual({ Shuffle: '0', MovieID: '0', LocalPath: '/uioverrides/movies/vaportv.webm' })
    expect(after.split('\n').length).toBe(before.split('\n').length)
    expect(after).toContain('"Screensaver"')
    // And back to Steam's own.
    expect((await startupMovie(withStartupMovie(after, '')))?.LocalPath).toBe('')
  })

  it('adds the block when Steam has none yet', async () => {
    const { withStartupMovie } = await import('../bootVideo')
    const inCustomization = withStartupMovie(tree(`\t"Customization"\n\t{\n\t}\n`), '/m.webm')
    expect((await startupMovie(inCustomization))?.LocalPath).toBe('/m.webm')
    const fresh = withStartupMovie(tree(''), '/m.webm')
    expect(await startupMovie(fresh)).toEqual({ Shuffle: '0', MovieID: '0', LocalPath: '/m.webm' })
  })

  it('adds a missing value to an existing block', async () => {
    const { withStartupMovie } = await import('../bootVideo')
    const partial = tree(`\t"Customization"\n\t{\n\t\t"StartupMovie"\n\t\t{\n\t\t\t"Shuffle"\t\t"1"\n\t\t}\n\t}\n`)
    expect(await startupMovie(withStartupMovie(partial, '/m.webm'))).toEqual({ Shuffle: '0', MovieID: '0', LocalPath: '/m.webm' })
  })
})

describe('PS2', () => {
  it('finds isos, cue/bin games in folders, a loose bin, and one entry per multi-disc game', async () => {
    const { scanPs2 } = await import('./ps2')
    const root = await mkdtemp(join(tmpdir(), 'ps2-'))
    const files = [
      'Ape Escape 2 (USA).iso',
      'Ico (USA)/Ico (USA).bin',
      'Ico (USA)/Ico (USA).cue',
      'MDK2 - Armageddon (USA) (Beta) (2001-03-09).bin',
      'Metal Gear Solid 3 - Subsistence/Metal Gear Solid 3 - Subsistence (USA) (En,Es) (Disc 1) (Subsistence).iso',
      'Metal Gear Solid 3 - Subsistence/Metal Gear Solid 3 - Subsistence (USA) (En,Es) (Disc 2) (Persistence).iso',
      'Metal Gear Solid 3 - Subsistence/Metal Gear Solid 3 - Subsistence (USA) (En,Es) (Disc 3) (Existence) (Limited Edition).iso',
      'systeminfo.txt'
    ]
    for (const file of files) {
      await mkdir(join(root, file, '..'), { recursive: true })
      await writeFile(join(root, file), '')
    }
    const games = await scanPs2(root)
    const byTitle = Object.fromEntries(games.map((g) => [g.title, g.path.slice(root.length + 1)]))
    expect(Object.keys(byTitle).sort()).toEqual(['Ape Escape 2', 'Ico', 'MDK2 - Armageddon', 'Metal Gear Solid 3 - Subsistence'])
    expect(byTitle['Ico']).toBe('Ico (USA)/Ico (USA).cue')
    expect(byTitle['Metal Gear Solid 3 - Subsistence']).toMatch(/\(Disc 1\)/)
  })
})

describe('Xbox', () => {
  it('takes titles from folder names and opens each folder\'s iso', async () => {
    const { scanXbox } = await import('./xbox')
    const root = await mkdtemp(join(tmpdir(), 'xbox-'))
    const files = [
      'Aliens Vs Predator - Extinction (USA)/Aliens Vs Predator - Extinct (USA).1.iso',
      'Aliens Vs Predator - Extinction (USA)/default.xbe',
      'Aliens Vs Predator - Extinction (USA)/default.tbn',
      '007 - Nightfire (USA)/007 - Nightfire (USA).1.iso',
      'Halo (USA).iso',
      'PAL/Alien Hominid (PAL)/Alien Hominid (PAL).iso',
      'systeminfo.txt'
    ]
    for (const file of files) {
      await mkdir(join(root, file, '..'), { recursive: true })
      await writeFile(join(root, file), '')
    }
    const games = await scanXbox(root)
    expect(games.map((g) => g.title)).toEqual(['007 - Nightfire', 'Alien Hominid', 'Aliens Vs Predator - Extinction', 'Halo'])
    expect(games.find((g) => g.title.startsWith('Aliens'))!.path).toMatch(/Extinct \(USA\)\.1\.iso$/)
  })
})

describe('tab arrangement', () => {
  const all = ['steam', 'apps', 'switch', 'ps3', 'xbox', 'xbox360', 'ps2', 'gamecube', 'wii', 'dreamcast', 'arcade'] as const

  it('fills the bar in bar order, then More', async () => {
    const { arrangeTabs } = await import('../../shared/tabs')
    // Nine after Home fill the bar's ten; the rest go under More.
    expect(arrangeTabs(all, [])).toEqual({ bar: all.slice(0, 9), more: ['dreamcast', 'arcade'] })
    // Room for everything: no More.
    expect(arrangeTabs(['apps', 'switch'], [])).toEqual({ bar: ['apps', 'switch'], more: [] })
    // Switched off, or without content: left out.
    expect(arrangeTabs(['apps', 'switch'], ['switch'])).toEqual({ bar: ['apps'], more: [] })
  })

  it('follows a saved arrangement, placing new tabs and keeping the bar within its ten', async () => {
    const { arrangeTabs } = await import('../../shared/tabs')
    const saved = { bar: ['switch', 'apps'] as const, more: ['steam'] as const }
    // Saved order kept; PS3 isn't in it yet, so it joins the bar (there's room).
    expect(arrangeTabs(['steam', 'apps', 'switch', 'ps3'], [], { bar: [...saved.bar], more: [...saved.more] })).toEqual({
      bar: ['switch', 'apps', 'ps3'],
      more: ['steam']
    })
    // A bar saved too full: what doesn't fit goes to the front of More.
    const crowded = arrangeTabs(all, [], { bar: [...all], more: [] })
    expect(crowded.bar).toHaveLength(9)
    expect(crowded.more).toEqual(['dreamcast', 'arcade'])
  })
})

describe('Wii', () => {
  it('finds rvz and wbfs images with clean titles', async () => {
    const { scanWii } = await import('./wii')
    const root = await mkdtemp(join(tmpdir(), 'wii-'))
    const files = ['A Boy and His Blob [SBLE5G].wbfs', 'Baroque (USA).rvz', 'Fishing Master World Tour (USA) (Beta) (2008-11-14).rvz', 'Fishing Master World Tour (USA) (En,Fr,Es).rvz', 'systeminfo.txt']
    for (const file of files) await writeFile(join(root, file), '')
    const games = await scanWii(root)
    expect(games.map((g) => g.title).sort()).toEqual(['A Boy and His Blob', 'Baroque', 'Fishing Master World Tour'])
    // The release, not the beta.
    expect(games.find((g) => g.title === 'Fishing Master World Tour')!.path).toMatch(/\(En,Fr,Es\)\.rvz$/)
  })
})

describe('n64', () => {
  it('lists one game per cartridge, released over beta, with No-Intro titles tidied', async () => {
    const { scanN64 } = await import('./n64')
    const root = await mkdtemp(join(tmpdir(), 'steamtv-n64-'))
    for (const name of [
      'Super Mario 64 (USA).zip',
      "Legend of Zelda, The - Ocarina of Time (USA).zip",
      'Bust-A-Move 3 DX (USA) (Beta) (1998-08-28).zip',
      'Bust-A-Move 3 DX (USA).z64',
      'Mario Kart 64 (USA) (LodgeNet).zip',
      'metadata.txt'
    ])
      await writeFile(join(root, name), '')
    const games = await scanN64(root)
    expect(games.map((g) => g.title)).toEqual(['Bust-A-Move 3 DX', 'Mario Kart 64', 'Super Mario 64', 'The Legend of Zelda - Ocarina of Time'])
    expect(games.find((g) => g.title === 'Bust-A-Move 3 DX')!.path).toMatch(/\(USA\)\.z64$/)
    expect(games[0].id).toBe('n64:Bust-A-Move 3 DX (USA).z64')
  })
})

describe('saturn', () => {
  it('lists zipped and loose discs, multi-disc games from their folder as one game', async () => {
    const { scanSaturn } = await import('./saturn')
    const root = await mkdtemp(join(tmpdir(), 'steamtv-saturn-'))
    await mkdir(join(root, 'Panzer Dragoon Saga (USA)'))
    await mkdir(join(root, 'DecAthlete (Japan) (1M)'))
    for (const name of [
      'Bug! (USA).zip',
      'Daytona USA (Europe) (1S).zip',
      'Panzer Dragoon Saga (USA)/Panzer Dragoon Saga (USA) (Disc 2).zip',
      'Panzer Dragoon Saga (USA)/Panzer Dragoon Saga (USA) (Disc 1).zip',
      'DecAthlete (Japan) (1M)/DecAthlete (Japan) (1M).cue',
      'DecAthlete (Japan) (1M)/DecAthlete (Japan) (1M) (Track 01).bin',
      'metadata.txt'
    ])
      await writeFile(join(root, name), '')
    const games = await scanSaturn(root)
    expect(games.map((g) => g.title)).toEqual(['Bug!', 'Daytona USA', 'DecAthlete', 'Panzer Dragoon Saga'])
    const saga = games.find((g) => g.title === 'Panzer Dragoon Saga')!
    expect(saga.path).toMatch(/\(Disc 1\)\.zip$/)
    expect(saga.discs.map((d) => /\(Disc (\d)\)/.exec(d)![1])).toEqual(['1', '2'])
    expect(games.find((g) => g.title === 'DecAthlete')!.path).toMatch(/\.cue$/)
  })
})

describe('cartridge and floppy tabs', () => {
  it('lists a game per zipped or loose dump, skipping saves and lists', async () => {
    const { scanSnes } = await import('./snes')
    const { scanAmiga } = await import('./amiga')
    const root = await mkdtemp(join(tmpdir(), 'steamtv-retro-'))
    for (const name of [
      'Super Metroid (Japan, USA) (En,Ja).zip',
      'Legend of Zelda, The - A Link to the Past (USA).sfc',
      'Star Fox (USA) (Super Weekend Competition).zip',
      'Star Fox (USA).zip',
      'Spider-Man (World) (Sega).zip',
      'Spider-Man (USA, Europe) (Acclaim).zip',
      'gamelist.xml',
      'Chrono Trigger (USA).srm'
    ])
      await writeFile(join(root, name), '')
    const snes = await scanSnes(root, { 'Spider-Man (World) (Sega).zip': 'Spider-Man vs. The Kingpin' })
    expect(snes.map((g) => g.title)).toEqual(['Spider-Man', 'Spider-Man vs. The Kingpin', 'Star Fox', 'Super Metroid', 'The Legend of Zelda - A Link to the Past'])
    // The retail cart, not the contest one.
    expect(snes.find((g) => g.title === 'Star Fox')!.path).toMatch(/Star Fox \(USA\)\.zip$/)
    const amiga = await mkdtemp(join(tmpdir(), 'steamtv-amiga-'))
    for (const name of ['Turrican II - The Final Fight (Europe).zip', 'Worms - The Director\'s Cut (Europe) (AGA).zip', 'metadata.txt'])
      await writeFile(join(amiga, name), '')
    const games = await scanAmiga(amiga)
    expect(games.map((g) => g.id)).toEqual(['amiga:Turrican II - The Final Fight (Europe).zip', "amiga:Worms - The Director's Cut (Europe) (AGA).zip"])
  })
})

describe('renamed games', () => {
  it('show their new name, A–Z again, with art still keyed by the old one', async () => {
    const { withNames } = await import('./emulated')
    const game = (id: string, title: string) => ({ id, title, platform: 'snes', artKey: `snes:${title}` })
    const games = [game('snes:a', 'Aero Fighters'), game('snes:b', 'Brain Lord')]
    const renamed = withNames({ gameTitles: { 'snes:a': 'Zzz' } }, games)
    expect(renamed.map((g) => g.title)).toEqual(['Brain Lord', 'Zzz'])
    expect(renamed[1].artKey).toBe('snes:Aero Fighters')
    expect(withNames({}, games)).toBe(games)
  })
})

describe('deleting a game', () => {
  it('removes its own files and folder, never a neighbour', async () => {
    const root = await mkdtemp(join(tmpdir(), 'steamtv-delete-'))
    const files = [
      'Bug! (USA).zip',
      'DecAthlete (Japan) (1M)/DecAthlete (Japan) (1M).cue',
      'DecAthlete (Japan) (1M)/DecAthlete (Japan) (1M) (Track 01).bin',
      'Collection/Alpha (USA).cue',
      'Collection/Alpha (USA) (Track 1).bin',
      'Collection/Beta (USA).cue',
      'Collection/Beta (USA) (Track 1).bin',
      'Saga (USA)/Saga (USA) (Disc 1).zip',
      'Saga (USA)/Saga (USA) (Disc 2).zip'
    ]
    for (const file of files) {
      await mkdir(join(root, file, '..'), { recursive: true })
      await writeFile(join(root, file), file.endsWith('.cue') ? `FILE "${file.split('/').pop()!.replace('.cue', ' (Track 1).bin').replace('(1M) (Track 1)', '(1M) (Track 01)')}" BINARY\n` : 'x')
    }
    process.env.STEAMTV_SATURN_ROMS = root
    const { deleteGame, gameOptions } = await import('./gameOptions')
    const left = async (): Promise<string[]> => {
      const out: string[] = []
      const walk = async (dir: string): Promise<void> => {
        for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
          const rel = dir ? `${dir}/${entry.name}` : entry.name
          if (entry.isDirectory()) await walk(rel)
          else out.push(rel)
        }
      }
      await walk('')
      return out.sort()
    }
    expect((await gameOptions({}, 'saturn:Collection/Alpha (USA).cue', 'Alpha')).files.count).toBe(2)
    await deleteGame({}, 'saturn:Collection/Alpha (USA).cue')
    await deleteGame({}, 'saturn:DecAthlete (Japan) (1M)/DecAthlete (Japan) (1M).cue')
    await deleteGame({}, 'saturn:Saga (USA)/Saga (USA) (Disc 1).zip')
    expect(await left()).toEqual(['Bug! (USA).zip', 'Collection/Beta (USA) (Track 1).bin', 'Collection/Beta (USA).cue'])
    // The game folders went whole; the shared one stayed.
    expect(existsSync(join(root, 'DecAthlete (Japan) (1M)'))).toBe(false)
    expect(existsSync(join(root, 'Saga (USA)'))).toBe(false)
    await expect(deleteGame({}, 'saturn:Nothing (USA).zip')).rejects.toThrow()
    delete process.env.STEAMTV_SATURN_ROMS
  })
})

describe('wii u', () => {
  it('lists title folders with a bootable .rpx, named from meta.xml', async () => {
    const { scanWiiU, wiiUTitle } = await import('./wiiu')
    const root = await mkdtemp(join(tmpdir(), 'steamtv-wiiu-'))
    const game = async (folder: string, rpxs: string[], longname?: string, argstr?: string): Promise<void> => {
      await mkdir(join(root, folder, 'code'), { recursive: true })
      for (const rpx of rpxs) await writeFile(join(root, folder, 'code', rpx), '')
      if (argstr) await writeFile(join(root, folder, 'code', 'cos.xml'), `<app><argstr type="string" length="4096">${argstr}</argstr></app>`)
      if (longname) {
        await mkdir(join(root, folder, 'meta'), { recursive: true })
        await writeFile(join(root, folder, 'meta', 'meta.xml'), `<menu><longname_en type="string" length="512">${longname}</longname_en></menu>`)
      }
    }
    await game('Mario Luigi Superstar Saga [Game] [0005000010157400]', ['WUP-AA8E.rpx'], 'Mario &amp; Luigi:\nSuperstar Saga')
    await game('Need for Speed Most Wanted U [Game] [0005000010128800]', ['a.rpx', 'NFS.rpx'], 'Need for Speed™ Most Wanted U', 'NFS.rpx')
    await game('Runbow [Game] [0005000010183000]', ['Runbow.rpx'])
    await mkdir(join(root, 'mlc01', 'usr'), { recursive: true })
    const games = await scanWiiU(root)
    expect(games.map((g) => g.title)).toEqual(['Mario & Luigi: Superstar Saga', 'Need for Speed Most Wanted U', 'Runbow'])
    expect(games[1].path).toMatch(/code\/NFS\.rpx$/)
    expect(games[2].id).toBe('wiiu:Runbow [Game] [0005000010183000]')
    expect(wiiUTitle(null, 'TANK TANK TANK DL [Game] [0005000010133800]')).toBe('TANK TANK TANK DL')
  })
})

describe('psx and psp', () => {
  const files = async (root: string, names: string[]): Promise<void> => {
    for (const name of names) {
      await mkdir(join(root, name, '..'), { recursive: true })
      await writeFile(join(root, name), '')
    }
  }

  it('psx: a folder per game, its .cue (or .ccd) not the track .bins', async () => {
    const { scanPsx } = await import('./psx')
    const root = await mkdtemp(join(tmpdir(), 'steamtv-psx-'))
    await files(root, [
      'Castlevania - Symphony of the Night/Castlevania - Symphony of the Night.cue',
      'Castlevania - Symphony of the Night/Castlevania - Symphony of the Night (Track 1).bin',
      'Castlevania - Symphony of the Night/Castlevania - Symphony of the Night (Track 2).bin',
      'Metal Slug X/Metal Slug X.ccd',
      'Metal Slug X/Metal Slug X.img',
      'Metal Gear Solid/Metal Gear Solid (Disc 1)/Metal Gear Solid (Disc 1).cue',
      'Metal Gear Solid/Metal Gear Solid (Disc 1)/Metal Gear Solid (Disc 1).bin',
      'Metal Gear Solid/Metal Gear Solid (Disc 2)/Metal Gear Solid (Disc 2).cue',
      'metadata.txt'
    ])
    const games = await scanPsx(root)
    expect(games.map((g) => g.title)).toEqual(['Castlevania - Symphony of the Night', 'Metal Gear Solid', 'Metal Slug X'])
    // Both discs, disc 1 first: opened as a disc list.
    expect(games[1].discs.map((d) => d.split('/').pop())).toEqual(['Metal Gear Solid (Disc 1).cue', 'Metal Gear Solid (Disc 2).cue'])
    expect(games[0].path).toMatch(/Night\.cue$/)
  })

  it('psx: CHDs with their own .m3u for multi-disc games', async () => {
    const { scanPsx } = await import('./psx')
    const { discContent } = await import('./discs')
    const root = await mkdtemp(join(tmpdir(), 'steamtv-psx-chd-'))
    await files(root, [
      'Command & Conquer - Red Alert (USA) (Disc 1) (Allies).chd',
      'Command & Conquer - Red Alert (USA) (Disc 2) (Soviet).chd',
      'Command & Conquer - Red Alert (USA).m3u',
      'Area 51 (v1.0).chd'
    ])
    const games = await scanPsx(root)
    expect(games.map((g) => g.title)).toEqual(['Area 51', 'Command & Conquer - Red Alert'])
    // The set's own list is what opens.
    expect(await discContent(games[1])).toMatch(/Red Alert \(USA\)\.m3u$/)
  })

  it('psp: one entry for a game that is there loose and in a folder', async () => {
    const { scanPsp } = await import('./psp')
    const root = await mkdtemp(join(tmpdir(), 'steamtv-psp-'))
    await files(root, ['Bomberman Land (USA).iso', 'Bomberman Land (USA)/Bomberman Land (USA).iso', 'Daxter (USA) (En,Fr,De,Es,It).iso'])
    expect((await scanPsp(root)).map((g) => g.title)).toEqual(['Bomberman Land', 'Daxter'])
  })
})
