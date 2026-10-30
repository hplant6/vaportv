import { app } from 'electron'
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { ArcadeRow } from '../shared/arcade'
import type { Controls } from '../shared/controls'
import type { BackdropStyle, BackdropTime, ClockCorners, HideableTab, MusicVolume, Playlist, TabArrangement, RecentsTab, ScreensaverClockSpot, ScreensaverSources, ScreensaverStyle, SteamLayout } from '../shared/types'

export interface Config {
  /** Sleep when the controller is switched off (while vaporTV is on screen). */
  sleepOnControllerOff?: boolean
  /** Count down before that sleep (default on). */
  sleepWarning?: boolean
  /** Buttons moved from their defaults in Settings → Controller (action → button index). */
  controls?: Partial<Controls>
  /** Home's Favorite Apps, by app id, in the order added (unset: the built-in eight). */
  favoriteApps?: string[]
  /**
   * Google Photos add-on: your Google Cloud OAuth client ("Desktop app") and, once
   * signed in, the refresh token. Never committed; it lives only in config.json.
   */
  googlePhotos?: { clientId: string; clientSecret: string; refreshToken?: string; scopes?: string }
  /**
   * Google Drive folder the screensaver mirrors: by id once chosen in Settings, else
   * looked up by folderName (default "vaporTV Screensaver").
   */
  googleDrive?: { folderId?: string; folderName?: string }
  /** What each corner of the top bar shows (default: temperature and date; time and battery). */
  clockCorners?: ClockCorners
  /** Minutes of no input before the screensaver; 0 turns it off. */
  screensaverDelay?: number
  screensaverStyle?: ScreensaverStyle
  /** Where the big clock sits (default moving, against burn-in). */
  screensaverClock?: ScreensaverClockSpot
  /** Your photos' date and album over them in the slideshow (default on). */
  screensaverDetails?: boolean
  /** Slideshow sources; any left out default to on. */
  screensaverSources?: Partial<ScreensaverSources>
  /** Folder of your own screensaver photos (default ~/Pictures/Screensaver). */
  screensaverFolder?: string
  /** Steam collection ids shown on the Steam tab, in order (default: Favorites). Set from Settings. */
  steamCollections?: string[]
  /** How the Steam tab lays out collections (default rows). Set from Settings. */
  steamLayout?: SteamLayout
  /** How the Switch tab lays out its games (default rows). Set from Settings. */
  switchLayout?: SteamLayout
  /** Folder holding a subfolder per system (switch/, ...). Defaults to EmuDeck's (see emudeck.ts). */
  romRoot?: string
  /** Name overrides for Switch games, by folder (or file) name. */
  switchTitles?: Record<string, string>
  /** How the PS3 tab lays out its games (default rows). Set from Settings. */
  ps3Layout?: SteamLayout
  /** Name overrides for PS3 games, by title id (e.g. "BCUS98296"). */
  ps3Titles?: Record<string, string>
  /** RPCS3 AppImage (default ~/Applications/rpcs3.AppImage). */
  rpcs3?: string
  /** RPCS3's config folder, where vfs.yml says where games live (default ~/.config/rpcs3). */
  rpcs3Config?: string
  /** How the Xbox 360 tab lays out its games (default rows). Set from Settings. */
  xbox360Layout?: SteamLayout
  /** Name overrides for Xbox 360 games, by disc image file name. */
  xbox360Titles?: Record<string, string>
  /** Xenia Canary's Windows exe (default romRoot/xbox360/xenia_canary.exe). */
  xenia?: string
  /** Proton prefix for Xenia (default: EmuDeck's Xenia prefix, or vaporTV's own). */
  xeniaPrefix?: string
  /** Proton used to run Xenia (default Steam's "Proton - Experimental"). */
  proton?: string
  /** How the Xbox tab lays out its games (default rows). Set from Settings. */
  xboxLayout?: SteamLayout
  /** Name overrides for Xbox games, by folder name (relative to roms/xbox). */
  xboxTitles?: Record<string, string>
  /** Command that runs xemu (default ["flatpak", "run", "app.xemu.xemu"]). */
  xemu?: string[]
  /** How the PS2 tab lays out its games (default rows). Set from Settings. */
  ps2Layout?: SteamLayout
  /** Name overrides for PS2 games, by file name (relative to roms/ps2). */
  ps2Titles?: Record<string, string>
  /** PCSX2's AppImage (default EmuDeck's, ~/Applications/pcsx2-Qt.AppImage). */
  pcsx2?: string
  /** Cemu for the Wii U tab (default: EmuDeck's ~/Applications/Cemu.AppImage). */
  cemu?: string
  /** DuckStation for the PSX tab (default: EmuDeck's ~/Applications/DuckStation.AppImage). */
  duckstation?: string
  /** PPSSPP for the PSP tab, as a command (default: its Flatpak). */
  ppsspp?: string[]
  /** How the Wii tab lays out its games (default rows). Set from Settings. */
  wiiLayout?: SteamLayout
  /** Name overrides for Wii games, by file name (relative to roms/wii). */
  wiiTitles?: Record<string, string>
  /** How the GameCube tab lays out its games (default rows). Set from Settings. */
  gamecubeLayout?: SteamLayout
  /** Name overrides for GameCube games, by file name (relative to roms/gc). */
  gamecubeTitles?: Record<string, string>
  /** Command that runs Dolphin (default ["flatpak", "run", "org.DolphinEmu.dolphin-emu"]). */
  dolphin?: string[]
  /** How the Dreamcast tab lays out its games (default rows). Set from Settings. */
  dreamcastLayout?: SteamLayout
  /** How the N64 tab lays out its games (default rows). Set from Settings. */
  n64Layout?: SteamLayout
  /** How the Saturn tab lays out its games (default rows). Set from Settings. */
  saturnLayout?: SteamLayout
  /** How the NES tab lays out its games (default rows). Set from Settings. */
  nesLayout?: SteamLayout
  /** How the SNES tab lays out its games (default rows). Set from Settings. */
  snesLayout?: SteamLayout
  /** How the Genesis tab lays out its games (default rows). Set from Settings. */
  genesisLayout?: SteamLayout
  /** How the 32X tab lays out its games (default rows). Set from Settings. */
  sega32xLayout?: SteamLayout
  /** How the Amiga tab lays out its games (default rows). Set from Settings. */
  amigaLayout?: SteamLayout
  /** How the Wii U tab lays out its games (default rows). Set from Settings. */
  wiiuLayout?: SteamLayout
  /** How the PSX and PSP tabs lay out their games (default rows). Set from Settings. */
  psxLayout?: SteamLayout
  pspLayout?: SteamLayout
  /** How the Arcade tab lays out its games (default rows). Set from Settings. */
  arcadeLayout?: SteamLayout
  /** Arcade game names by ROM set (e.g. "ngfrog": "Frog Feast"), for sets MAME's list doesn't know. */
  arcadeTitles?: Record<string, string>
  /** Arcade tab carousels turned off in Settings. */
  arcadeRowsHidden?: ArcadeRow[]
  /** RetroArch cores for the Arcade tab, by family (default the Flatpak's cores/<name>_libretro.so). */
  arcadeCores?: Partial<Record<'flycast' | 'fbneo' | 'mame', string>>
  /** RetroArch core chosen for one arcade game (game id → core name, e.g. "mame2003_plus"). */
  arcadeGameCores?: Record<string, string>
  /** Console games renamed from Select's game options (card id → name). */
  gameTitles?: Record<string, string>
  /** Console games moved to another RetroArch core from Select's game options (card id → core, e.g. "swanstation"). */
  gameEmulators?: Record<string, string>
  /** Music playlists made in Settings; unset until one is changed (then the built-in one is a saved one). */
  playlists?: Playlist[]
  /** Recents layout per screen, where chosen; see recentsLayout(). */
  recentsLayouts?: Partial<Record<RecentsTab, SteamLayout>>
  /** Home's Favorite Apps: a sideways row (default) or the grid. */
  favoritesLayout?: SteamLayout
  /** Name overrides for Dreamcast games, by file name (relative to roms/dreamcast). */
  dreamcastTitles?: Record<string, string>
  /** Name overrides for N64 games, by file name (relative to roms/n64). */
  n64Titles?: Record<string, string>
  /** Name overrides for Saturn games, by file name (relative to roms/saturn). */
  saturnTitles?: Record<string, string>
  /** Name overrides for NES games, by file name (relative to roms/nes). */
  nesTitles?: Record<string, string>
  /** Name overrides for SNES games, by file name (relative to roms/snes). */
  snesTitles?: Record<string, string>
  /** Name overrides for Genesis games, by file name (relative to roms/genesis). */
  genesisTitles?: Record<string, string>
  /** Name overrides for 32X games, by file name (relative to roms/sega32x). */
  sega32xTitles?: Record<string, string>
  /** Name overrides for Amiga games, by file name (relative to roms/amiga). */
  amigaTitles?: Record<string, string>
  /** Name overrides for Wii U games, by title folder name (in roms/wiiu). */
  wiiuTitles?: Record<string, string>
  /** Name overrides for PSX and PSP games, by file name (relative to roms/psx, roms/psp). */
  psxTitles?: Record<string, string>
  pspTitles?: Record<string, string>
  /** Command that runs RetroArch (default ["flatpak", "run", "org.libretro.RetroArch"]). */
  retroarch?: string[]
  /** Flycast core for RetroArch (default the Flatpak's cores/flycast_libretro.so). */
  flycastCore?: string
  /** RetroArch's Mupen64Plus-Next core for the N64 tab (default: the Flatpak's cores folder). */
  mupen64Core?: string
  /** RetroArch's Kronos core for the Saturn tab (default: the Flatpak's cores folder). */
  kronosCore?: string
  /** RetroArch's Mesen core for the NES tab (default: the Flatpak's cores folder). */
  mesenCore?: string
  /** RetroArch's Snes9x core for the SNES tab (default: the Flatpak's cores folder). */
  snes9xCore?: string
  /** RetroArch's Genesis Plus GX core for the Genesis tab (default: the Flatpak's cores folder). */
  genesisPlusGxCore?: string
  /** RetroArch's PicoDrive core for the 32X tab (default: the Flatpak's cores folder). */
  picodriveCore?: string
  /** RetroArch's PUAE core for the Amiga tab (default: the Flatpak's cores folder). */
  puaeCore?: string
  /** Ryujinx launcher (default ~/Applications/publish/Ryujinx.sh). */
  ryujinx?: string
  /** Background music: a file in the music folder (relative), 'shuffle' for all of it at random, or unset for none. Set from Settings. */
  music?: string
  musicVolume?: MusicVolume
  /** Ambience, the layer under the music: as `music`, from the Ambience folder and the built-in rain. */
  ambience?: string
  ambienceVolume?: MusicVolume
  backdrop?: BackdropStyle
  /** Your own backdrops (~/Pictures/vaporTV Backdrops): the file that loops, or 'shuffle'. Kept when another backdrop is chosen. */
  backdropFile?: string
  /** Your own backdrops the shuffle leaves out. */
  backdropShuffleOff?: string[]
  backdropTime?: BackdropTime
  /** Gradient Drift's colours (a preset name, or 'random'); default molten. */
  driftPreset?: string
  /** Which way its glass ribs run (default vertical). */
  driftDirection?: 'vertical' | 'horizontal'
  /** Star Tunnel's colours (default nebula). */
  tunnelColors?: 'nebula' | 'starlight' | 'ice' | 'ember'
  /** Where background music is read from (default ~/Music). */
  musicFolder?: string
  /** steamgriddb.com API key, for emulated games' art. Set from Settings. */
  steamGridDbKey?: string
  /** Brave Search API key, for the Artwork window's web image search. */
  braveSearchKey?: string
  /** Steam's data folder. Defaults to ~/.local/share/Steam (or $STEAMTV_STEAM_ROOT). */
  steamRoot?: string
  /** How far back Recents looks, in days (default 30). */
  recentDays?: number
  /** Most cards Recents shows (default 12). */
  recentLimit?: number
  /** Favorite Apps tile id -> name of the Steam shortcut it opens, e.g. { "prime": "Prime Video" }. */
  favorites?: Record<string, string>
  /**
   * App tiles of your own: { id, name, shortcut (the Steam shortcut's name, default
   * the name), tile (a picture's file name in ~/.config/steamtv/tiles) }.
   */
  customApps?: { id: string; name: string; shortcut?: string | string[]; tile?: string }[]
  /** Location is looked up from the IP address unless latitude/longitude are set here. */
  weather?: {
    latitude?: number
    longitude?: number
    /** The chosen place's name, for Settings, and its country (for automatic units). */
    place?: string
    country?: string
    unit?: 'fahrenheit' | 'celsius'
  }
  /** The welcome tour has been shown (it shows once, on the first start). */
  welcomeSeen?: boolean
  /** The intro as vaporTV opens: 'default' (vaporTV's own, the default), 'off', or a file in ~/Videos/vaporTV Intros. */
  introVideo?: string
  /** Tabs switched off in Settings → Tabs. */
  tabsHidden?: HideableTab[]
  /** Where tabs go and in what order, once arranged in Settings → Tabs (before that, bar order fills the bar, then More). */
  tabLayout?: TabArrangement
  /** An update's version whose window was put off with Later: it doesn't open by itself again. */
  updateDismissed?: string
  /** The setup damage (SetupDamage's missing parts, joined) whose repair window was put off with Later. */
  repairDismissed?: string
  /** Testing the updater: a releases JSON (URL or file, shaped as GitHub's API) in place of GitHub's. */
  updateFeed?: string
}

