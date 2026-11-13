import type { ArcadeRow } from './arcade'
import type { Controls } from './controls'
import type { SunTimes } from './sun'

export interface RecentItem {
  id: string
  title: string
  platform: string
  /** ISO date (YYYY-MM-DD); missing if never played. */
  lastPlayed?: string
  /** Total time played, in minutes, where it's known (Steam's count, or vaporTV's for what it launches). */
  playtime?: number
  /** Portrait art. */
  cover?: string
  /** 16:9 art; an item with this and no `cover` (a YouTube video) gets a wide card. */
  wide?: string
  /** Marked as a favourite in steamtv (shows a star). */
  favorite?: boolean
  /** A console tab's games, for its left bar: main genre and release year (from ES-DE's scraped data), and when its file was added (ms). */
  genre?: string
  year?: number
  added?: number
  /** A film, show or episode from a media server (in a playlist): drawn and played as one, not as a game. */
  media?: MediaItem
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

/** Which kind of media server: they share Continue watching and the player. */
export type MediaKind = 'emby' | 'jellyfin'

/** A media server found on the network, or at an address typed in. */
export interface MediaServer {
  kind: MediaKind
  url: string
  id: string
  name: string
}

/** A server signed in to, as Settings lists it. */
export interface MediaAccountInfo {
  key: string
  kind: MediaKind
  serverName: string
  userName: string
  url: string
}

/** A film or episode in Continue watching. */
export interface MediaItem {
  /** The account it's from (MediaAccountInfo.key). */
  source: string
  id: string
  /** The film, or the episode's show. */
  title: string
  /** An episode's "S2 · E5 · Name", a film's year. */
  subtitle: string
  /** A 16:9 picture: the episode's still, or a backdrop. */
  wide?: string
  /** A poster: the film's, or the show's. */
  cover?: string
  /** How far in, 0–1. */
  progress: number
  remainingMinutes?: number
  lastPlayed?: string
  /** A film plays, an episode plays, a show opens its seasons. */
  kind: 'movie' | 'episode' | 'series' | 'video'
  /** Watched all the way (a show: every episode). */
  watched?: boolean
  /** A show's episodes not yet watched. */
  unwatched?: number
  /** When it came to the server (ISO), its release (ISO), and its community rating. */
  added?: string
  released?: string
  rating?: number
  /** Marked favourite on the server (Y). */
  favorite?: boolean
  /** The details panel's (Start): its summary, genres and age rating. */
  overview?: string
  genres?: string[]
  officialRating?: string
  /** An episode's own name and number, its season, and its length (the show page lists them). */
  episodeName?: string
  episodeNumber?: number
  seasonId?: string
  runtimeMinutes?: number
}

/** A show's page: what it is, its seasons, and the episode to watch next. */
export interface MediaShow {
  source: string
  id: string
  title: string
  /** "2016–2022", or the year it began. */
  years?: string
  overview?: string
  backdrop?: string
  seasons: { id: string; name: string; unwatched?: number }[]
  /** The next episode not yet watched (the season it's in opens first, the cursor on it). */
  next?: MediaItem
}

/** A library on a media server (Movies, TV Shows…), as the Media tab's bar lists it. */
export interface MediaLibrary {
  /** The account it's on. */
  source: string
  id: string
  /** As the server names it; with several servers, its server's name after it. */
  name: string
  /** The server's kind of library: movies, tvshows, homevideos… (none: mixed). */
  type?: string
}

/** Sort's orders on the Media tab. */
export type MediaSort = 'name' | 'added' | 'released' | 'played' | 'rating'

/** A page of a library: its titles from `start`, and how many there are in all. */
export interface MediaPage {
  items: MediaItem[]
  total: number
}

/** The Media tab's top lists, from every server, merged. */
export interface MediaLists {
  continueWatching: MediaItem[]
  nextUp: MediaItem[]
  recentlyAdded: MediaItem[]
  favorites: MediaItem[]
}

/** Audio and subtitle tracks picked (subtitle -1: none); unset, the server's defaults. */
export interface MediaChoice {
  audio?: number
  subtitle?: number
}

/** How to play a media server's item, and what to tell the server about it. */
export interface MediaPlayback {
  /** The account it's from. */
  source: string
  itemId: string
  mediaSourceId: string
  playSessionId: string
  method: 'DirectPlay' | 'Transcode'
  url: string
  /** An HLS playlist (the server converting it), played through hls.js; otherwise the file itself. */
  hls: boolean
  title: string
  subtitle: string
  backdrop?: string
  startSeconds: number
  durationSeconds?: number
  /** Its audio and subtitle tracks, by Emby's stream index, and the ones playing (subtitle -1: none). */
  audioTracks: { index: number; name: string }[]
  subtitleTracks: { index: number; name: string }[]
  audio?: number
  subtitleIndex: number
  /** The subtitles chosen, as WebVTT, when they're text (picture ones are burned into the video instead). */
  subtitleUrl?: string
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
  /** Your game playlists that have games to show, each a row under Favorite Apps. */
  playlists: PlaylistRow[]
}

/** Where a game playlist shows: as a row on Home, or in a tab's left bar (a console's, Steam's, Arcade's). */
export type PlaylistPlace = 'home' | LayoutTab

/** A game playlist as stored: games from any console or Steam, by id, in the order added. */
export interface GamePlaylist {
  id: string
  name: string
  items: string[]
  /** Where it shows, in no set order; missing (playlists made before there was a choice) is Home only. */
  showOn?: PlaylistPlace[]
}

/** A game playlist with its games as cards (the ones vaporTV can find now). */
export interface PlaylistRow {
  id: string
  name: string
  items: RecentItem[]
  /** Where it shows (never empty). */
  showOn: PlaylistPlace[]
}

/** A playlist as the game menu lists it: whether this game is in it. */
export interface PlaylistChoice {
  id: string
  name: string
  count: number
  has: boolean
  /** Where it shows (never empty). */
  showOn: PlaylistPlace[]
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
  /** Null when it couldn't be fetched and there's no recent one to show (the town still is). */
  temperature: number | null
  unit: 'fahrenheit' | 'celsius'
  /** The town it's for, e.g. "Long Beach"; absent if not known. */
  city?: string
}

/**
 * What a corner of the top bar can show (Settings → Home), after Henry's Figma set. Each
 * corner holds a row of them, in order.
 */
export type ClockWidget = 'dateTemp' | 'time' | 'date' | 'weather' | 'cpuUsage' | 'cpuTemp' | 'gpuUsage' | 'gpuTemp' | 'battery'

export interface ClockCorners {
  left: ClockWidget[]
  right: ClockWidget[]
  /** The CPU and GPU temperatures' unit, apart from the weather's. */
  sensorUnit: 'celsius' | 'fahrenheit'
}

/** The box's load and temperatures (°C); null where it can't be read (e.g. not on Linux). */
export interface SystemStats {
  cpuUsage: number | null
  cpuTemp: number | null
  gpuUsage: number | null
  gpuTemp: number | null
}

export type LaunchKind = 'recent' | 'app'

/** What only the page knows for a bug report (Settings → General → Report a problem). */
export interface BugReportInput {
  /** WebGL's name for the GPU. */
  gpu?: string
  /** The connected controllers' names. */
  controllers: string[]
  /** e.g. "3840×2160" */
  display: string
}

/** The report as a GitHub new-issue link and its QR code; logLines says how many log lines fit. */
export interface BugReport {
  url: string
  qr: string
  logLines: number
}

/** What voice is listening for: a search (a few words, the library's names expected) or dictation (sentences). */
export type VoicePurpose = 'search' | 'dictation'

/** Voice search, as it goes: the model downloading (first use), listening, working out the words, then the words or why not. */
export type VoiceState =
  | { phase: 'starting' }
  | { phase: 'preparing' }
  | { phase: 'listening' }
  | { phase: 'thinking' }
  | { phase: 'heard'; text: string }
  | { phase: 'error'; message: string }

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
export type LayoutTab = 'steam' | 'media' | 'switch' | 'ps2' | 'psx' | 'psp' | 'ps3' | 'xbox' | 'xbox360' | 'gamecube' | 'wii' | 'wiiu' | 'dreamcast' | 'saturn' | 'n64' | 'nes' | 'snes' | 'genesis' | 'sega32x' | 'neogeo' | 'arcade'
/** Tabs that can be switched off in Settings (Home always shows). */
export type HideableTab = LayoutTab | 'apps'
/** Where the tabs go, in order: the top bar (after Home) and More's row. */
export type TabArrangement = { bar: HideableTab[]; more: HideableTab[] }

/** Screens with a recently played row, which can be laid out apart from the rest. */
export type RecentsTab = 'home' | 'steam' | 'switch' | 'ps2' | 'psx' | 'psp' | 'ps3' | 'xbox' | 'xbox360' | 'gamecube' | 'wii' | 'wiiu' | 'dreamcast' | 'saturn' | 'n64' | 'nes' | 'snes' | 'genesis' | 'sega32x' | 'neogeo' | 'arcade'

/** A library tab (Steam, Switch): sections of games and how to lay them out. */
/** Select on a console game: the game options window. */
export interface EmulatorChoice {
  /** A RetroArch core's name (`swanstation`), or '' for the console's own default. */
  id: string
  name: string
}

export interface GameOptions {
  title: string
  /** The name before any rename. */
  originalTitle: string
  renamed: boolean
  emulators: EmulatorChoice[]
  /** The choice in use ('' = the default). */
  emulator: string
  /** What Delete removes. */
  files: { count: number; bytes: number }
  /** Its card's art: the cover, else the wide picture. */
  cover?: string
  /** Minutes vaporTV has timed it running; missing if never played. */
  playtime?: number
  /** ISO date (YYYY-MM-DD); missing if never played. */
  lastPlayed?: string
}

/** Start on an app: what it opens in, its use, and (a program of its own) its version and size. */
export interface AppDetails {
  /** Its tile's id (`netflix`), whichever card Start was pressed on. */
  id: string
  name: string
  tile?: string
  /** "Chrome", "VacuumTube", "a Steam shortcut". */
  opensIn: string
  /** Minutes it's been open; missing if never opened. */
  playtime?: number
  /** ISO date (YYYY-MM-DD); missing if never opened. */
  lastPlayed?: string
  /** "312.4 MB", for a program of its own. */
  size?: string
  version?: string
  /** Its Flatpak can be updated from here. */
  updatable: boolean
  /** On Home's Favorite Apps. */
  onHome: boolean
}

/** Start on a Steam game: what's known of it from Steam's own files. */
export interface SteamGameDetails {
  title: string
  cover?: string
  /** Minutes Steam has counted; missing if never played. */
  playtime?: number
  /** ISO date (YYYY-MM-DD); missing if never played. */
  lastPlayed?: string
  /** Bytes the install takes. */
  bytes?: number
  /** Unlocked of all there are, where the game has achievements. */
  achievements?: { achieved: number; total: number }
  /** A non-Steam game added to Steam (Heroic, Lutris...): Steam can open its page but not verify it. */
  shortcut?: boolean
}

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
  /** Who made a built-in track and its licence, shown beside it (CC BY asks for credit). */
  credit?: string
  /** Ships with vaporTV (else it's one of yours, from the music folder). */
  builtIn?: boolean
  /** Yours: the artist, from a file named "Artist - Title". */
  artist?: string
  /** Yours: the subfolder it's in, as an album ("Album/Track.wav"). */
  album?: string
}

