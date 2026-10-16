import { app, BrowserWindow, ipcMain } from 'electron'
import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import home from '../../fixtures/home.json'
import { resolveControls, type Controls } from '../shared/controls'
import { sunTimes, type SunTimes } from '../shared/sun'
import type { AppItem, BackdropStyle, DriveFolder, InstallOptions, ScreensaverSources, ScreensaverStyle, BackdropTime, HomeData, LaunchKind, LayoutTab, MusicVolume, PowerAction, RecentsTab, Settings, SteamLayout } from '../shared/types'
import { loadConfig, recentsLayout, saveConfig, type Config } from './config'
import { toggleFavorite } from './history'
import { ensureSteamtvInFront, startHotkey, STEAMTV_APPID } from './hotkey'
import { install, installStatus, returnToGamingMode, uninstall } from './installer'
import { launch, launchedName } from './launch'
import { handleArtScheme, registerArtScheme } from './library/art'
import { collectionGames, isSupported, readCollections } from './library/collections'
import { dreamcastGames, fillDreamcastArt, loadDreamcastTab } from './library/dreamcastTab'
import { emulatorInstalled } from './library/emulators'
import type { EmulatedGame } from './library/emulated'
import { fillGameCubeArt, gamecubeGames, loadGameCubeTab } from './library/gamecubeTab'
import { fillPs3Art, loadPs3Tab, ps3Folders, ps3Games } from './library/ps3Tab'
import { fillEmulatedArt } from './library/emulated'
import { hasSteam, loadRecents, serviceArtGames, steamRoot } from './library/recents'
import { activeUserDir, steamGames } from './library/steam'
import { ART_CACHE, chooseArt, gameCovers, resetArt, searchGames } from './library/steamgriddb'
import { DEFAULT_STEAM_COLLECTIONS, loadSteamTab } from './library/steamTab'
import { fillSwitchArt, loadSwitchTab, switchGames } from './library/switchTab'
import { fillXbox360Art, loadXbox360Tab, xbox360Games } from './library/xbox360Tab'
import { getLocation } from './location'
import { currentMusic, musicFolder, musicTracks } from './music'
import { chooseDriveFolder, driveFolders, driveStatus, startDriveSync, syncDrive } from './addons/googleDrive'
import { cancelPick, clearPhotos, googlePhotosStatus, signIn as googleSignIn, signOut as googleSignOut, startPick } from './addons/googlePhotos'
import {
  DEFAULT_SCREENSAVER_DELAY,
  screensaverData,
  screensaverFolder,
  screensaverFolders,
  screensaverSources,
  screensaverStyle
} from './screensaver'
import { power } from './power'
import { captureAndQuit, screenshotMode } from './screenshot'
import { stepVolume } from './volume'
import { getWeather } from './weather'

const devUrl = process.env.ELECTRON_RENDERER_URL
/**
 * Setup mode: the AppImage opened outside Steam (double-clicked in Desktop Mode), or
 * started with --setup. It shows the install window instead of the TV interface.
 */
const setupMode = process.argv.includes('--setup') || (!!process.env.APPIMAGE && !process.env.SteamGameId && !process.env.SteamAppId)
const screenshot = screenshotMode()
// Dev aid: STEAMTV_TIME=HH:MM pins the background scene to that time of day.
const query = process.env.STEAMTV_TIME ? { time: process.env.STEAMTV_TIME } : undefined

// A second launch (e.g. picking steamtv in Steam again) brings back this window
// instead of starting another copy that would also read the controller.
if (!screenshot && !setupMode && !app.requestSingleInstanceLock()) app.quit()

let win: BrowserWindow | null = null
app.on('second-instance', () => {
  if (win?.isMinimized()) win.restore()
  win?.focus()
})

// Input events (moves, controller connects, focus changes) for diagnosing phantom
// input on the box. Rewritten each run; small.
const INPUT_LOG = join(homedir(), '.cache', 'steamtv', 'input.log')
const inputLogReady = mkdir(join(homedir(), '.cache', 'steamtv'), { recursive: true }).then(() =>
  writeFile(INPUT_LOG, `steamtv started ${new Date().toISOString()}\n`)
)
function logInput(line: string): void {
  inputLogReady.then(() => appendFile(INPUT_LOG, `${new Date().toISOString().slice(11, 23)} ${line}\n`)).catch(() => {})
}
ipcMain.on('input:log', (_event, line: string) => logInput(line))

