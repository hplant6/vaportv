# vaporTV

An Android TV–style home screen for SteamOS. vaporTV boots straight into a couch-friendly launcher in Gaming Mode: your Steam library, emulated consoles and streaming apps in one place, driven entirely by a controller.

> **Status: early.** vaporTV runs daily on its author's living-room box. This is its first public release; expect rough edges, and please report them.

## Install

1. In **Desktop Mode**, download `vaporTV.AppImage` from the [latest release](https://github.com/hplant6/vaportv/releases/latest).
2. Open it from Dolphin (your Downloads folder). If Plasma asks whether to run it, allow it; if nothing happens, right-click it → **Properties** → **Permissions** → tick **Is executable**, then open it again.
3. The **vaporTV setup** window opens. Choose:
   - **Open vaporTV when Gaming Mode starts** (recommended)
   - **Let my controller wake the box from sleep**: needs an admin password. SteamOS has none until you set one with `passwd` in Konsole; without it this step is skipped.
   - **Apps** to set up: streaming services open in Google Chrome (installed from Flathub if needed) as Steam shortcuts; YouTube, Emby and Jellyfin install their own apps from Flathub.
4. Click **Install**. Steam closes for a moment while vaporTV is added to your library.
5. Click **Return to Gaming Mode**.

To update, download the new AppImage and run setup again. To remove vaporTV, open the AppImage in Desktop Mode and click **Uninstall**.

Apps can also be set up later, from the **Apps** tab in Gaming Mode: anything not set up yet is dimmed with a **Set up** label.

## Features

- **Home:** Recents (Steam games, emulated games and apps, by when you last played) and Favorite Apps, as carousels or grids
- **Steam tab:** your Steam collections, including dynamic ones, and recently played
- **Console tabs:** Switch (Ryujinx), PS3 (RPCS3), Xbox 360 (Xenia), GameCube (Dolphin) and Dreamcast (Flycast), from EmuDeck's folders; a tab shows only when its emulator and games are there
- **Arcade tab:** Atomiswave, NAOMI, NAOMI 2, CPS, Neo Geo and MAME sets, named from MAME's list, each in RetroArch with the right core (and Start to pick another)
- **Cover art** from [SteamGridDB](https://www.steamgriddb.com/) (with a free API key) and the libretro thumbnails; X on a game to pick its art by hand
- **Apps tab:** streaming services and media apps, with setup for anything missing
- **Select + Start** closes whatever is running and returns to vaporTV
- **L2 / R2** change the volume; every button can be reassigned in Settings
- **Backdrops:** a live sea that follows the time of day, a rainy puddle, or Gradient Drift
- **Screensaver:** your game art, Steam screenshots, your photos, or a big clock
- **Background music**, a power menu, and sleep and wake with the controller

## Requirements

SteamOS 3.7 or later in Gaming Mode, on a TV. The Steam Deck works on a TV now; handheld play is planned. Emulated games need [EmuDeck](https://www.emudeck.com/).

## Building

```sh
npm install
npm run dev          # run it on a desktop for development
npm run typecheck && npm test
npm run dist         # build the AppImage (dist/vaporTV.AppImage)
```

`npm run dist` builds with the author's extras (a Google Photos add-on and an unofficial DuckDuckGo image search); `VAPORTV_PUBLIC=1 npm run dist` builds the public release without them. `scripts/release.sh` builds that and publishes it as a GitHub release.

## Licence

vaporTV is free software under the [GNU General Public License v3.0 or later](LICENSE). Third-party fonts, sounds, artwork and code it includes, and their licences, are listed in [NOTICE.md](NOTICE.md).

Streaming service names and logos belong to their owners; vaporTV is not affiliated with them. Privacy policy: https://itshenry.me/vaportv/privacy/
