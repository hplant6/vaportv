import { app, BrowserWindow, ipcMain } from 'electron'
import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import home from '../../fixtures/home.json'
import type { ArcadeRow } from '../shared/arcade'
import { EXTRAS } from '../shared/build'
import { resolveControls, type Controls } from '../shared/controls'
import { sunTimes, type SunTimes } from '../shared/sun'
import type { AppItem, GameInfo, GameOptions, PlaceMatch, Playlist, TemperatureUnit, BackdropStyle, BrowseKind, CustomBackdrop, DriveFolder, InstallOptions, ScreensaverClockSpot, ScreensaverSources, ScreensaverStyle, BackdropTime, ClockCorners, HomeData, LaunchKind, LayoutTab, MusicKind, MusicVolume, PowerAction, RecentsTab, Settings, SteamLayout, TabArrangement, UpdateInfo, UpdateState, HideableTab, VoicePurpose, BugReportInput } from '../shared/types'
import { loadConfig, recentsLayout, saveConfig, type Config } from './config'
import { forgetGame, readPlaytime, toggleFavorite } from './history'
import { ensureSteamtvInFront, startHotkey, STEAMTV_APPID } from './hotkey'
import { watchSteamFocus } from './steamFocus'
import { startRemoteKeys } from './remoteKeys'
import { listen, setVoiceHints, stopListening } from './voice'
import { makeBugReport } from './bugReport'
import { addShortcutsWithRestart, appState, inGamingMode, installForApp } from './appSetup'
import { appCatalog, CUSTOM_TILES } from './customApps'
import { install, installStatus, repairSetup, returnToGamingMode, setupDamage, uninstall } from './installer'
import { directAppAge, launch, launchedIsGame, launchedName, launchUrl } from './launch'
import { stageNetflixExtension } from './netflixExtension'
import { canUpdate, checkForUpdate, installUpdate, restartAfterUpdate } from './updater'
import { INTRO_FOLDER, introSettings } from './intro'
import { bootVideoSelected, steamJustStarted } from './bootVideo'
import { systemBattery } from './battery'
import { systemStats } from './systemStats'
import { cleanClockCorners } from '../shared/clock'
import { handleArtScheme, registerArtScheme } from './library/art'
import { collectionGames, isSupported, readCollections } from './library/collections'
import { dreamcastGames, fillDreamcastArt, loadDreamcastTab } from './library/dreamcastTab'
import { fillN64Art, loadN64Tab, n64Games } from './library/n64Tab'
import { deleteGame, gameOptions } from './library/gameOptions'
import { gameInfo } from './library/gameInfo'
import { fillSaturnArt, loadSaturnTab, saturnGames } from './library/saturnTab'
import { fillNesArt, loadNesTab, nesGames } from './library/nesTab'
import { fillSnesArt, loadSnesTab, snesGames } from './library/snesTab'
import { fillGenesisArt, loadGenesisTab, genesisGames } from './library/genesisTab'
import { fillSega32xArt, loadSega32xTab, sega32xGames } from './library/sega32xTab'
import { fillAmigaArt, loadAmigaTab, amigaGames } from './library/amigaTab'
import { fillWiiUArt, loadWiiUTab, wiiUGames } from './library/wiiuTab'
import { fillPsxArt, loadPsxTab, psxGames } from './library/psxTab'
import { fillPspArt, loadPspTab, pspGames } from './library/pspTab'
import { emulatorInstalled } from './library/emulators'
import type { EmulatedGame } from './library/emulated'
import { fillGameCubeArt, gamecubeGames, loadGameCubeTab } from './library/gamecubeTab'
import { fillPs2Art, loadPs2Tab, ps2Games } from './library/ps2Tab'
import { fillXboxArt, loadXboxTab, xboxGames } from './library/xboxTab'
import { fillWiiArt, loadWiiTab, wiiGames } from './library/wiiTab'
import { fillPs3Art, loadPs3Tab, ps3Folders, ps3Games } from './library/ps3Tab'
import { emulatedItem, fillEmulatedArt } from './library/emulated'
import { appArt, hasSteam, loadRecents, serviceArtGames, steamRoot } from './library/recents'
import { activeUserDir, steamGames } from './library/steam'
import { arcadeGames, fillArcadeArt, loadArcadeTab } from './library/arcade'
import { ART_CACHE, chooseArt, gameCovers, resetArt, savePortrait, searchGames } from './library/steamgriddb'
import { searchDuckDuckGo } from './library/duckduckgo'
import { hasLibretroThumbnails, libretroCovers } from './library/libretroThumbnails'
import { searchWebImages, webCover } from './library/webImages'
import { DEFAULT_STEAM_COLLECTIONS, loadSteamTab } from './library/steamTab'
import { fillSwitchArt, loadSwitchTab, switchGames } from './library/switchTab'
import { fillXbox360Art, loadXbox360Tab, xbox360Games } from './library/xbox360Tab'
import { getLocation, locationSettings, searchPlaces, setPlace, setTemperatureUnit } from './location'
import { currentMusic, importMusic, musicChoices, musicFolder, musicTracks, PLAYLIST, playlists, SHUFFLE, trackUrl } from './music'
import { browseFiles, openFile, pasteFile, wasOpened } from './browse'
import { addBackdrop, BACKDROP_FOLDER, customBackdrops, removeBackdrop } from './backdrops'
import { chooseDriveFolder, driveFolders, driveStatus, startDriveSync, syncDrive } from './addons/googleDrive'
import { connectWifi, forgetWifi, rescanWifi, setWifiEnabled, wifiStatus } from './wifi'
import { bluetoothStatus, connectBluetooth, disconnectBluetooth, findBluetoothDevices, forgetBluetooth, pairBluetooth, setBluetoothPowered } from './bluetooth'
import { cancelPick, clearPhotos, googlePhotosStatus, signIn as googleSignIn, signOut as googleSignOut, startPick } from './addons/googlePhotos'
import {
  DEFAULT_SCREENSAVER_DELAY,
  photoTaken,
  screensaverData,
  screensaverFolder,
  screensaverFolders,
  screensaverSources,
  screensaverStyle
} from './screensaver'
import { power, sleepBlocker } from './power'
import { captureAndQuit, screenshotMode } from './screenshot'
import { stepVolume } from './volume'
import { getWeather } from './weather'
import { arrangeTabs, TAB_LIST } from '../shared/tabs'

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
ipcMain.on('voice:start', (event, purpose: VoicePurpose) =>
  void listen(
    (state, why) => {
      if (!event.sender.isDestroyed()) event.sender.send('voice', state, why)
    },
    logInput,
    purpose
  )
)
ipcMain.on('voice:stop', () => stopListening())
ipcMain.handle('bugReport:make', (_event, input: BugReportInput) => makeBugReport(input, INPUT_LOG))
ipcMain.on('voice:hints', (_event, titles: string[]) => setVoiceHints(titles))