function createWindow(): void {
  const window = new BrowserWindow({
    width: setupMode ? 960 : 1920,
    height: setupMode ? 720 : 1080,
    useContentSize: true,
    fullscreen: !devUrl && !screenshot && !setupMode,
    frame: !!devUrl || setupMode,
    title: setupMode ? 'vaporTV Setup' : 'vaporTV',
    backgroundColor: '#0B070D',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // Navigation sounds play before anyone has clicked in the window.
      autoplayPolicy: 'no-user-gesture-required'
    }
  })

  const params = setupMode ? { ...query, setup: '1' } : query
  if (devUrl) window.loadURL(params ? `${devUrl}?${new URLSearchParams(params)}` : devUrl)
  else window.loadFile(join(__dirname, '../renderer/index.html'), { query: params })

  if (screenshot) window.webContents.once('did-finish-load', () => captureAndQuit(window, screenshot))
  // The page's own diagnostics ("steamtv: ...") and errors go to the same log, so the
  // box can be checked over ssh.
  window.webContents.on('console-message', ({ level, message }) => {
    if (level === 'error' || message.startsWith('steamtv:')) logInput(`page ${level}: ${message}`)
  })
  win = window
}

registerArtScheme()

// Recents come from the Steam install; without one (a dev PC with no snapshot)
// the hand-made fixture stands in. Favorite Apps are still the fixture's.
/** The chosen backdrop, or the sea if it's one that's since been removed (Particles). */
function backdropStyle(config: Config): BackdropStyle {
  return config.backdrop === 'rain' ? 'rain' : 'sea'
}

/**
 * Notes the Steam shortcut vaporTV was launched from (Steam passes its ids), so the
 * Gaming Mode autostart script can relaunch it without knowing them in advance.
 */
async function recordSteamShortcut(): Promise<void> {
  const gameId = process.env.SteamGameId
  if (!gameId || STEAMTV_APPID === null) return
  const dir = join(homedir(), '.config', 'steamtv')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'steam-shortcut.env'), `STEAMTV_GAME_ID=${gameId}\nSTEAMTV_APPID=${STEAMTV_APPID}\n`).catch(() => {})
}

/** Tabs with nothing in them stay out of the nav; worked out at most this often. */
const TABS_TTL = 60 * 1000
let tabsCache: { at: number; tabs: Record<LayoutTab, boolean> } | null = null

async function availableTabs(config: Config): Promise<Record<LayoutTab, boolean>> {
  if (tabsCache && Date.now() - tabsCache.at < TABS_TTL) return tabsCache.tabs
  const has = (load: (c: Config) => Promise<unknown[]>): Promise<boolean> =>
    load(config).then((games) => games.length > 0, () => false)
  const [sw, ps3, x360, gc, dc] = await Promise.all([switchGames, ps3Games, xbox360Games, gamecubeGames, dreamcastGames].map(has))
  // A console tab needs its emulator as well as games.
  const tabs = {
    steam: hasSteam(config),
    switch: sw && emulatorInstalled(config, 'switch'),
    ps3: ps3 && emulatorInstalled(config, 'ps3'),
    xbox360: x360 && emulatorInstalled(config, 'xbox360'),
    gamecube: gc && emulatorInstalled(config, 'gamecube'),
    dreamcast: dc && emulatorInstalled(config, 'dreamcast')
  }
  tabsCache = { at: Date.now(), tabs }
  return tabs
}