export type MusicVolume = 'low' | 'medium' | 'high'

/** Background sound plays in two layers at once: music, and ambience under it. */
export type MusicKind = 'music' | 'ambience'

/** One layer as the page plays it: one track looping, or several in random order. */
export interface MusicLayer {
  /** One track loops; several play in this order, or at random when `shuffle`. */
  urls: string[]
  /** Each url's track file (as MusicTrack.file), so Settings can name what's playing. */
  files: string[]
  /** And each one's name, for the toast when the controller skips to it. */
  names: string[]
  shuffle: boolean
  volume: number
}

/** A named list of music tracks, chosen in Settings → Music like a single track. */
export interface Playlist {
  id: string
  name: string
  /** Track files (as MusicTrack.file), in play order. */
  files: string[]
  shuffle: boolean
}

/** What a file browser shows besides folders: audio (music), pictures and videos (backdrops), or everything (the Files app). */
export type BrowseKind = 'audio' | 'backdrop' | 'all'

/** A place in the file browser (adding your own music or backdrops): a home folder, a drive, a subfolder, or a file. */
export interface BrowseEntry {
  name: string
  path: string
  kind: 'folder' | 'drive' | 'file'
  /** Files, browsing 'all': bytes, when it last changed (ms), and what the Files app can show of it. */
  size?: number
  modified?: number
  media?: 'image' | 'video' | 'audio'
}

