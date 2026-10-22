import type { ArcadeRow } from './arcade'
import type { Controls } from './controls'
import type { SunTimes } from './sun'

export interface RecentItem {
  id: string
  title: string
  platform: string
  /** ISO date (YYYY-MM-DD); missing if never played. */
  lastPlayed?: string
  /** Portrait art. */
  cover?: string
  /** 16:9 art; an item with this and no `cover` (a YouTube video) gets a wide card. */
  wide?: string
  /** Marked as a favourite in steamtv (shows a star). */
  favorite?: boolean
}

/** The cores an arcade game can open in. */
export interface ArcadeCores {
  title: string
  /** What it opens in now. */
  current: string
  /** Its board's usual core. */
  defaultCore: string
  /** Installed cores that run its board, the default first. */
  choices: { id: string; name: string }[]
}

export interface AppItem {
  id: string
  name: string
  tile: string
  /** On Home's Favorite Apps (set on the Apps tab's list). */
  favorite?: boolean
  /** Whether it opens on this box, and if not how it's set up (the Apps tab's list). */
  state?: AppState
}

/**
 * An app tile's readiness. setup: 'install' a Flathub program; 'web' a streaming site
 * (Chrome, plus a Steam shortcut); 'emudeck' comes with EmuDeck; 'shortcut' only by
 * adding a Steam shortcut by hand.
 */
export interface AppState {
  ready: boolean
  setup?: 'install' | 'web' | 'emudeck' | 'shortcut'
  /** For 'install': the program installed (the YouTube tile installs VacuumTube). */
  program?: string
}

export interface HomeData {
  recents: RecentItem[]
  /** Favorite Apps on Home, in the order they were added. */
  apps: AppItem[]
  /** Every app, for the Apps tab, favorites marked. */
  allApps: AppItem[]
  platformLogos: Record<string, string>
  recentsLayout: SteamLayout
  /** Favorite Apps: one sideways row ('rows') or the grid. */
  favoritesLayout: SteamLayout
}

export type TemperatureUnit = 'auto' | 'fahrenheit' | 'celsius'

/** Where the weather is for (Settings → General). */
export interface LocationSettings {
  /** e.g. "Riverside, California"; null if not known yet. */
  place: string | null
  /** Picked in Settings, rather than guessed from the internet connection. */
  chosen: boolean
  unit: TemperatureUnit
}

export interface PlaceMatch {
  name: string
  latitude: number
  longitude: number
  /** ISO country code: decides °F or °C when the unit is automatic. */
  country?: string
}

export interface Weather {
  temperature: number
}

export type LaunchKind = 'recent' | 'app'

/** The power menu's choices. */
export type PowerAction = 'desktop' | 'steam' | 'sleep' | 'restart' | 'poweroff'

export interface SteamCollection {
  id: string
  name: string
  /** Dynamic collections are Steam filters (e.g. "Installed locally") rather than a fixed list. */
  dynamic: boolean
  /** False for dynamic collections whose filter steamtv can't apply. */
  supported: boolean
  /** Games in it: all of a hand-picked list, installed matches of a filter; null if unsupported. */
  count: number | null
}

export interface CollectionRow {
  id: string
  name: string
  /** Installed games in the collection. */
  items: RecentItem[]
  /** Games in the collection that aren't installed (not shown). */
  notInstalled: number
  /** Small help text beside the title, e.g. which button favourites a game. */
  hint?: string
}

/** Rows: a sideways-scrolling row of poster cards per collection. Grid: wide cards, scrolling down. */
export type SteamLayout = 'rows' | 'grid'

/** Library tabs with their own layout setting. */
export type LayoutTab = 'steam' | 'switch' | 'ps3' | 'xbox360' | 'gamecube' | 'dreamcast' | 'arcade'

/** Screens with a recently played row, which can be laid out apart from the rest. */
export type RecentsTab = 'home' | 'steam' | 'switch' | 'ps3' | 'xbox360' | 'gamecube' | 'dreamcast' | 'arcade'

/** A library tab (Steam, Switch): sections of games and how to lay them out. */
export interface LibraryTab {
  layout: SteamLayout
  /** For the "Recently played" row, which can differ from the others. */
  recentsLayout: SteamLayout
  rows: CollectionRow[]
}

export interface MusicTrack {
  /** Path relative to the music folder; what's saved. */
  file: string
  /** Shown in Settings. */
  name: string
}

export type MusicVolume = 'low' | 'medium' | 'high'

/** The backdrop's time of day: following the clock, or held at one moment. */
export type BackdropTime = 'auto' | 'dawn' | 'day' | 'sunset' | 'night'