const windowSize = (): [number, number] | undefined => {
  const m = /^(\d+)x(\d+)$/.exec(process.env.STEAMTV_WINDOW ?? '')
  return m ? [Number(m[1]), Number(m[2])] : undefined
}

function createWindow(): void {
  const window = new BrowserWindow({
    // STEAMTV_WINDOW (e.g. 1280x800, a Steam Deck's screen): another size, for screenshots.
    width: setupMode ? 960 : windowSize()?.[0] ?? 1920,
    height: setupMode ? 720 : windowSize()?.[1] ?? 1080,
    useContentSize: true,
    fullscreen: !devUrl && !screenshot && !setupMode,
    frame: !!devUrl || setupMode,
    title: setupMode ? 'vaporTV Setup' : 'vaporTV',
    backgroundColor: '#0B070D',
    icon: app.isPackaged ? join(process.resourcesPath, 'library-art', 'icon.png') : join(app.getAppPath(), 'build', 'icon.png'),
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
/** Your own backdrops as chosen: the one that loops (the first, if its file has gone), or all of them shuffled. */
async function customChoice(config: Config): Promise<{ items: CustomBackdrop[]; start: string; shuffle: boolean } | null> {
  const all = await customBackdrops()
  if (all.length === 0) return null
  const shuffle = config.backdropFile === SHUFFLE
  if (!shuffle) return { items: all, start: (all.find((b) => b.file === config.backdropFile) ?? all[0]).file, shuffle }
  // Shuffled: those left in (all of them, if every one's been left out).
  const off = new Set(config.backdropShuffleOff ?? [])
  const pool = all.filter((b) => !off.has(b.file))
  const items = pool.length > 0 ? pool : all
  return { items, start: items[Math.floor(Math.random() * items.length)].file, shuffle }
}

/** Your own backdrops' choice as Settings shows it: 'shuffle', or the file that loops (the first, if its file has gone). */
function customBackdropFile(config: Config, items: CustomBackdrop[]): string | null {
  if (items.length === 0) return null
  if (config.backdropFile === SHUFFLE) return SHUFFLE
  return (items.find((b) => b.file === config.backdropFile) ?? items[0]).file
}

/** The chosen backdrop, or the sea if it's one that's since been removed (Particles, Desert Dunes, or all of your own). */
async function backdropChoice(config: Config): Promise<{ style: BackdropStyle; custom: Awaited<ReturnType<typeof customChoice>> }> {
  const offered: BackdropStyle[] = ['sea', 'rain', 'cityrain', 'forest', 'aurora', 'drift', 'waves', 'tunnel']
  if (config.backdrop === 'custom') {
    const custom = await customChoice(config)
    return custom ? { style: 'custom', custom } : { style: 'sea', custom: null }
  }
  return { style: config.backdrop && offered.includes(config.backdrop) ? config.backdrop : 'sea', custom: null }
}

const DEFAULT_DRIFT_PRESET = 'molten'

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
  // Dev aid: STEAMTV_ALL_TABS=1 shows every tab, e.g. to see More's row on a PC without the games.
  if (process.env.STEAMTV_ALL_TABS) return Object.fromEntries(TAB_LIST.filter((t) => t.id !== 'home' && t.id !== 'apps').map((t) => [t.id, true])) as Record<LayoutTab, boolean>
  if (tabsCache && Date.now() - tabsCache.at < TABS_TTL) return tabsCache.tabs
  const has = (load: (c: Config) => Promise<unknown[]>): Promise<boolean> =>
    load(config).then((games) => games.length > 0, () => false)
  const [sw, ps2, psx, psp, ps3, xb, x360, gc, wii, wiiu, dc, sat, n64, nesHas, snesHas, genesisHas, sega32xHas, amigaHas, arc] = await Promise.all([switchGames, ps2Games, psxGames, pspGames, ps3Games, xboxGames, xbox360Games, gamecubeGames, wiiGames, wiiUGames, dreamcastGames, saturnGames, n64Games, nesGames, snesGames, genesisGames, sega32xGames, amigaGames, arcadeGames].map(has))
  // A console tab needs its emulator as well as games.
  const tabs = {
    steam: hasSteam(config),
    switch: sw && emulatorInstalled(config, 'switch'),
    ps2: ps2 && emulatorInstalled(config, 'ps2'),
    ps3: ps3 && emulatorInstalled(config, 'ps3'),
    xbox: xb && emulatorInstalled(config, 'xbox'),
    xbox360: x360 && emulatorInstalled(config, 'xbox360'),
    gamecube: gc && emulatorInstalled(config, 'gamecube'),
    wii: wii && emulatorInstalled(config, 'wii'),
    dreamcast: dc && emulatorInstalled(config, 'dreamcast'),
    saturn: sat && emulatorInstalled(config, 'saturn'),
    n64: n64 && emulatorInstalled(config, 'n64'),
    nes: nesHas && emulatorInstalled(config, 'nes'),
    snes: snesHas && emulatorInstalled(config, 'snes'),
    genesis: genesisHas && emulatorInstalled(config, 'genesis'),
    sega32x: sega32xHas && emulatorInstalled(config, 'sega32x'),
    amiga: amigaHas && emulatorInstalled(config, 'amiga'),
    wiiu: wiiu && emulatorInstalled(config, 'wiiu'),
    psx: psx && emulatorInstalled(config, 'psx'),
    psp: psp && emulatorInstalled(config, 'psp'),
    arcade: arc && emulatorInstalled(config, 'arcade')
  }
  tabsCache = { at: Date.now(), tabs }
  return tabs
}

/** Runs an install step list, sending each line to the setup window; resolves with an error message or null. */
async function setupRun(
  sender: Electron.WebContents,
  job: (report: (line: string) => void) => Promise<void>,
  channel = 'setup:progress'
): Promise<string | null> {
  const report = (line: string): void => {
    if (!sender.isDestroyed()) sender.send(channel, line)
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
  const loaders = [switchGames, ps2Games, psxGames, pspGames, ps3Games, xboxGames, xbox360Games, gamecubeGames, wiiGames, wiiUGames, dreamcastGames, saturnGames, n64Games, nesGames, snesGames, genesisGames, sega32xGames, amigaGames, arcadeGames]
  for (const load of loaders) {
    const game = (await load(config).catch(() => [])).find((g) => g.id === id)
    if (game) return game
  }
  return undefined
}

/** The game behind a card, for the Artwork window; Steam's own games aren't ours to change. */
async function artTarget(id: string): Promise<{ config: Config; game: EmulatedGame }> {
  const config = await loadConfig()
  const game = await emulatedGame(config, id)
  if (!game) throw new Error("This one's art comes from Steam, not SteamGridDB.")
  return { config, game }
}

async function artGame(id: string): Promise<{ key: string; game: EmulatedGame }> {
  const { config, game } = await artTarget(id)
  if (!config.steamGridDbKey) throw new Error('Add a SteamGridDB key in Settings → Artwork first.')
  return { key: config.steamGridDbKey, game }
}

/** How the web search names each platform: box art for consoles, flyers for arcade boards. */
const WEB_QUERY: Record<string, string> = {
  switch: 'Nintendo Switch box art',
  ps2: 'PS2 box art',
  ps3: 'PS3 box art',
  xbox: 'Original Xbox box art',
  xbox360: 'Xbox 360 box art',
  gamecube: 'GameCube box art',
  wii: 'Wii box art',
  dreamcast: 'Dreamcast box art',
  n64: 'Nintendo 64 box art',
  saturn: 'Sega Saturn box art',
  nes: 'NES box art',
  snes: 'SNES box art',
  genesis: 'Sega Genesis box art',
  sega32x: 'Sega 32X box art',
  amiga: 'Amiga box art',
  wiiu: 'Wii U box art',
  psx: 'PlayStation box art',
  psp: 'PSP box art',
  atomiswave: 'arcade flyer',
  naomi: 'arcade flyer',
  naomi2: 'arcade flyer',
  cps: 'arcade flyer',
  neogeo: 'Neo Geo box art',
  arcade: 'arcade flyer'
}

/** Every app vaporTV knows how to open, in the Apps tab's order. */

/** Home's Favorite Apps: the ones chosen, or the built-in eight until any are. */
function favoriteAppIds(config: Config): string[] {
  return config.favoriteApps ?? home.apps.map((app) => app.id)
}

const RECENTS_TABS: RecentsTab[] = ['home', 'steam', 'switch', 'ps2', 'psx', 'psp', 'ps3', 'xbox', 'xbox360', 'gamecube', 'wii', 'wiiu', 'dreamcast', 'saturn', 'n64', 'nes', 'snes', 'genesis', 'sega32x', 'amiga', 'arcade']

ipcMain.handle('home:get', async (): Promise<HomeData> => {
  const config = await loadConfig()
  fillArt()
  const recents = hasSteam(config) ? await loadRecents(config) : []
  const favorites = favoriteAppIds(config)
  // Tiles and footer icons from SteamGridDB (see appArt); a tile without one shows its name.
  const art = await appArt()
  const icons = Object.fromEntries(Object.entries(art).flatMap(([id, a]) => (a.icon ? [[id, a.icon]] : [])))
  const allApps = await Promise.all(
    appCatalog(config).map(async (app) => ({
      ...app,
      tile: art[app.id]?.wide ?? app.tile,
      favorite: favorites.includes(app.id),
      state: appState(app.id, (await launchUrl(config, 'app', app.id)) !== null)
    }))
  )
  // Home shows only the ones that open; the Apps tab offers to set up the rest.
  const apps = favorites.flatMap((id) => allApps.filter((app) => app.id === id && app.state.ready))
  return {
    recents,
    apps,
    allApps,
    platformLogos: { ...icons, ...home.platformLogos },
    recentsLayout: recentsLayout(config, 'home'),
    favoritesLayout: config.favoritesLayout ?? 'rows'
  }
})
ipcMain.handle('appSetup:install', async (event, id: string) => {
  const config = await loadConfig()
  const app = appCatalog(config).find((a) => a.id === id)
  if (!app) return 'No such app.'
  return setupRun(event.sender, (report) => installForApp(id, app.name, report), 'appSetup:progress')
})
ipcMain.handle('appSetup:addToSteam', async (event, ids: string[]) => {
  const config = await loadConfig()
  return setupRun(
    event.sender,
    async (report) => {
      if (!(await inGamingMode())) throw new Error('Outside Gaming Mode, add apps from the vaporTV setup window (open the AppImage in Desktop Mode).')
      report('Steam is restarting to add them…')
      await addShortcutsWithRestart(config, ids)
    },
    'appSetup:progress'
  )
})
ipcMain.handle('apps:favorite', async (_event, id: string) => {
  const config = await loadConfig()
  if (!appCatalog(config).some((app) => app.id === id)) return false
  const favorites = favoriteAppIds(config)
  const on = !favorites.includes(id)
  await saveConfig({ favoriteApps: on ? [...favorites, id] : favorites.filter((f) => f !== id) })
  return on
})
ipcMain.handle('weather:get', () => getWeather())
ipcMain.handle('location:get', () => locationSettings())
ipcMain.handle('location:search', (_event, query: string) => searchPlaces(query))
ipcMain.handle('location:set', (_event, place: PlaceMatch | null) => setPlace(place))
ipcMain.handle('location:unit', (_event, unit: TemperatureUnit) => setTemperatureUnit(unit))
// Screenshots skip it (STEAMTV_WELCOME=1 shows it, to take one of the tour itself).
/** An app's first moments, when its windows may come and go (see the focus handler). */
const APP_SETTLE_MS = 20_000
/** How long vaporTV must stay in front before an app behind it counts as left. */
const FOCUS_SETTLE_MS = 3000
/** How often to look, while an app vaporTV opened may be running behind it. */
const BEHIND_CHECK_MS = 2500

// Updates: checked a minute after start and every few hours; see updater.ts.
const UPDATE_EVERY_MS = 6 * 60 * 60 * 1000
let update: UpdateInfo | null = null
let updateError: string | null = null

async function updateState(): Promise<UpdateState> {
  const config = await loadConfig()
  return { current: app.getVersion(), enabled: canUpdate(config), update, error: updateError, dismissed: config.updateDismissed ?? null }
}

async function checkUpdates(): Promise<UpdateState> {
  const config = await loadConfig()
  if (canUpdate(config)) {
    const before = update?.version
    try {
      update = await checkForUpdate(config)
      updateError = null
    } catch (err) {
      updateError = err instanceof Error ? err.message : String(err)
    }
    if (update && update.version !== before) win?.webContents.send('update:available', await updateState())
  }
  return updateState()
}

ipcMain.handle('update:get', () => updateState())
ipcMain.handle('update:check', () => checkUpdates())
ipcMain.handle('update:dismiss', (_event, version: string) => saveConfig({ updateDismissed: version }))
ipcMain.handle('update:install', async (event): Promise<string | null> => {
  if (!update) return 'There is no update to install'
  try {
    await installUpdate(await loadConfig(), update, (percent) => event.sender.send('update:progress', percent))
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
  await restartAfterUpdate()
  return null
})

ipcMain.handle('battery:get', () => systemBattery())
ipcMain.handle('system-stats:get', () => systemStats())
ipcMain.handle('clock:get', async () => cleanClockCorners((await loadConfig()).clockCorners))
ipcMain.handle('clock:set', (_event, corners: ClockCorners) => saveConfig({ clockCorners: cleanClockCorners(corners) }))

// No intro in screenshot runs (they want the page as it settles).
ipcMain.handle('intro:get', async () => {
  const settings = await introSettings(await loadConfig())
  return screenshot ? { ...settings, url: null } : settings
})
ipcMain.handle('intro:set', (_event, choice: string) => saveConfig({ introVideo: choice }))
// As vaporTV opens: not straight after Steam played the same intro as its startup movie.
ipcMain.handle('intro:opening', async () => {
  const config = await loadConfig()
  const settings = await introSettings(config)
  if (screenshot || !settings.url) return null
  if (settings.choice === 'default' && (await bootVideoSelected(config)) && (await steamJustStarted())) return null
  return settings.url
})

ipcMain.handle('welcome:seen', async () => !!(await loadConfig()).welcomeSeen || (!!screenshotMode() && !process.env.STEAMTV_WELCOME))
ipcMain.handle('welcome:done', () => saveConfig({ welcomeSeen: true }))
ipcMain.handle('art:search', async (_event, id: string, query?: string) => {
  const { config, game } = await artTarget(id)
  const name = game.artTitle ?? game.title
  const key = config.steamGridDbKey
  return {
    title: game.title,
    webQuery: `${name} ${WEB_QUERY[game.platform] ?? 'cover art'}`,
    // Empty: no search to offer (the public build without a Brave key).
    webSource: config.braveSearchKey ? 'Brave' : EXTRAS ? 'DuckDuckGo' : '',
    libretro: hasLibretroThumbnails(game.platform),
    sgdb: !!key,
    matches: key ? await searchGames(key, query ?? name) : []
  }
})
// Brave's API with a key; otherwise DuckDuckGo, free but unofficial.
ipcMain.handle('art:webSearch', async (_event, query: string) => {
  const config = await loadConfig()
  if (config.braveSearchKey) return searchWebImages(config.braveSearchKey, query)
  if (!EXTRAS) throw new Error('Add a Brave Search API key in Settings → Artwork to search the web.')
  return searchDuckDuckGo(query)
})
ipcMain.handle('art:libretro', async (_event, id: string, query?: string) => {
  const { game } = await artTarget(id)
  return (await libretroCovers(game, query)).map((t) => ({ url: t.url, thumb: t.url, name: t.name }))
})
ipcMain.handle('art:chooseWeb', async (_event, id: string, url: string, thumb?: string) => {
  const { game } = await artTarget(id)
  // Some sites refuse to hand pictures to anything but their own pages: the search's preview will do.
  const png = await webCover(url).catch((err) => (thumb && thumb !== url ? webCover(thumb) : Promise.reject(err)))
  await savePortrait(game.artKey, png, url)
  win?.webContents.send('art:updated')
})
ipcMain.handle('art:covers', async (_event, id: string, gameId: number) => gameCovers((await artGame(id)).key, gameId))
ipcMain.handle('art:choose', async (_event, id: string, gameId: number, cover: string) => {
  const { key, game } = await artGame(id)
  await chooseArt(key, game.artKey, gameId, cover)
  win?.webContents.send('art:updated')
})
ipcMain.handle('art:reset', async (_event, id: string) => {
  const { game } = await artTarget(id)
  await resetArt(game.artKey)
  // Look it up again now, rather than at the next tab load.
  fillArt()
  win?.webContents.send('art:updated')
})
ipcMain.handle('setup:status', () => installStatus())
ipcMain.handle('setup:install', (event, options: InstallOptions) => setupRun(event.sender, (report) => install(options, report)))
ipcMain.handle('setup:uninstall', (event) => setupRun(event.sender, uninstall))
ipcMain.handle('setup:gamingMode', () => returnToGamingMode())
ipcMain.handle('setup:damage', async () => ({ ...(await setupDamage()), dismissed: (await loadConfig()).repairDismissed ?? null }))
ipcMain.handle('setup:repair', (_event, password: string) => repairSetup(password))
ipcMain.handle('setup:dismissRepair', (_event, key: string) => saveConfig({ repairDismissed: key }))
/** Tabs with something in them (Apps always has its list). */
async function tabsWithContent(config: Config): Promise<HideableTab[]> {
  const tabs = await availableTabs(config)
  return ['apps', ...(Object.keys(tabs) as LayoutTab[]).filter((tab) => tabs[tab])]
}

// What the bar and More show: tabs with something in them, less those switched off, where Settings put them.
ipcMain.handle('tabs:available', async (): Promise<TabArrangement> => {
  const config = await loadConfig()
  return arrangeTabs(await tabsWithContent(config), config.tabsHidden ?? [], config.tabLayout)
})
// Settings → Tabs lists the tabs with something in them: where each sits, and those off (in bar order).
// A tab that fits in neither the bar nor More is listed as off too, so it can be swapped in.
ipcMain.handle('tabs:settings', async () => {
  const config = await loadConfig()
  const available = await tabsWithContent(config)
  const hidden = config.tabsHidden ?? []
  const arranged = arrangeTabs(available, hidden, config.tabLayout)
  const placed = new Set([...arranged.bar, ...arranged.more])
  const off = TAB_LIST.map((t) => t.id).filter((t): t is HideableTab => t !== 'home' && available.includes(t) && !placed.has(t))
  return { ...arranged, off }
})
ipcMain.handle('tabs:set', async (_event, arrangement: TabArrangement, off: HideableTab[]) => {
  // Tabs with nothing in them aren't listed, so keep where they were for when they have games.
  const config = await loadConfig()
  const listed = new Set([...arrangement.bar, ...arrangement.more, ...off])
  const kept = (tabs: HideableTab[] | undefined): HideableTab[] => (tabs ?? []).filter((t) => !listed.has(t))
  await saveConfig({
    tabLayout: { bar: [...arrangement.bar, ...kept(config.tabLayout?.bar)], more: [...arrangement.more, ...kept(config.tabLayout?.more)] },
    tabsHidden: [...off, ...kept(config.tabsHidden)]
  })
})
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
    ps2Layout: config.ps2Layout ?? 'rows',
    xboxLayout: config.xboxLayout ?? 'rows',
    ps3Layout: config.ps3Layout ?? 'rows',
    xbox360Layout: config.xbox360Layout ?? 'rows',
    gamecubeLayout: config.gamecubeLayout ?? 'rows',
    wiiLayout: config.wiiLayout ?? 'rows',
    dreamcastLayout: config.dreamcastLayout ?? 'rows',
    n64Layout: config.n64Layout ?? 'rows',
    saturnLayout: config.saturnLayout ?? 'rows',
    nesLayout: config.nesLayout ?? 'rows',
    snesLayout: config.snesLayout ?? 'rows',
    genesisLayout: config.genesisLayout ?? 'rows',
    sega32xLayout: config.sega32xLayout ?? 'rows',
    amigaLayout: config.amigaLayout ?? 'rows',
    wiiuLayout: config.wiiuLayout ?? 'rows',
    psxLayout: config.psxLayout ?? 'rows',
    pspLayout: config.pspLayout ?? 'rows',
    arcadeLayout: config.arcadeLayout ?? 'rows',
    arcadeRowsHidden: config.arcadeRowsHidden ?? [],
    favoritesLayout: config.favoritesLayout ?? 'rows',
    recentsLayouts: Object.fromEntries(RECENTS_TABS.map((tab) => [tab, recentsLayout(config, tab)])) as Record<RecentsTab, SteamLayout>,
    musicTracks: await musicTracks(config),
    playlists: playlists(config),
    ...musicChoices(config),
    musicVolume: config.musicVolume ?? 'medium',
    ambienceVolume: config.ambienceVolume ?? 'medium',
    backdrop: (await backdropChoice(config)).style,
    backdropFile: customBackdropFile(config, await customBackdrops()),
    backdropShuffleOff: config.backdropShuffleOff ?? [],
    customBackdrops: await customBackdrops(),
    backdropTime: config.backdropTime ?? 'auto',
    driftPreset: config.driftPreset ?? DEFAULT_DRIFT_PRESET,
    driftDirection: config.driftDirection ?? 'vertical',
    tunnelColors: config.tunnelColors ?? 'nebula',
    musicFolder: musicFolder(config).replace(homedir(), '~'),
    sleepOnControllerOff: config.sleepOnControllerOff ?? false,
    sleepWarning: config.sleepWarning ?? true,
    controls: resolveControls(config.controls),
    screensaverDelay: config.screensaverDelay ?? DEFAULT_SCREENSAVER_DELAY,
    screensaverStyle: screensaverStyle(config),
    screensaverClock: config.screensaverClock ?? 'moving',
    screensaverDetails: config.screensaverDetails ?? true,
    screensaverSources: screensaverSources(config),
    screensaverFolder: screensaverFolder(config).replace(homedir(), '~'),
    steamGridDbKeyHint: config.steamGridDbKey ? config.steamGridDbKey.slice(-4) : null,
    braveSearchKeyHint: config.braveSearchKey ? config.braveSearchKey.slice(-4) : null
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
ipcMain.handle('settings:braveSearchKey', (_event, key: string) => saveConfig({ braveSearchKey: key.trim() || undefined }))
ipcMain.handle('settings:steamGridDbKey', async (_event, key: string) => {
  await saveConfig({ steamGridDbKey: key.trim() || undefined })
  fillArt()
})

ipcMain.handle('settings:music', async (_event, kind: MusicKind, choice: string | null) => {
  // Saving either layer settles both, so an old rain-as-music choice doesn't come back.
  const choices = { ...musicChoices(await loadConfig()), [kind]: choice }
  return saveConfig({ music: choices.music ?? undefined, ambience: choices.ambience ?? '' })
})
ipcMain.handle('settings:playlists', async (_event, lists: Playlist[]) => {
  const config = await loadConfig()
  // Deleting the playlist that's playing stops the music rather than leaving a choice that plays nothing.
  const playing = config.music?.startsWith(PLAYLIST) && !lists.some((p) => PLAYLIST + p.id === config.music)
  await saveConfig({ playlists: lists, ...(playing ? { music: undefined } : {}) })
})
ipcMain.handle('settings:musicVolume', (_event, kind: MusicKind, volume: MusicVolume) =>
  saveConfig(kind === 'music' ? { musicVolume: volume } : { ambienceVolume: volume })
)
// Adding your own: the browser leaves out vaporTV's own folders (files there are already in).
ipcMain.handle('files:browse', async (_event, dir: string | null, kind: BrowseKind) =>
  browseFiles(dir, kind, kind === 'all' ? [] : [musicFolder(await loadConfig()), BACKDROP_FOLDER])
)
ipcMain.handle('files:open', (_event, path: string) => openFile(path))
ipcMain.handle('files:paste', (event, source: string, folder: string, move: boolean) =>
  pasteFile(source, folder, move, (percent) => {
    if (!event.sender.isDestroyed()) event.sender.send('files:pasteProgress', percent)
  })
)
ipcMain.handle('backdrops:add', (_event, path: string) => addBackdrop(path))
ipcMain.handle('backdrops:remove', (_event, file: string) => removeBackdrop(file))
ipcMain.handle('backdrops:shuffleOff', (_event, files: string[]) => saveConfig({ backdropShuffleOff: files }))
ipcMain.handle('music:add', async (_event, path: string, kind: MusicKind) => importMusic(await loadConfig(), path, kind))
ipcMain.handle('settings:backdropTime', (_event, time: BackdropTime) => saveConfig({ backdropTime: time }))
ipcMain.handle('settings:backdrop', (_event, style: BackdropStyle, file?: string) => saveConfig(file ? { backdrop: style, backdropFile: file } : { backdrop: style }))
ipcMain.handle('settings:driftPreset', (_event, name: string) => saveConfig({ driftPreset: name }))
ipcMain.handle('settings:tunnelColors', (_event, colors: 'nebula' | 'starlight' | 'ice' | 'ember') => saveConfig({ tunnelColors: colors }))
ipcMain.handle('settings:driftDirection', (_event, direction: 'vertical' | 'horizontal') => saveConfig({ driftDirection: direction }))
ipcMain.handle('backdrop:get', async () => {
  const config = await loadConfig()
  const { style, custom } = await backdropChoice(config)
  return { style, custom, time: config.backdropTime ?? 'auto', drift: config.driftPreset ?? DEFAULT_DRIFT_PRESET, driftDirection: config.driftDirection ?? 'vertical', tunnelColors: config.tunnelColors ?? 'nebula' }
})
ipcMain.handle('music:get', async () => currentMusic(await loadConfig()))
ipcMain.handle('music:trackUrl', async (_event, file: string) => trackUrl(await loadConfig(), file))
ipcMain.handle('screensaver:get', async () => screensaverData(await loadConfig()))
ipcMain.handle('screensaver:photoTaken', async (_event, url: string) => photoTaken(await loadConfig(), url))
ipcMain.handle('settings:sleepOnControllerOff', (_event, on: boolean) => saveConfig({ sleepOnControllerOff: on }))
ipcMain.handle('settings:arcadeRowsHidden', (_event, rows: ArcadeRow[]) => saveConfig({ arcadeRowsHidden: rows }))
ipcMain.handle('settings:controls', (_event, controls: Controls) => saveConfig({ controls: resolveControls(controls) }))
ipcMain.handle('settings:sleepWarning', (_event, on: boolean) => saveConfig({ sleepWarning: on }))
ipcMain.handle('settings:screensaverStyle', (_event, style: ScreensaverStyle) => saveConfig({ screensaverStyle: style }))
ipcMain.handle('settings:screensaverClock', (_event, spot: ScreensaverClockSpot) => saveConfig({ screensaverClock: spot }))
ipcMain.handle('settings:screensaverDetails', (_event, on: boolean) => saveConfig({ screensaverDetails: on }))
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
ipcMain.handle('wifi:status', () => wifiStatus())
ipcMain.handle('wifi:enabled', (_event, on: boolean) => setWifiEnabled(on))
ipcMain.handle('wifi:rescan', () => rescanWifi())
ipcMain.handle('wifi:connect', (_event, ssid: string, password?: string) => connectWifi(ssid, password))
ipcMain.handle('wifi:forget', (_event, ssid: string) => forgetWifi(ssid))
ipcMain.handle('bluetooth:status', () => bluetoothStatus())
ipcMain.handle('bluetooth:power', (_event, on: boolean) => setBluetoothPowered(on))
ipcMain.handle('bluetooth:find', () => findBluetoothDevices())
ipcMain.handle('bluetooth:pair', (_event, address: string) => pairBluetooth(address))
ipcMain.handle('bluetooth:connect', (_event, address: string) => connectBluetooth(address))
ipcMain.handle('bluetooth:disconnect', (_event, address: string) => disconnectBluetooth(address))
ipcMain.handle('bluetooth:forget', (_event, address: string) => forgetBluetooth(address))
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
      ;[fillSwitchArt, fillPs2Art, fillPs3Art, fillXboxArt, fillXbox360Art, fillGameCubeArt, fillWiiArt, fillDreamcastArt, fillSaturnArt, fillN64Art, fillNesArt, fillSnesArt, fillGenesisArt, fillSega32xArt, fillAmigaArt, fillWiiUArt, fillPsxArt, fillPspArt, fillArcadeArt].forEach((fill) => fill(config, updated))
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
// Select on a console game: its name, emulator and deleting it (art has its own window).
ipcMain.handle('game:options', async (_event, id: string): Promise<GameOptions> => {
  const config = await loadConfig()
  // The card shows the given name; the options want the name before it too.
  const game = await emulatedGame({ ...config, gameTitles: {} }, id)
  if (!game) throw new Error('Only console games have options here.')
  // The card's art and playtime, for the dialog's picture and header.
  const item = await emulatedItem(game, undefined, false, (await readPlaytime())[id])
  return { ...(await gameOptions(config, id, game.title)), cover: item.cover ?? item.wide, playtime: item.playtime }
})
// What's known about it: year, genre, players, makers, a description.
ipcMain.handle('game:info', async (_event, id: string): Promise<GameInfo | null> => {
  const config = await loadConfig()
  const game = await emulatedGame({ ...config, gameTitles: {} }, id)
  return game ? gameInfo(config, game) : null
})
ipcMain.handle('game:rename', async (_event, id: string, name: string | null) => {
  const config = await loadConfig()
  const names = { ...config.gameTitles }
  if (name?.trim()) names[id] = name.trim()
  else delete names[id]
  await saveConfig({ gameTitles: names })
  win?.webContents.send('art:updated')
})
ipcMain.handle('game:setEmulator', async (_event, id: string, emulator: string) => {
  const config = await loadConfig()
  if (id.startsWith('arcade:')) {
    const cores = { ...config.arcadeGameCores }
    if (emulator) cores[id] = emulator
    else delete cores[id]
    await saveConfig({ arcadeGameCores: cores })
    return
  }
  const emulators = { ...config.gameEmulators }
  if (emulator) emulators[id] = emulator
  else delete emulators[id]
  await saveConfig({ gameEmulators: emulators })
})
ipcMain.handle('game:delete', async (_event, id: string) => {
  const config = await loadConfig()
  await deleteGame(config, id)
  await forgetGame(id)
  const drop = (map: Record<string, string> | undefined): Record<string, string> => Object.fromEntries(Object.entries(map ?? {}).filter(([key]) => key !== id))
  await saveConfig({ gameTitles: drop(config.gameTitles), gameEmulators: drop(config.gameEmulators), arcadeGameCores: drop(config.arcadeGameCores) })
  // The last game of a console takes its tab with it.
  tabsCache = null
  win?.webContents.send('art:updated')
})
ipcMain.handle('arcade-tab:get', async () => {
  const config = await loadConfig()
  fillArt()
  return loadArcadeTab(config)
})
ipcMain.handle('dreamcast-tab:get', async () => {
  const config = await loadConfig()
  fillArt()
  return loadDreamcastTab(config)
})
ipcMain.handle('n64-tab:get', async () => loadN64Tab(await loadConfig()))
ipcMain.handle('saturn-tab:get', async () => loadSaturnTab(await loadConfig()))
ipcMain.handle('nes-tab:get', async () => loadNesTab(await loadConfig()))
ipcMain.handle('snes-tab:get', async () => loadSnesTab(await loadConfig()))
ipcMain.handle('genesis-tab:get', async () => loadGenesisTab(await loadConfig()))
ipcMain.handle('sega32x-tab:get', async () => loadSega32xTab(await loadConfig()))
ipcMain.handle('amiga-tab:get', async () => loadAmigaTab(await loadConfig()))
ipcMain.handle('wiiu-tab:get', async () => loadWiiUTab(await loadConfig()))
ipcMain.handle('psx-tab:get', async () => loadPsxTab(await loadConfig()))
ipcMain.handle('psp-tab:get', async () => loadPspTab(await loadConfig()))
ipcMain.handle('xbox-tab:get', async () => {
  const config = await loadConfig()
  fillArt()
  return loadXboxTab(config)
})
ipcMain.handle('ps2-tab:get', async () => {
  const config = await loadConfig()
  fillArt()
  return loadPs2Tab(config)
})
ipcMain.handle('wii-tab:get', async () => {
  const config = await loadConfig()
  fillArt()
  return loadWiiTab(config)
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
ipcMain.handle('power:sleepBlocker', () => sleepBlocker())
ipcMain.handle('volume:step', (_event, direction: 1 | -1) => stepVolume(direction === 1 ? 1 : -1))

app.whenReady().then(async () => {
  void recordSteamShortcut()
  const config = await loadConfig()
  const root = steamRoot(config)
  // PS3 games' own icons are the fallback when SteamGridDB has no wide art.
  const ps3 = await ps3Folders(config)
  // Local files the page may load: game art, the background-music folder and screensaver photos.
  handleArtScheme(() => [join(root, 'appcache'), join(root, 'userdata'), ART_CACHE, CUSTOM_TILES, ps3.hdd0, ps3.discs, musicFolder(config), INTRO_FOLDER, BACKDROP_FOLDER, ...screensaverFolders(config)], wasOpened)
  if (setupMode) return createWindow()
  if (EXTRAS) startDriveSync()
  createWindow()
  // Select + Start held: close whatever is in front and come back here.
  if (!screenshot) {
    const send = (channel: string, ...args: unknown[]): void => {
      if (win && !win.isDestroyed()) win.webContents.send(channel, ...args)
    }
    const foreground = startHotkey({
      bringBack: () => {
        win?.focus()
        ensureSteamtvInFront(logInput)
      },
      nameFor: launchedName,
      isGame: launchedIsGame,
      onClosing: (name) => send('closing', { active: true, name }),
      onClosed: () => send('closing', { active: false }),
      log: logInput
    })
    // A remote's power button (sleep) and Home (back to vaporTV, as Select + Start).
    // YouTube's TV app (VacuumTube) goes back on Escape only; remotes' Back sends Backspace.
    // Not while vaporTV is in front, where Escape would go back a second time.
    // Menu tapped is voice search (over vaporTV, for now); held, it's Settings.
    startRemoteKeys(logInput, foreground, async () => !win?.isFocused() && (await foreground.runs(/vacuumtube/i)), {
      tap: async () => {
        if (!(await foreground.ownInFront())) return logInput('remote menu: voice search only works over vaporTV for now')
        listen((state, why) => send('voice', state, why), logInput)
      },
      hold: async () => {
        if (await foreground.ownInFront()) send('menu:held')
      }
    })
    watchSteamFocus((away) => {
      logInput(away ? 'steam focus: away' : 'steam focus: back')
      send('steam-focus', away)
    }, logInput)
    // Back in vaporTV some other way (Steam's menu) with an app it opened still running
    // behind: that app is done with, so it's closed rather than left running unseen.
    // Not in an app's first seconds (Kodi's window comes and goes as it starts), and
    // only if vaporTV stays in front a moment. Looked for rather than waited for: Kodi
    // runs in vaporTV's Steam session, and gamescope can switch between the two without
    // vaporTV's window getting a focus event (Kodi was once left running for 50 minutes).
    let inFrontSince = 0
    setInterval(async () => {
      const age = directAppAge()
      if (age === null || age <= APP_SETTLE_MS || !(await foreground.ownInFront())) return void (inFrontSince = 0)
      inFrontSince ||= Date.now()
      if (Date.now() - inFrontSince < FOCUS_SETTLE_MS) return
      inFrontSince = 0
      await foreground.closeAppBehind().catch((err) => logInput(`hotkey: ${err}`))
    }, BEHIND_CHECK_MS)
    // This version's Netflix extension, for Chrome to pick up (see netflixExtension.ts).
    stageNetflixExtension().catch((err) => logInput(`netflix extension: ${err}`))
    setTimeout(checkUpdates, 60_000)
    setInterval(checkUpdates, UPDATE_EVERY_MS)
  }
})
app.on('window-all-closed', () => app.quit())
