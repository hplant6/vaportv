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

export interface AppItem {
  id: string
  name: string
  tile: string
  /** On Home's Favorite Apps (set on the Apps tab's list). */
  favorite?: boolean
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

export interface Weather {
  temperature: number
}

export type LaunchKind = 'recent' | 'app'

/** The power menu's choices. */
export type PowerAction = 'desktop' | 'steam' | 'sleep' | 'poweroff'

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
export type LayoutTab = 'steam' | 'switch' | 'ps3' | 'xbox360' | 'gamecube' | 'dreamcast'

/** Screens with a recently played row, which can be laid out apart from the rest. */
export type RecentsTab = 'home' | 'steam' | 'switch' | 'ps3' | 'xbox360' | 'gamecube' | 'dreamcast'

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
export type BackdropStyle = 'sea' | 'rain'

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
  screensaverSources: ScreensaverSources
  screensaverFolder: string
  /** Last 4 characters of the SteamGridDB key, or null if none is set. */
  steamGridDbKeyHint: string | null
}

/** What the screensaver shows: a slideshow, the backdrop with a big clock, or a clock with the weather. */
export type ScreensaverStyle = 'slideshow' | 'backdrop' | 'clock'

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
}

export interface ScreensaverData {
  /** Minutes of no input before it starts; 0 for never. */
  delayMinutes: number
  style: ScreensaverStyle
  /** For the slideshow, in no particular order (empty for the other styles). */
  photos: ScreensaverPhoto[]
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
  /** The AppImage this window was opened from, if any. */
  running: string | null
  /** The AppImage vaporTV's Steam shortcut runs, if there is one. */
  appImage: string | null
  shortcut: boolean
  autostart: boolean
  wake: boolean
  steamRunning: boolean
}

export interface InstallOptions {
  /** Open vaporTV when Gaming Mode starts. */
  autostart: boolean
  /** Let a controller wake the box (needs the admin password). */
  wake: boolean
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
  /** Power menu: exit to desktop or Steam, sleep, power off. Resolves false if it couldn't. */
  power(action: PowerAction): Promise<boolean>
  /** Raises (1) or lowers (-1) the system volume a step; the new level (0–100), or null if it couldn't. */
  stepVolume(direction: 1 | -1): Promise<{ level: number; muted: boolean } | null>
  getSettings(): Promise<Settings>
  /** Artwork window for console games: SteamGridDB matches, covers, and choosing one by hand. */
  art: {
    search(id: string, query?: string): Promise<{ title: string; matches: { id: number; name: string; year?: number }[] }>
    covers(id: string, gameId: number): Promise<{ url: string; thumb: string }[]>
    choose(id: string, gameId: number, cover: string): Promise<void>
    reset(id: string): Promise<void>
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
  /** Adds or removes a Switch game from Favorites; resolves with whether it's now a favourite. */
  toggleFavorite(id: string): Promise<boolean>
  /** Calls back when new art has been downloaded; returns an unsubscribe. */
  onArtUpdated(callback: () => void): () => void
  setSteamCollections(ids: string[]): Promise<void>
  /** Rows or grid for a library tab. */
  setTabLayout(tab: LayoutTab, layout: SteamLayout): Promise<void>
  setRecentsLayout(tab: RecentsTab, layout: SteamLayout): Promise<void>
  setFavoritesLayout(layout: SteamLayout): Promise<void>
  setSteamGridDbKey(key: string): Promise<void>
  setMusic(file: string | null): Promise<void>
  setMusicVolume(volume: MusicVolume): Promise<void>
  getBackdrop(): Promise<{ style: BackdropStyle; time: BackdropTime }>
  setBackdrop(style: BackdropStyle): Promise<void>
  setBackdropTime(time: BackdropTime): Promise<void>
  /** The background track to play (null for none) and its volume. */
  getMusic(): Promise<{ url: string | null; volume: number }>
  getScreensaver(): Promise<ScreensaverData>
  setScreensaverDelay(minutes: number): Promise<void>
  setScreensaverStyle(style: ScreensaverStyle): Promise<void>
  setScreensaverSources(sources: ScreensaverSources): Promise<void>
  setSleepOnControllerOff(on: boolean): Promise<void>
  /** Saves the button for each action (Settings → Controller). */
  setControls(controls: Controls): Promise<void>
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
  /** Appends a line to ~/.cache/steamtv/input.log. */
  logInput(line: string): void
}