/** Which animated backdrop is drawn behind every screen. */
export type BackdropStyle = 'sea' | 'rain' | 'drift' | 'waves' | 'tunnel'

export interface Settings {
  /** Every Steam collection, Favorites first. */
  collections: SteamCollection[]
  /** Ids of the collections shown on the Steam tab. */
  steamCollections: string[]
  steamLayout: SteamLayout
  switchLayout: SteamLayout
  ps3Layout: SteamLayout
  xbox360Layout: SteamLayout
  gamecubeLayout: SteamLayout
  dreamcastLayout: SteamLayout
  arcadeLayout: SteamLayout
  /** Arcade tab carousels turned off. */
  arcadeRowsHidden: ArcadeRow[]
  /** Each screen's Recents layout (by default, its tab's layout; Rows on Home). */
  recentsLayouts: Record<RecentsTab, SteamLayout>
  favoritesLayout: SteamLayout
  /** Audio files in the music folder. */
  musicTracks: MusicTrack[]
  /** Chosen background track (relative file), or null for none. */
  music: string | null
  musicVolume: MusicVolume
  backdrop: BackdropStyle
  backdropTime: BackdropTime
  /** Gradient Drift's colours: a preset name, or 'random' for a new one each start. */
  driftPreset: string
  /** Which way Gradient Drift's glass ribs run. */
  driftDirection: 'vertical' | 'horizontal'
  /** Star Tunnel's colours. */
  tunnelColors: 'nebula' | 'starlight' | 'ice' | 'ember'
  /** Where music is read from, for the hint in Settings. */
  musicFolder: string
  /** Switching the controller off puts the box to sleep (while vaporTV is on screen). */
  sleepOnControllerOff: boolean
  /** With sleepOnControllerOff: a few seconds' warning first, cancelled by switching it back on. */
  sleepWarning: boolean
  /** What each controller button does. */
  controls: Controls
  /** Screensaver delay in minutes (0 = off), and where it reads photos. */
  screensaverDelay: number
  screensaverStyle: ScreensaverStyle
  screensaverClock: ScreensaverClockSpot
  /** Your photos' date and album shown over them in the slideshow. */
  screensaverDetails: boolean
  screensaverSources: ScreensaverSources
  screensaverFolder: string
  /** Last 4 characters of the SteamGridDB key, or null if none is set. */
  steamGridDbKeyHint: string | null
  /** Last 4 characters of the Brave Search API key, or null if none is set. */
  braveSearchKeyHint: string | null
}

/** What the screensaver shows: a slideshow, the backdrop with a big clock, or a clock with the weather. */
export type ScreensaverStyle = 'slideshow' | 'backdrop' | 'clock'

/** Where the big clock sits (backdrop and clock styles): moving every minute so it can't burn in, or held still. */
export type ScreensaverClockSpot = 'moving' | 'topLeft' | 'center'

/** Which pictures the slideshow mixes together. */
export interface ScreensaverSources {
  /** Hero banners of your Steam and emulated games. */
  gameArt: boolean
  /** Screenshots taken in Steam. */
  screenshots: boolean
  /** Your screensaver folder, and anything add-ons sync into it. */
  photos: boolean
}

export interface ScreensaverPhoto {
  url: string
  kind: 'art' | 'screenshot' | 'photo'
  /** Game name, shown small over game art and screenshots. */
  caption?: string
  /** The game's logo, shown instead of the caption where there is one. */
  logo?: string
  /** Your photos: the folder it's in, and when it was taken (ISO date) if its folder's index says. */
  album?: string
  taken?: string
}

export interface ScreensaverData {
  /** Minutes of no input before it starts; 0 for never. */
  delayMinutes: number
  style: ScreensaverStyle
  clockSpot: ScreensaverClockSpot
  /** Show your photos' date and album. */
  photoDetails: boolean
  /** For the slideshow, in no particular order (empty for the other styles). */
  photos: ScreensaverPhoto[]
}

export interface BluetoothDevice {
  address: string
  name: string
  kind: 'audio' | 'controller' | 'keyboard' | 'mouse' | 'phone' | 'other'
  paired: boolean
  connected: boolean
}

export interface BluetoothStatus {
  /** There's a Bluetooth adapter. */
  available: boolean
  powered: boolean
  /** Find devices is searching. */
  scanning: boolean
  /** What's under way for one device ("Pairing…"). */
  busy: { address: string; doing: string } | null
  /** Paired devices, and while searching, ones found nearby. */
  devices: BluetoothDevice[]
}

export interface WifiNetwork {
  ssid: string
  /** 0-100 */
  signal: number
  /** Needs a password. */
  secure: boolean
  /** Joined before: connects without asking. */
  saved: boolean
  connected: boolean
}

