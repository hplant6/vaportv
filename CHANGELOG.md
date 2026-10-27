# Changelog

What changed in each release of vaporTV. `scripts/release.sh` publishes a version's
section as its GitHub release notes, which is what the update window in vaporTV shows,
so write for the people using it: what's new, what's fixed. Start a version's section
as `## <version>` (as in package.json), then `### Added`, `### Fixed` or `### Changed`
groups of `- ` points. Collect changes under `## Unreleased` until then.

## Unreleased

### Added
- Settings → Help, with the welcome tour (moved from General) and Report a problem: a QR code that opens a bug report on your phone, on GitHub, with vaporTV's version, the system, your controllers and recent log lines filled in. Describe what went wrong and submit it there (it needs a GitHub account).
- Voice search: tap a remote's Menu button and say a game or app ("Metroid Prime", or "play Halo 2" to start it straight away). It searches every tab and app, and understands speech on this machine, with nothing sent anywhere (the speech model downloads the first time). Hold Menu for Settings. On a controller, press the right stick (R3; change it in Settings → Controller). The background music and ambience pause while search is open, so it can hear you. The search screen also has a mic button and Type.
- City Rain backdrop: a wet street at night, the city's lights reflected in the puddles and rain falling through them. Lighter on the GPU than Rain.
- Grids bend when you scroll fast: hold a direction and the middle of the screen sinks away (or swells toward you going back up) with the cards curving along it, flattening when you let go (after Codrops' infinite WebGL gallery). Stepping one card at a time leaves them flat and easy to read.
- Cards lean with the scroll: a row's cards tilt sideways as it slides, easing flat when it stops (after the carousel in Codrops' WebGPU page-transitions demo).
- The selected card tips the way you moved and settles, then sways gently while you stay on it; its shadow moves with it.
- Time played on the game cards, after the date: Steam's own count for Steam games and shortcuts, and vaporTV's for the console games it starts (counted from now on; time asleep isn't counted).
- Files: a new app in the Apps tab (Y puts it on Home) for browsing your home folders and any USB drive or SD card from the controller, full screen. A on a file shows Open, Cut and Copy under it; something cut or copied pastes from a row at the top of any folder (between drives too, with its progress). Open shows a picture (left and right for the folder's others), a video or a song (A pauses, left and right skip 10 seconds, L1 and R1 the previous or next file); the background music waits while one plays.
- Preview a song before choosing it: Settings → Music → Songs has a play button on each (Right from the song). It plays up to 30 seconds while the background music and ambience pause.
- Music playlists: Settings → Music → Playlists makes and edits them (name, shuffle or in order, which tracks); choose one like a track. A Chris Zabriskie playlist comes built in.
- Seven built-in music tracks by Chris Zabriskie (CC BY 4.0), credited beside each one in Settings → Music.
- Game options: press Start on a console game to rename it, pick which emulator opens it (any installed RetroArch core for that console), replace its art, or delete it from the drive (press A twice; can't be undone). G on a keyboard.
- NES, SNES, Genesis, 32X and Amiga tabs: games from EmuDeck's roms/nes, snes, genesis, sega32x and amiga open in RetroArch (Mesen, Snes9x, Genesis Plus GX, PicoDrive and PUAE).
- A Saturn tab: Sega Saturn games (from EmuDeck's roms/saturn, zipped or not) open in RetroArch's Kronos core, multi-disc games as a disc list.
- An N64 tab: Nintendo 64 games (from EmuDeck's roms/n64) open in RetroArch's Mupen64Plus-Next core.
- A Wii U tab: Wii U games (title folders in EmuDeck's roms/wiiu) open in Cemu, named as the games name themselves.
- PSX and PSP tabs: PlayStation games (roms/psx) open in DuckStation, multi-disc games as a disc list so it can change discs; PSP games (roms/psp) open in PPSSPP.
- Background sound in two layers: music, with ambience under it, each with its own track (or Shuffle, for all of them in random order) and volume.
- Three more built-in ambiences, alongside Rain: Crickets, Ocean waves and Birdsong (CC0, from freesound.org).
- Settings → Music → Add your own: pick an audio file from a USB drive, SD card or this machine, say whether it's music or ambience, and vaporTV copies it in.
- Settings → Backdrop → Your videos: add your own videos (or pictures) from a USB drive, SD card or this machine, then loop one or shuffle them all, fading from one to the next. Leave any out of the shuffle, or remove them.
- Settings → Tabs: put each tab in the top bar or under More, in any order, or switch it off (Home always comes first).
- An Xbox tab: original Xbox games (from EmuDeck's roms/xbox) open in xemu.
- A Wii tab: Wii games (from EmuDeck's roms/wii) open in Dolphin.
- The top bar shows up to ten tabs; past that, a More tab opens a second row with the rest.

### Changed
- Select now shows what each button does, in a line along the bottom of the screen (H on a keyboard; press again to hide), and Game options moves to Start. An arcade game's core is picked in Game options instead, so the separate core picker is gone.
- Thicker controller button icons.
- The on-screen keyboard is now a tray along the bottom of the screen that slides up, laid out like Steam's, with its controller shortcuts: X deletes, Y types a space, L2 is Shift, R2 switches to symbols and Start is Enter (each shown on its key). Searching shows what you type, and its results, as you type.
- In grids the selected card's row stays near the middle of the screen as you move up and down, instead of near the bottom (it stops at the top and the end of the page).
- More's row: up from one of its tabs goes to the tab above it in the top bar, and down from a top-bar tab (while the row is open) to the one below it, instead of always back to More.
- The settings and power icons are the height of the tab names, and sit a little further out.
- Settings has a new look: the categories in a panel on the left, each group of settings in its own panel on the right, and the backdrop dimmed behind them.
- The tab you're on is gold and glowing, without an underline.
- Games without art show their name on a black band across the card.

### Fixed
- Kodi (and Plex) close once you're back in vaporTV, however you got there; Kodi could be left running unseen behind it.
- Controller and remote wake, and Netflix remote control, now survive SteamOS updates, which had been quietly removing them (3.9.5 did). If a SteamOS update does take them, vaporTV notices as it starts and offers to repair them, with your admin password typed on vaporTV's keyboard.
- Your videos no longer freeze on their last frame: videos (and music) are served so they can seek, which MP4s with their index at the end need to loop.
- Titles with the article moved to the end before a subtitle read properly: "The Legend of Zelda - The Wind Waker", not "Legend of Zelda, The - …".
- When a game is there both released and as a beta or demo, its tab opens the released one.

## 0.9.0

The first public release (a beta): an Android TV-style home screen for SteamOS's Gaming Mode, for your Steam library, emulated consoles and streaming apps, all from the couch.

### Added
- An intro video as vaporTV opens; any button skips it. Choose it, turn it off, or use your own (any video in `~/Videos/vaporTV Intros`) in Settings → General → Intro.
- Setup can make the vaporTV intro Steam's startup movie, so the box boots into it (vaporTV then skips its own copy straight after).
- The screensaver shows the vaporTV logo in its top-right corner (it shifts a few pixels every minute, so it can't burn into the screen).
- The top bar stays in place while the page scrolls; what's below it fades out as it passes under.
- A remote's Back (Backspace) works in YouTube, which only goes back on Escape.
- A PS2 tab: your PS2 games (from EmuDeck's roms/ps2) open in PCSX2, with covers, favourites and Recently played.
- Steam Deck in your hands: vaporTV fills its taller screen, shows the battery under the clock, slows the live backdrops to save power on battery, and rows and pages scroll with a swipe.
- Settings and power sit at either end of the top bar, with the tabs centred between them.
- Updates: vaporTV checks for new versions, shows what changed in each one since yours, and installs it from the couch (Settings → General → Updates).
- Netflix's arrow-key controls install with the rest of setup (it asks for the admin password once, along with controller wake).
- A Sofabaton (or other remote) can open Steam's menu with F11, and its Home button closes apps.
- Kodi can be set up from the apps list, for watching an Emby library.
- Games and apps without artwork get a proper background behind their name instead of a blank card.

### Changed
- App tiles and their small card icons now come from SteamGridDB (with your key in Settings → Artwork) instead of being built in; without a key, a tile shows the app's name.

### Fixed
- Console tabs show what you just played under Recently played as soon as you're back from the game.
- Home no longer mistakes vaporTV's own background helpers for a game, which could leave YouTube open.
- Netflix: the arrows move between profiles on "Who's watching?".
- Kodi (and other apps vaporTV opens itself) no longer keep running unseen after you go back to vaporTV through Steam's menu.
