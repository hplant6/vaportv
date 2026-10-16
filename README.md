# vaporTV

An Android TV–style home screen for SteamOS. vaporTV boots straight into a couch-friendly launcher in Gaming Mode: your Steam library, emulated consoles and streaming apps in one place, driven entirely by a controller.

> **Status: in development.** vaporTV runs daily on its author's living-room box, but there is no installer yet: setting it up still takes a terminal. An easy installer is the next milestone.

## Features

- **Home:** Recents (Steam games, emulated games and streaming apps, by when you last played) and Favorite Apps, as carousels or grids
- **Steam tab:** your Steam collections, including dynamic ones
- **Console tabs:** Switch (Ryujinx), PS3 (RPCS3), Xbox 360 (Xenia), GameCube (Dolphin) and Dreamcast (Flycast), with cover art from [SteamGridDB](https://www.steamgriddb.com/)
- **Apps tab:** streaming services, opened as Steam shortcuts
- **Select + Start** closes whatever is running and returns to vaporTV
- **Backdrops:** a live sea that follows the time of day, or a rainy puddle
- **Screensaver:** your game art, Steam screenshots, your photos, or a big clock
- **Background music**, a power menu, and sleep and wake with the controller
- Two-column Settings for all of the above

## Requirements

SteamOS 3.7 or later in Gaming Mode, on a TV. The Steam Deck is supported too, on a TV now and handheld as part of v1.

## Building

```sh
npm install
npm run dev          # run it on a desktop for development
npm run typecheck && npm test
npm run dist         # build the AppImage (dist/)
```

## Licence

vaporTV is free software under the [GNU General Public License v3.0 or later](LICENSE). Third-party fonts, sounds and artwork it includes, and their licences, are listed in [NOTICE.md](NOTICE.md).

Streaming service names and logos belong to their owners; vaporTV is not affiliated with them. Privacy policy: https://itshenry.me/vaportv/privacy/