export const configPath = (): string => join(app.getPath('home'), '.config', 'steamtv', 'config.json')

export async function loadConfig(): Promise<Config> {
  try {
    return JSON.parse(await readFile(configPath(), 'utf8'))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`steamtv: could not read ${configPath()}:`, err)
    }
    return {}
  }
}

/** Merges `patch` into config.json, keeping everything else in the file as it was. */
export async function saveConfig(patch: Partial<Config>): Promise<void> {
  const path = configPath()
  let current: Record<string, unknown> = {}
  try {
    current = JSON.parse(await readFile(path, 'utf8'))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
  await mkdir(dirname(path), { recursive: true })
  // Write then rename, so a crash mid-write can't leave a half-written config.
  const tmp = `${path}.tmp`
  await writeFile(tmp, JSON.stringify({ ...current, ...patch }, null, 2) + '\n', { mode: 0o600 })
  // Only its owner may read it: it holds the Google sign-in and API keys. `mode` only
  // applies to a new file, and a crash can leave an old .tmp behind.
  await chmod(tmp, 0o600)
  await rename(tmp, path)
}

/** A screen's Recents layout: as chosen, else its tab's own layout (Rows on Home). */
export function recentsLayout(config: Config, tab: RecentsTab): SteamLayout {
  // Home's and Steam's recents are a carousel by default; the consoles' follow their tab.
  return config.recentsLayouts?.[tab] ?? (tab === 'home' || tab === 'steam' ? 'rows' : (config[`${tab}Layout`] ?? 'rows'))
}