export interface WifiStatus {
  /** There's a Wi-Fi adapter. */
  available: boolean
  enabled: boolean
  /** Connected by cable too. */
  wired: boolean
  busy: { ssid: string; doing: string } | null
  networks: WifiNetwork[]
}

export interface GooglePhotosStatus {
  /** The add-on is set up (a Google client in config.json). */
  enabled: boolean
  signedIn: boolean
  /** The sign-in includes Drive (sign-ins from before the Drive sync need redoing). */
  driveAllowed: boolean
  /** Photos saved from Google Photos so far. */
  photoCount: number
}

export interface GoogleDriveStatus {
  /** The folder being mirrored (or looked for). */
  folderName: string
  /** Whether it was found at the last sync; null before the first. */
  found: boolean | null
  photoCount: number
  /** When the last sync finished (ms since epoch), or null. */
  lastSync: number | null
  syncing: boolean
  error: string | null
}

export interface DriveFolder {
  id: string
  name: string
  /** Recently changed (backed-up PC folders show up here), top of My Drive, or shared with you. */
  where: 'recent' | 'mine' | 'shared'
}

export interface GooglePhotosProgress {
  state: 'downloading' | 'done' | 'failed'
  done: number
  total: number
  error?: string
}

/** What's set up, as the Desktop Mode setup window sees it. */
export interface InstallStatus {
  /** Every app tile and whether it opens here yet. */
  apps: { id: string; name: string; state: AppState }[]
  /** The AppImage this window was opened from, if any. */
  running: string | null
  /** The AppImage vaporTV's Steam shortcut runs, if there is one. */
  appImage: string | null
  shortcut: boolean
  autostart: boolean
  wake: boolean
  /** Chrome's policy for vaporTV for Netflix is in place. */
  netflix: boolean
  /** Steam's startup movie is vaporTV's intro. */
  bootVideo: boolean
  steamRunning: boolean
}

/** Settings → General → Intro, and what the intro plays. */
export interface IntroSettings {
  /** 'off', 'default' (vaporTV's own) or a file in the intro folder. */
  choice: string
  /** What to play (page-relative or a local-file URL), or null for none. */
  url: string | null
  choices: { id: string; name: string }[]
  /** Where your own intros go, for Settings to say (with ~ for home). */
  folder: string
}

/** A newer vaporTV on GitHub, with what changed in each release since this one. */
export interface UpdateInfo {
  current: string
  version: string
  /** The AppImage's size in bytes. */
  size: number
  /** Newest first: each release's notes (Markdown, from CHANGELOG.md). */
  notes: { version: string; date: string | null; body: string }[]
}

/** Settings and the update window's view of updates. */
export interface UpdateState {
  current: string
  /** False in builds that don't update themselves (the author's, with extras). */
  enabled: boolean
  update: UpdateInfo | null
  /** The last check failed: why. */
  error: string | null
  dismissed: string | null
}

export interface InstallOptions {
  /** Open vaporTV when Gaming Mode starts. */
  autostart: boolean
  /** Let a controller wake the box (needs the admin password). */
  wake: boolean
  /** Make vaporTV's intro Steam's startup movie. */
  bootVideo: boolean
  /** Apps to set up as well (ids): installed from Flathub, websites added to Steam. */
  apps: string[]
}