/** Runs an install step list, sending each line to the setup window; resolves with an error message or null. */
async function setupRun(sender: Electron.WebContents, job: (report: (line: string) => void) => Promise<void>): Promise<string | null> {
  const report = (line: string): void => {
    if (!sender.isDestroyed()) sender.send('setup:progress', line)
  }
  try {
    await job(report)
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

/** The console game behind a card id (Recents or a console tab), for the Artwork window. */
async function emulatedGame(config: Config, id: string): Promise<EmulatedGame | undefined> {
  const loaders = [switchGames, ps3Games, xbox360Games, gamecubeGames, dreamcastGames]
  for (const load of loaders) {
    const game = (await load(config).catch(() => [])).find((g) => g.id === id)
    if (game) return game
  }
  return undefined
}

async function artGame(id: string): Promise<{ key: string; game: EmulatedGame }> {
  const config = await loadConfig()
  if (!config.steamGridDbKey) throw new Error('Add a SteamGridDB key in Settings → Artwork first.')
  const game = await emulatedGame(config, id)
  if (!game) throw new Error("This one's art comes from Steam, not SteamGridDB.")
  return { key: config.steamGridDbKey, game }
}

/** Every app vaporTV knows how to open, in the Apps tab's order. */
const APPS: AppItem[] = [...home.apps, ...home.moreApps]

/** Home's Favorite Apps: the ones chosen, or the built-in eight until any are. */
function favoriteAppIds(config: Config): string[] {
  return config.favoriteApps ?? home.apps.map((app) => app.id)
}

const RECENTS_TABS: RecentsTab[] = ['home', 'steam', 'switch', 'ps3', 'xbox360', 'gamecube', 'dreamcast']

ipcMain.handle('home:get', async (): Promise<HomeData> => {
  const config = await loadConfig()
  fillArt()
  const recents = hasSteam(config) ? await loadRecents(config) : home.recents
  const favorites = favoriteAppIds(config)
  const allApps = APPS.map((app) => ({ ...app, favorite: favorites.includes(app.id) }))
  const apps = favorites.flatMap((id) => allApps.filter((app) => app.id === id))
  return {
    recents,
    apps,
    allApps,
    platformLogos: home.platformLogos,
    recentsLayout: recentsLayout(config, 'home'),
    favoritesLayout: config.favoritesLayout ?? 'rows'
  }
})
ipcMain.handle('apps:favorite', async (_event, id: string) => {
  const config = await loadConfig()
  if (!APPS.some((app) => app.id === id)) return false
  const favorites = favoriteAppIds(config)
  const on = !favorites.includes(id)
  await saveConfig({ favoriteApps: on ? [...favorites, id] : favorites.filter((f) => f !== id) })
  return on
})
ipcMain.handle('weather:get', () => getWeather())
ipcMain.handle('art:search', async (_event, id: string, query?: string) => {
  const { key, game } = await artGame(id)
  return { title: game.title, matches: await searchGames(key, query ?? game.title) }
})
ipcMain.handle('art:covers', async (_event, id: string, gameId: number) => gameCovers((await artGame(id)).key, gameId))
ipcMain.handle('art:choose', async (_event, id: string, gameId: number, cover: string) => {
  const { key, game } = await artGame(id)
  await chooseArt(key, game.artKey, gameId, cover)
  win?.webContents.send('art:updated')
})
ipcMain.handle('art:reset', async (_event, id: string) => {
  const { game } = await artGame(id)
  await resetArt(game.artKey)
  // Look it up again now, rather than at the next tab load.
  fillArt()
  win?.webContents.send('art:updated')
})
ipcMain.handle('setup:status', () => installStatus())
ipcMain.handle('setup:install', (event, options: InstallOptions) => setupRun(event.sender, (report) => install(options, report)))
ipcMain.handle('setup:uninstall', (event) => setupRun(event.sender, uninstall))
ipcMain.handle('setup:gamingMode', () => returnToGamingMode())
ipcMain.handle('tabs:available', async () => availableTabs(await loadConfig()))
ipcMain.handle('sun:get', async (): Promise<SunTimes | null> => {
  const location = await getLocation()
  return location ? sunTimes(new Date(), location.latitude, location.longitude) : null
})
ipcMain.handle('launch', async (_event, kind: LaunchKind, id: string, name?: string) =>
  launch(await loadConfig(), kind, id, name)
)

ipcMain.handle('settings:get', async (): Promise<Settings> => {
  const config = await loadConfig()
  const userDir = await activeUserDir(steamRoot(config))
  const collections = userDir ? await readCollections(userDir) : []
  const games = userDir && collections.some((c) => c.dynamic) ? await steamGames(steamRoot(config), userDir) : []
  return {
    collections: collections.map((c) => ({
      id: c.id,
      name: c.name,
      dynamic: c.dynamic,
      supported: isSupported(c),
      count: !isSupported(c) ? null : c.dynamic ? collectionGames(c, games).length : c.appids.length
    })),
    steamCollections: config.steamCollections ?? DEFAULT_STEAM_COLLECTIONS,
    steamLayout: config.steamLayout ?? 'rows',
    switchLayout: config.switchLayout ?? 'rows',
    ps3Layout: config.ps3Layout ?? 'rows',
    xbox360Layout: config.xbox360Layout ?? 'rows',
    gamecubeLayout: config.gamecubeLayout ?? 'rows',
    dreamcastLayout: config.dreamcastLayout ?? 'rows',
    favoritesLayout: config.favoritesLayout ?? 'rows',
    recentsLayouts: Object.fromEntries(RECENTS_TABS.map((tab) => [tab, recentsLayout(config, tab)])) as Record<RecentsTab, SteamLayout>,
    musicTracks: await musicTracks(config),
    music: config.music ?? null,
    musicVolume: config.musicVolume ?? 'medium',
    backdrop: backdropStyle(config),
    backdropTime: config.backdropTime ?? 'auto',
    musicFolder: musicFolder(config).replace(homedir(), '~'),
    sleepOnControllerOff: config.sleepOnControllerOff ?? false,
    sleepWarning: config.sleepWarning ?? true,
    controls: resolveControls(config.controls),
    screensaverDelay: config.screensaverDelay ?? DEFAULT_SCREENSAVER_DELAY,
    screensaverStyle: screensaverStyle(config),
    screensaverSources: screensaverSources(config),
    screensaverFolder: screensaverFolder(config).replace(homedir(), '~'),
    steamGridDbKeyHint: config.steamGridDbKey ? config.steamGridDbKey.slice(-4) : null
  }
})
ipcMain.handle('steam-tab:get', async () => loadSteamTab(await loadConfig()))
ipcMain.handle('settings:steamCollections', (_event, ids: string[]) => saveConfig({ steamCollections: ids }))
ipcMain.handle('settings:tabLayout', (_event, tab: LayoutTab, layout: SteamLayout) =>
  saveConfig({ [`${tab}Layout`]: layout })
)
ipcMain.handle('settings:favoritesLayout', (_event, layout: SteamLayout) => saveConfig({ favoritesLayout: layout }))
ipcMain.handle('settings:recentsLayout', async (_event, tab: RecentsTab, layout: SteamLayout) => {
  const config = await loadConfig()
  await saveConfig({ recentsLayouts: { ...config.recentsLayouts, [tab]: layout } })
})
ipcMain.handle('settings:steamGridDbKey', async (_event, key: string) => {
  await saveConfig({ steamGridDbKey: key.trim() || undefined })
  fillArt()
})

ipcMain.handle('settings:music', (_event, file: string | null) => saveConfig({ music: file ?? undefined }))
ipcMain.handle('settings:musicVolume', (_event, volume: MusicVolume) => saveConfig({ musicVolume: volume }))
ipcMain.handle('settings:backdropTime', (_event, time: BackdropTime) => saveConfig({ backdropTime: time }))
ipcMain.handle('settings:backdrop', (_event, style: BackdropStyle) => saveConfig({ backdrop: style }))
ipcMain.handle('backdrop:get', async () => {
  const config = await loadConfig()
  return { style: backdropStyle(config), time: config.backdropTime ?? 'auto' }
})
ipcMain.handle('music:get', async () => currentMusic(await loadConfig()))
ipcMain.handle('screensaver:get', async () => screensaverData(await loadConfig()))
ipcMain.handle('settings:sleepOnControllerOff', (_event, on: boolean) => saveConfig({ sleepOnControllerOff: on }))
ipcMain.handle('settings:controls', (_event, controls: Controls) => saveConfig({ controls: resolveControls(controls) }))
ipcMain.handle('settings:sleepWarning', (_event, on: boolean) => saveConfig({ sleepWarning: on }))
ipcMain.handle('settings:screensaverStyle', (_event, style: ScreensaverStyle) => saveConfig({ screensaverStyle: style }))
ipcMain.handle('settings:screensaverSources', (_event, sources: ScreensaverSources) => saveConfig({ screensaverSources: sources }))
ipcMain.handle('settings:screensaverDelay', (_event, minutes: number) => saveConfig({ screensaverDelay: minutes }))
ipcMain.handle('gphotos:status', async () => googlePhotosStatus(await loadConfig()))
ipcMain.handle('gphotos:signIn', async () => {
  const ok = await googleSignIn()
  // The sign-in window had the screen; bring vaporTV back to the front.
  win?.focus()
  if (ok) void syncDrive()
  return ok
})
ipcMain.handle('gphotos:signOut', () => googleSignOut())
ipcMain.handle('gphotos:pick', (event) =>
  startPick((progress) => {
    if (!event.sender.isDestroyed()) event.sender.send('gphotos:progress', progress)
  }).catch((err: unknown) => ({ error: err instanceof Error ? err.message : String(err) }))
)
ipcMain.handle('gphotos:cancel', () => cancelPick())
ipcMain.handle('gphotos:clear', () => clearPhotos())
ipcMain.handle('gdrive:status', () => driveStatus())
ipcMain.handle('gdrive:folders', () => driveFolders())
ipcMain.handle('gdrive:choose', (_event, folder: DriveFolder | null) => chooseDriveFolder(folder))
ipcMain.handle('gdrive:syncNow', () => syncDrive())

// Missing art downloads in the background; the page reloads its tab as it arrives.
function fillArt(): void {
  loadConfig().then((config) =>
    {
      const updated = (): void => {
        if (win && !win.isDestroyed()) win.webContents.send('art:updated')
      }
      ;[fillSwitchArt, fillPs3Art, fillXbox360Art, fillGameCubeArt, fillDreamcastArt].forEach((fill) => fill(config, updated))
      fillEmulatedArt('services', config.steamGridDbKey, async () => serviceArtGames(), updated)
    }
  )
}

ipcMain.handle('favorite:toggle', (_event, id: string) => toggleFavorite(id))
ipcMain.handle('ps3-tab:get', async () => {
  const config = await loadConfig()
  fillArt()
  return loadPs3Tab(config)
})
ipcMain.handle('xbox360-tab:get', async () => {
  const config = await loadConfig()
  fillArt()
  return loadXbox360Tab(config)
})
ipcMain.handle('dreamcast-tab:get', async () => {
  const config = await loadConfig()
  fillArt()
  return loadDreamcastTab(config)
})
ipcMain.handle('gamecube-tab:get', async () => {
  const config = await loadConfig()
  fillArt()
  return loadGameCubeTab(config)
})
ipcMain.handle('switch-tab:get', async () => {
  const config = await loadConfig()
  fillArt()
  return loadSwitchTab(config)
})

// Give the select sound a moment to play before the window goes.
ipcMain.handle('quit', () => setTimeout(() => app.quit(), 400))
ipcMain.handle('power', (_event, action: PowerAction) => power(action))
ipcMain.handle('volume:step', (_event, direction: 1 | -1) => stepVolume(direction === 1 ? 1 : -1))

app.whenReady().then(async () => {
  void recordSteamShortcut()
  const config = await loadConfig()
  const root = steamRoot(config)
  // PS3 games' own icons are the fallback when SteamGridDB has no wide art.
  const ps3 = await ps3Folders(config)
  // Local files the page may load: game art, the background-music folder and screensaver photos.
  handleArtScheme(() => [join(root, 'appcache'), join(root, 'userdata'), ART_CACHE, ps3.hdd0, ps3.discs, musicFolder(config), ...screensaverFolders(config)])
  if (setupMode) return createWindow()
  startDriveSync()
  createWindow()
  // Select + Start held: close whatever is in front and come back here.
  if (!screenshot) {
    const send = (channel: string, ...args: unknown[]): void => {
      if (win && !win.isDestroyed()) win.webContents.send(channel, ...args)
    }
    startHotkey({
      bringBack: () => {
        win?.focus()
        ensureSteamtvInFront(logInput)
      },
      nameFor: launchedName,
      onClosing: (name) => send('closing', { active: true, name }),
      onClosed: () => send('closing', { active: false }),
      log: logInput
    })
  }
})
app.on('window-all-closed', () => app.quit())
