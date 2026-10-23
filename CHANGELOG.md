# Changelog

What changed in each release of vaporTV. `scripts/release.sh` publishes a version's
section as its GitHub release notes, which is what the update window in vaporTV shows,
so write for the people using it: what's new, what's fixed. Start a version's section
as `## <version>` (as in package.json), then `### Added`, `### Fixed` or `### Changed`
groups of `- ` points. Collect changes under `## Unreleased` until then.

## Unreleased

### Added
- Background sound in two layers: music, with ambience under it, each with its own track (or Shuffle, for all of them in random order) and volume.
- Settings → Music → Add your own: pick an audio file from a USB drive, SD card or this machine, say whether it's music or ambience, and vaporTV copies it in.
- Settings → Tabs: put each tab in the top bar or under More, in any order, or switch it off (Home always comes first).
- An Xbox tab: original Xbox games (from EmuDeck's roms/xbox) open in xemu.
- A Wii tab: Wii games (from EmuDeck's roms/wii) open in Dolphin.
- The top bar shows up to ten tabs; past that, a More tab opens a second row with the rest.

### Changed
- The settings and power icons are the height of the tab names, and sit a little further out.
- Settings has a new look: the categories in a panel on the left, each group of settings in its own panel on the right, and the backdrop dimmed behind them.
- The tab you're on is gold without an underline; the one the cursor is on is yellow.
- Games without art show their name on a black band across the card.

### Fixed
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