export interface SteamTvApi {
  getHome(): Promise<HomeData>
  getWeather(): Promise<Weather | null>
  /** Today's sunrise/sunset for the configured location, or null when none is set. */
  getSunTimes(): Promise<SunTimes | null>
  /** Resolves false when there is nothing on this box to launch for the item. */
  launch(kind: LaunchKind, id: string, name?: string): Promise<boolean>
  /** Select + Start is closing an app (name if known), then done; returns an unsubscribe. */
  onClosing(callback: (state: { active: boolean; name?: string }) => void): () => void
  /** Closes steamtv; under Steam this returns to Gaming Mode. */
  quit(): Promise<void>
  /** Power menu: exit to desktop or Steam, sleep, restart, power off. Resolves false if it couldn't. */
  power(action: PowerAction): Promise<boolean>
  /** Why the box must stay awake (something holds a sleep block, e.g. a long copy), or null. */
  sleepBlocker(): Promise<string | null>
  /** Raises (1) or lowers (-1) the system volume a step; the new level (0–100), or null if it couldn't. */
  stepVolume(direction: 1 | -1): Promise<{ level: number; muted: boolean } | null>
  getSettings(): Promise<Settings>
  /** Artwork window for console games: SteamGridDB matches, covers, and choosing one by hand. */
  art: {
    /** SteamGridDB's matches (none without its key), and the web search to offer. */
    search(
      id: string,
      query?: string
    ): Promise<{
      title: string
      webQuery: string
      /** Who answers "Search the web": Brave (with a key) or DuckDuckGo. */
      webSource: string
      /** Whether the libretro thumbnails cover this platform. */
      libretro: boolean
      /** Whether a SteamGridDB key is set (no key: no matches). */
      sgdb: boolean
      matches: { id: number; name: string; year?: number }[]
    }>
    /** Web image search results. */
    webSearch(query: string): Promise<{ url: string; thumb: string; width?: number; height?: number; source?: string }[]>
    /** libretro thumbnail box art whose names match the game (or `query`). */
    libretro(id: string, query?: string): Promise<{ url: string; thumb: string; name: string }[]>
    /** Uses a picture (cropped to a cover) as the game's cover; `thumb` if the full one won't download. */
    chooseWeb(id: string, url: string, thumb?: string): Promise<void>
    covers(id: string, gameId: number): Promise<{ url: string; thumb: string }[]>
    choose(id: string, gameId: number, cover: string): Promise<void>
    reset(id: string): Promise<void>
  }
  /** Start on an arcade game: which RetroArch core it opens in. */
  arcadeCores: {
    get(id: string): Promise<ArcadeCores>
    /** Saves the game's core (null: its board's default); resolves with the core's name. */
    set(id: string, core: string | null): Promise<string>
  }
  /** Desktop Mode setup. Install and uninstall resolve with an error message, or null when done. */
  setup: {
    status(): Promise<InstallStatus>
    install(options: InstallOptions): Promise<string | null>
    uninstall(): Promise<string | null>
    gamingMode(): Promise<void>
    onProgress(callback: (line: string) => void): () => void
  }
  /** Which optional tabs have something to show (no Steam, or no games for a console, hides it). */
  getAvailableTabs(): Promise<Record<LayoutTab, boolean>>
  /** The Steam tab: the collections chosen in Settings, and how to lay them out. */
  getSteamTab(): Promise<LibraryTab>
  /** The Switch tab: Ryujinx games found on the ROM drive. */
  getSwitchTab(): Promise<LibraryTab>
  /** The PS3 tab: RPCS3 games, installed and disc. */
  getPs3Tab(): Promise<LibraryTab>
  /** The Xbox 360 tab: Xenia disc images. */
  getXbox360Tab(): Promise<LibraryTab>
  /** The GameCube tab: Dolphin disc images. */
  getGameCubeTab(): Promise<LibraryTab>
  /** The Dreamcast tab: Flycast disc images. */
  getDreamcastTab(): Promise<LibraryTab>
  /** The Arcade tab: ROM sets from the Atomiswave, NAOMI, CPS, Neo Geo and arcade folders. */
  getArcadeTab(): Promise<LibraryTab>
  /** Adds or removes a Switch game from Favorites; resolves with whether it's now a favourite. */
  toggleFavorite(id: string): Promise<boolean>
  /** Calls back when new art has been downloaded; returns an unsubscribe. */
  onArtUpdated(callback: () => void): () => void
  setSteamCollections(ids: string[]): Promise<void>
  /** Rows or grid for a library tab. */
  setTabLayout(tab: LayoutTab, layout: SteamLayout): Promise<void>
  setRecentsLayout(tab: RecentsTab, layout: SteamLayout): Promise<void>
  setFavoritesLayout(layout: SteamLayout): Promise<void>
  setBraveSearchKey(key: string): Promise<void>
  setSteamGridDbKey(key: string): Promise<void>
  setMusic(file: string | null): Promise<void>
  setMusicVolume(volume: MusicVolume): Promise<void>
  getBackdrop(): Promise<{
    style: BackdropStyle
    time: BackdropTime
    drift: string
    driftDirection: 'vertical' | 'horizontal'
    tunnelColors: 'nebula' | 'starlight' | 'ice' | 'ember'
  }>
  setBackdrop(style: BackdropStyle): Promise<void>
  setDriftPreset(name: string): Promise<void>
  setDriftDirection(direction: 'vertical' | 'horizontal'): Promise<void>
  setTunnelColors(colors: 'nebula' | 'starlight' | 'ice' | 'ember'): Promise<void>
  setBackdropTime(time: BackdropTime): Promise<void>
  /** The background track to play (null for none) and its volume. */
  getMusic(): Promise<{ url: string | null; volume: number }>
  getScreensaver(): Promise<ScreensaverData>
  setScreensaverDelay(minutes: number): Promise<void>
  setScreensaverStyle(style: ScreensaverStyle): Promise<void>
  setScreensaverClock(spot: ScreensaverClockSpot): Promise<void>
  setScreensaverDetails(on: boolean): Promise<void>
  /** When a screensaver photo (by URL) was taken, from its EXIF; null if unknown. */
  photoTaken(url: string): Promise<string | null>
  setScreensaverSources(sources: ScreensaverSources): Promise<void>
  setSleepOnControllerOff(on: boolean): Promise<void>
  /** Saves the button for each action (Settings → Controller). */
  setControls(controls: Controls): Promise<void>
  /** Saves which Arcade tab carousels are turned off. */
  setArcadeRowsHidden(rows: ArcadeRow[]): Promise<void>
  location: {
    get(): Promise<LocationSettings>
    search(query: string): Promise<PlaceMatch[]>
    /** A place, or null to guess from the internet connection again. */
    set(place: PlaceMatch | null): Promise<void>
    setUnit(unit: TemperatureUnit): Promise<void>
  }
  /** The intro video as vaporTV opens. */
  intro: {
    get(): Promise<IntroSettings>
    /** What to play as vaporTV opens: none just after Steam has played it as its startup movie. */
    opening(): Promise<string | null>
    set(choice: string): Promise<void>
  }
  /** Updates from GitHub Releases. */
  updates: {
    get(): Promise<UpdateState>
    /** Asks GitHub now. */
    check(): Promise<UpdateState>
    /** Downloads and installs the update, then restarts vaporTV; resolves with an error message if it fails. */
    install(): Promise<string | null>
    /** Later: the window doesn't open by itself again for this version. */
    dismiss(version: string): Promise<void>
    /** A newer version was found (by the check vaporTV runs every few hours). */
    onAvailable(callback: (state: UpdateState) => void): () => void
    /** Download progress, in whole percents. */
    onProgress(callback: (percent: number) => void): () => void
  }
  /** The first-start welcome tour: whether it's been shown, and marking it shown. */
  welcome: {
    seen(): Promise<boolean>
    done(): Promise<void>
  }
  /** Setting up an app tile that doesn't open yet. */
  appSetup: {
    /** Installs what it needs from Flathub; resolves with an error message, or null when done. */
    install(id: string): Promise<string | null>
    /** Websites (ids) to add to Steam, closing and reopening Steam; resolves with an error, or null. */
    addToSteam(ids: string[]): Promise<string | null>
    onProgress(callback: (line: string) => void): () => void
  }
  /** Adds an app to Home's Favorite Apps or takes it off; resolves with whether it's now a favorite. */
  toggleFavoriteApp(id: string): Promise<boolean>
  setSleepWarning(on: boolean): Promise<void>
  /** Google Photos add-on (screensaver photos). */
  googlePhotos: {
    status(): Promise<GooglePhotosStatus>
    /** Opens Google sign-in on the TV; resolves whether it worked. */
    signIn(): Promise<boolean>
    signOut(): Promise<void>
    /** Starts choosing photos on a phone: a QR code for it, then progress through onProgress. */
    pick(): Promise<{ qr: string; url: string } | { error: string }>
    cancel(): Promise<void>
    clear(): Promise<void>
    onProgress(callback: (progress: GooglePhotosProgress) => void): () => void
  }
  /** Google Drive folder sync (screensaver photos), part of the same add-on and sign-in. */
  googleDrive: {
    status(): Promise<GoogleDriveStatus>
    folders(): Promise<DriveFolder[]>
    /** Another folder, or null for the default "vaporTV Screensaver" one. */
    choose(folder: DriveFolder | null): Promise<void>
    syncNow(): Promise<void>
  }
  /** Settings → Bluetooth. Each action rejects with a message to show if it fails. */
  bluetooth: {
    status(): Promise<BluetoothStatus>
    setPowered(on: boolean): Promise<void>
    /** Searches for about 30 seconds; what it finds turns up in status(). */
    find(): Promise<void>
    pair(address: string): Promise<void>
    connect(address: string): Promise<void>
    disconnect(address: string): Promise<void>
    forget(address: string): Promise<void>
  }
  /** Settings → Wi-Fi. Each action rejects with a message to show if it fails. */
  wifi: {
    status(): Promise<WifiStatus>
    setEnabled(on: boolean): Promise<void>
    rescan(): Promise<void>
    /** A saved network without `password`; a new one (or a new password) with it. */
    connect(ssid: string, password?: string): Promise<void>
    forget(ssid: string): Promise<void>
  }
  /** Appends a line to ~/.cache/steamtv/input.log. */
  logInput(line: string): void
}