/** The backdrop's time of day: following the clock, or held at one moment. */
export type BackdropTime = 'auto' | 'dawn' | 'day' | 'sunset' | 'night'
/** How sharp (and how much work) the consoles' own tab backdrops are: background/products.ts. */
export type ConsoleBackdropQuality = 'high' | 'medium' | 'low'

/** Which animated backdrop is drawn behind every screen. */
export type BackdropStyle = 'sea' | 'cityrain' | 'forest' | 'aurora' | 'drift' | 'waves' | 'tunnel' | 'custom'

/** One of your own backdrops: a picture or video in ~/Pictures/vaporTV Backdrops. */
export interface CustomBackdrop {
  /** Its file name in the folder; what's saved. */
  file: string
  name: string
  kind: 'image' | 'video'
  url: string
}

export interface Settings {
  /** Every Steam collection, Favorites first. */
  collections: SteamCollection[]
  /** Ids of the collections shown on the Steam tab. */
  steamCollections: string[]
  steamLayout: SteamLayout
  switchLayout: SteamLayout
  ps3Layout: SteamLayout
  xbox360Layout: SteamLayout
  ps2Layout: SteamLayout
  xboxLayout: SteamLayout
  gamecubeLayout: SteamLayout
  wiiLayout: SteamLayout
  dreamcastLayout: SteamLayout
  n64Layout: SteamLayout
  saturnLayout: SteamLayout
  nesLayout: SteamLayout
  snesLayout: SteamLayout
  genesisLayout: SteamLayout
  sega32xLayout: SteamLayout
  neogeoLayout: SteamLayout
  psxLayout: SteamLayout
  pspLayout: SteamLayout
  wiiuLayout: SteamLayout
  arcadeLayout: SteamLayout
  /** Arcade tab carousels turned off. */
  arcadeRowsHidden: ArcadeRow[]
  /** Each screen's Recents layout (by default, its tab's layout; Rows on Home). */
  recentsLayouts: Record<RecentsTab, SteamLayout>
  favoritesLayout: SteamLayout
  /** Each layer's tracks: built in, then those in the music folder (Ambience/ for ambience, the rest music). */
  musicTracks: Record<MusicKind, MusicTrack[]>
  /** Music's playlists: those made in Settings, or the built-in one until any are changed. */
  playlists: Playlist[]
  /** Each layer's choice: a track (its file), 'shuffle' for all of them at random, 'playlist:<id>', or null for none. */
  music: string | null
  ambience: string | null
  musicVolume: MusicVolume
  ambienceVolume: MusicVolume
  backdrop: BackdropStyle
  /** Home's own backdrop, or null when it shows the same as the other screens. */
  homeBackdrop: BackdropStyle | null
  /** Your own backdrops: the one that loops (its file), or 'shuffle' for all of them. */
  backdropFile: string | null
  /** Your own backdrops left out of the shuffle (their files). */
  backdropShuffleOff: string[]
  customBackdrops: CustomBackdrop[]
  backdropTime: BackdropTime
  /** Gradient Drift's colours: a preset name, or 'random' for a new one each start. */
  driftPreset: string
  /** Which way Gradient Drift's glass ribs run. */
  driftDirection: 'vertical' | 'horizontal'
  /** Star Tunnel's colours. */
  tunnelColors: 'nebula' | 'starlight' | 'ice' | 'ember'
  consoleBackdropQuality: ConsoleBackdropQuality
  /** Tabs backdrop → Consoles: console tabs show their console in 3D; other screens show Home's backdrop. */
  consoleBackdrops: boolean
  /** A console tab's left bar shows its console turning slowly; off, just its logo. */
  spinningConsoles: boolean
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
export type ScreensaverStyle = 'slideshow' | 'backdrop' | 'consoles' | 'clock'

/** Where the big clock sits (backdrop and clock styles): moving every minute so it can't burn in, or held still. */
export type ScreensaverClockSpot = 'moving' | 'topLeft' | 'bottomLeft' | 'center'

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

/** The system's own battery (a Steam Deck's), for the top bar. */
export interface BatteryState {
  percent: number
  /** Plugged in: charging, or full. */
  charging: boolean
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

/** Setup's root files gone missing (SteamOS updates discard /etc changes not on their keep list). */
export interface SetupDamage {
  /** The controller wake rule (moved to /etc/previous). */
  wake: boolean
  /** The Chrome policy that installs vaporTV for Netflix (and turns off websites' notifications). */
  netflix: boolean
  /** That policy is there but from an older vaporTV (a new one changed it), rather than removed by an update. */
  netflixOutdated?: boolean
  /** The keep list that carries both through updates. */
  keep: boolean
  /** The user has an admin password to repair with. */
  password: boolean
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
  /** True while another app (Steam's menu) has gamescope's input focus, which our window isn't told about. */
  onSteamFocus(callback: (away: boolean) => void): () => void
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
  /** Select on a console game: rename it, move it to another emulator, or delete it. */
  /** Game playlists (your own lists of games, on Home or a tab's left bar). */
  media: {
    /** The servers signed in to. */
    accounts(): Promise<MediaAccountInfo[]>
    /** Emby and Jellyfin servers answering on the network. */
    discover(): Promise<MediaServer[]>
    /** The server at a typed address; throws if none answers. */
    check(address: string): Promise<MediaServer>
    signIn(server: MediaServer, user: string, password: string): Promise<MediaAccountInfo[]>
    signOut(key: string): Promise<MediaAccountInfo[]>
    /** Continue watching from every server, newest first: empty when signed in to none; throws if every one failed. */
    resume(): Promise<MediaItem[]>
    /** The Media tab's top lists; a server that fails just drops out. */
    lists(): Promise<MediaLists>
    /** Every server's libraries of films and shows (not music, books, photos or live TV). */
    libraries(): Promise<MediaLibrary[]>
    /** A show's page: details, seasons, the next episode. */
    show(source: string, seriesId: string): Promise<MediaShow>
    /** One film, show or episode with its summary and genres, for the details panel. */
    details(source: string, id: string): Promise<MediaItem>
    /** Marks it favourite or not, on its server; resolves to the new state. */
    setFavorite(source: string, id: string, on: boolean): Promise<boolean>
    /** Marks it (a show: every episode) watched or not, on its server. */
    setWatched(source: string, id: string, on: boolean): Promise<void>
    /** One season's episodes, in order. */
    episodes(source: string, seriesId: string, seasonId: string): Promise<MediaItem[]>
    /** A page of a library, sorted and (unwatched) filtered by the server. */
    libraryPage(library: Pick<MediaLibrary, 'source' | 'id' | 'type'>, sort: MediaSort, unwatched: boolean, start: number, limit: number): Promise<MediaPage>
    playback(source: string, itemId: string, choice?: MediaChoice): Promise<MediaPlayback>
    report(event: 'start' | 'progress' | 'stop', playback: MediaPlayback, positionSeconds: number, paused: boolean): Promise<void>
  }
  gamePlaylists: {
    /** Every playlist, its games as cards, for Settings. */
    list(): Promise<PlaylistRow[]>
    /** The playlists set to show on `tab`, their games as cards, for its left bar. */
    forTab(tab: LayoutTab): Promise<PlaylistRow[]>
    /** Every playlist, and whether this game is in it, for its game menu. */
    forGame(id: string): Promise<PlaylistChoice[]>
    /** A new playlist showing on `showOn`, with this game in it if one is given; resolves with its id. */
    create(name: string, showOn: PlaylistPlace[], gameId?: string): Promise<string>
    /** Where it shows; ignored if empty (a playlist always shows somewhere). */
    setShowOn(playlist: string, showOn: PlaylistPlace[]): Promise<void>
    /** Puts the game in the playlist or takes it out; whether it's in it now. */
    toggle(playlist: string, gameId: string): Promise<boolean>
    rename(playlist: string, name: string): Promise<void>
    move(playlist: string, direction: 'up' | 'down'): Promise<void>
    delete(playlist: string): Promise<void>
  }
  game: {
    options(id: string): Promise<GameOptions>
    /** A Steam game's playtime, last play, size and achievements; null when it isn't installed. */
    steam(id: string): Promise<SteamGameDetails | null>
    /** Hands the game to Steam: its page in Steam's library, or checking its files. */
    openInSteam(id: string, what: 'page' | 'verify'): Promise<void>
    /** An app tile's (`netflix`), or the app behind a Recents card (`app:…`, `shortcut:…`); null when it isn't one of the apps. */
    app(id: string): Promise<AppDetails | null>
    /** Updates an app's program; whether there was anything new. */
    updateApp(id: string): Promise<boolean>
    /** A new name, or null for the file's own. */
    rename(id: string, name: string | null): Promise<void>
    /** A RetroArch core's name, or '' for the console's default. */
    setEmulator(id: string, emulator: string): Promise<void>
    /** Deletes the game's files from the drive for good. */
    delete(id: string): Promise<void>
  }
  /** Desktop Mode setup. Install and uninstall resolve with an error message, or null when done. */
  setup: {
    status(): Promise<InstallStatus>
    install(options: InstallOptions): Promise<string | null>
    uninstall(): Promise<string | null>
    gamingMode(): Promise<void>
    onProgress(callback: (line: string) => void): () => void
    /** What a SteamOS update took from setup's root half, for the repair window in Gaming Mode. */
    damage(): Promise<SetupDamage & { dismissed: string | null }>
    /** Puts it back with the admin password: null when done, else why not. */
    repair(password: string): Promise<string | null>
    /** Later: the window doesn't open by itself again for this same damage. */
    dismissRepair(key: string): Promise<void>
  }
  /** The tabs that show, in the bar (after Home) and under More: those with something to show and not switched off. */
  getAvailableTabs(): Promise<TabArrangement>
  /** The Steam tab: the collections chosen in Settings, and how to lay them out. */
  getSteamTab(): Promise<LibraryTab>
  /** The Switch tab: Ryujinx games found on the ROM drive. */
  getSwitchTab(): Promise<LibraryTab>
  /** The PS3 tab: RPCS3 games, installed and disc. */
  getPs3Tab(): Promise<LibraryTab>
  /** The Xbox 360 tab: Xenia disc images. */
  getXbox360Tab(): Promise<LibraryTab>
  /** The Xbox tab: xemu disc images. */
  getXboxTab(): Promise<LibraryTab>
  /** The PS2 tab: PCSX2 disc images. */
  getPs2Tab(): Promise<LibraryTab>
  /** The Wii tab: Dolphin disc images. */
  getWiiTab(): Promise<LibraryTab>
  /** The GameCube tab: Dolphin disc images. */
  getGameCubeTab(): Promise<LibraryTab>
  /** The Dreamcast tab: Flycast disc images. */
  getDreamcastTab(): Promise<LibraryTab>
  /** The N64 tab: cartridge dumps for Mupen64Plus-Next. */
  getN64Tab(): Promise<LibraryTab>
  /** The Saturn tab: disc images for Kronos. */
  getSaturnTab(): Promise<LibraryTab>
  /** The NES tab: games for Mesen. */
  getNesTab(): Promise<LibraryTab>
  /** The SNES tab: games for Snes9x. */
  getSnesTab(): Promise<LibraryTab>
  /** The Genesis tab: games for Genesis Plus GX. */
  getGenesisTab(): Promise<LibraryTab>
  /** The 32X tab: games for PicoDrive. */
  getSega32xTab(): Promise<LibraryTab>
  /** The Neo Geo tab: the Neo Geo's arcade sets (from roms/neogeo), out of the Arcade tab. */
  getNeoGeoTab(): Promise<LibraryTab>
  /** The Wii U tab: title folders for Cemu. */
  getWiiUTab(): Promise<LibraryTab>
  /** The PSX tab: PlayStation discs for DuckStation. */
  getPsxTab(): Promise<LibraryTab>
  /** The PSP tab: UMD images for PPSSPP. */
  getPspTab(): Promise<LibraryTab>
  /** The Arcade tab: ROM sets from the Atomiswave, NAOMI, CPS and arcade folders. */
  getArcadeTab(): Promise<LibraryTab>
  /** Adds or removes a Switch game from Favorites; resolves with whether it's now a favourite. */
  toggleFavorite(id: string): Promise<boolean>
  /** Calls back when new art has been downloaded; returns an unsubscribe. */
  /** Select + Start held with vaporTV in front (the media player closes its video on it). */
  onCloseCombo(callback: () => void): () => void
  onArtUpdated(callback: () => void): () => void
  /** Listens once (for a search unless said); what happens comes through onVoice. */
  startVoice(purpose?: VoicePurpose): void
  stopVoice(): void
  /** Titles to help speech recognition spell names. */
  setVoiceHints(titles: string[]): void
  /** Voice search's progress, whoever started it (a remote's Menu tap, or the search screen). */
  onVoice(callback: (state: VoiceState, purpose: VoicePurpose) => void): () => void
  /** A GitHub issue link (and its QR code) for a bug report. */
  makeBugReport(input: BugReportInput): Promise<BugReport>
  /** A remote's Menu held: open Settings. */
  onMenuHeld(callback: () => void): () => void
  setSteamCollections(ids: string[]): Promise<void>
  /** Rows or grid for a library tab. */
  setTabLayout(tab: LayoutTab, layout: SteamLayout): Promise<void>
  setRecentsLayout(tab: RecentsTab, layout: SteamLayout): Promise<void>
  setFavoritesLayout(layout: SteamLayout): Promise<void>
  setBraveSearchKey(key: string): Promise<void>
  setSteamGridDbKey(key: string): Promise<void>
  /** A layer's choice: a track's file, 'shuffle', or null for none. */
  setMusic(kind: MusicKind, choice: string | null): Promise<void>
  /** Saves every playlist (new, changed, or without the ones deleted). */
  setPlaylists(playlists: Playlist[]): Promise<void>
  setMusicVolume(kind: MusicKind, volume: MusicVolume): Promise<void>
  /** Adding your own: browse home folders and drives (null for the places to start), then copy a file in as music or ambience. */
  musicFiles: {
    add(path: string, kind: MusicKind): Promise<string>
  }
  /** Browse home folders and drives (null for the places to start), showing folders and files of a kind. */
  browseFiles(dir: string | null, kind: BrowseKind): Promise<BrowseEntry[]>
  /** The Files app: an address the page can show or play a file from. */
  openFile(path: string): Promise<string>
  /** The Files app: copies a file into a folder, or moves it there (`move`); resolves with where it went. */
  pasteFile(source: string, folder: string, move: boolean): Promise<string>
  /** A paste's progress, in whole percents. */
  onPasteProgress(callback: (percent: number) => void): () => void
  /** Copies a picture or video in as one of your own backdrops; returns its file name. */
  addBackdrop(path: string): Promise<string>
  getBackdrop(): Promise<{
    style: BackdropStyle
    /** Home's own backdrop, or null when it shows `style` like the other screens. */
    homeStyle: BackdropStyle | null
    time: BackdropTime
    drift: string
    driftDirection: 'vertical' | 'horizontal'
    tunnelColors: 'nebula' | 'starlight' | 'ice' | 'ember'
    consoleBackdropQuality: ConsoleBackdropQuality
  /** Tabs backdrop → Consoles: console tabs show their console in 3D; other screens show Home's backdrop. */
  consoleBackdrops: boolean
    /** With style or homeStyle 'custom': your pictures and videos, the one to start on, and whether to shuffle them (else it loops). */
    custom: { items: CustomBackdrop[]; start: string; shuffle: boolean } | null
  }>
  /** For 'custom', `file` says which of your own loops, or 'shuffle' for all of them. */
  setBackdrop(style: BackdropStyle, file?: string): Promise<void>
  /** Home's own backdrop; null for the same as the other screens. */
  setHomeBackdrop(style: BackdropStyle | null): Promise<void>
  /** Deletes one of your own backdrops. */
  removeBackdrop(file: string): Promise<void>
  /** Which of your own backdrops the shuffle leaves out (their files). */
  setBackdropShuffleOff(files: string[]): Promise<void>
  setDriftPreset(name: string): Promise<void>
  setDriftDirection(direction: 'vertical' | 'horizontal'): Promise<void>
  setTunnelColors(colors: 'nebula' | 'starlight' | 'ice' | 'ember'): Promise<void>
  setConsoleBackdropQuality(quality: ConsoleBackdropQuality): Promise<void>
  setConsoleBackdrops(on: boolean): Promise<void>
  setSpinningConsoles(on: boolean): Promise<void>
  setBackdropTime(time: BackdropTime): Promise<void>
  /** The background track to play (null for none) and its volume. */
  getMusic(): Promise<Record<MusicKind, MusicLayer>>
  /** Where a music track plays from, for Settings' preview. */
  musicTrackUrl(file: string): Promise<string>
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
  /** The system's battery, or null for a box without one (controllers' batteries don't count). */
  getBattery(): Promise<BatteryState | null>
  getSystemStats(): Promise<SystemStats>
  /** Settings → Home: what each corner of the top bar shows. */
  clock: {
    get(): Promise<ClockCorners>
    set(corners: ClockCorners): Promise<void>
  }
  /** Settings → Tabs: the tabs with something to show, where each sits (bar, More or off), in order. */
  tabs: {
    get(): Promise<TabArrangement & { off: HideableTab[] }>
    /** Saves where the tabs go and which are off. */
    set(arrangement: TabArrangement, off: HideableTab[]): Promise<void>
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
    /** Signs out and removes Google's photos from the screensaver; whether Google took back its access. */
    signOut(): Promise<boolean>
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
