# vaporTV

Copyright (C) 2026 Henry Plant

vaporTV is free software: you can redistribute it and/or modify it under the terms
of the GNU General Public License as published by the Free Software Foundation,
either version 3 of the License, or (at your option) any later version. See
[LICENSE](LICENSE). It comes with no warranty.

## Included third-party work

| What | Where | Author | Licence |
|---|---|---|---|
| "Puddle in rain" (Rain backdrop) | `src/renderer/src/background/rain/` | Faraz Shaikh | GPL-3.0 |
| EZ-Tree (Forest backdrop: tree generation, bark and leaf textures; via npm `@dgreenheck/ez-tree`) and its demo's grass, flowers, ground textures and wind/ground shaders, reworked for instancing | `src/renderer/src/background/forest/`, `src/renderer/public/backdrops/forest/` | Daniel Greenheck | MIT (`forest/LICENSE`) |
| "Gradient Drift" (Gradient Drift backdrop: shaders, presets, circle motion) | `src/renderer/src/background/drift/`, `DriftBackground.tsx` | Liam Egan (codepen.io/shubniggurath), ported from WebGL via wtc-gl to plain WebGL2 | MIT (CodePen public pen) |
| "GLSL Sample027" (Chromatic Waves backdrop), with itshenry.me's tuning | `src/renderer/src/background/WavesBackground.tsx` | Web_yuki1027 (CodePen) | MIT (CodePen public pen) |
| Glitch (the glitch on the Settings logo), redone with SVG mask layers and clip-path bands instead of text and clip | `src/renderer/src/components/GlitchLogo.tsx`, `app.css` (`.glitch-*`) | leon9208 (CodePen, pen dWOvxw) | MIT (CodePen public pen) |
| "Star Tunnel" (Star Tunnel backdrop), with itshenry.me's tuning | `src/renderer/src/background/StarTunnelBackground.tsx` | alphardex (CodePen, pen XWZKzjE) | MIT (CodePen public pen) |
| Asphalt textures (`road/`) and HDR sky (`shanghai_bund_2k.hdr`), also used by City Rain | `src/renderer/public/backdrops/rain/` | Poly Haven, via the rain demo | CC0 |
| Litter decal (`debris/`) | `src/renderer/public/backdrops/rain/debris/` | vaporTV, drawn by `scripts/make-debris-decal.mjs` (replaced the demo's Megascans decal) | GPL-3.0, as vaporTV |
| Rain splash flipbook (`Splash.png`) | `src/renderer/public/backdrops/rain/` | Faraz Shaikh (rain demo) | GPL-3.0 |
| Rain sound (`rain.mp3`, light-rain-109591) | `src/renderer/public/music/` | Pixabay, via the rain demo | Pixabay Content License (use within an app) |
| Crickets (`crickets.ogg`): "Layered Cricket Ambience (Seamless Loop)", freesound.org/s/852484 | `src/renderer/public/music/` | kkenny101 (re-encoded to Opus) | CC0 |
| Ocean waves (`ocean-waves.ogg`): "Calm ocean waves", freesound.org/s/578524 | `src/renderer/public/music/` | SamsterBirdies (re-encoded to Opus) | CC0 |
| Birdsong (`birdsong.ogg`): "Binaural Birds LOOP 1", freesound.org/s/468449 | `src/renderer/public/music/` | maarten91 (re-encoded to Opus) | CC0 |
| "Any Kind of Black Magic Darkness Will Be Removed" (`zabriskie-any-kind-of-black-magic-darkness-will-be-removed.ogg`), from *Mayor Feedback* (2025) | `src/renderer/public/music/` | Chris Zabriskie, [chriszabriskie.com](https://chriszabriskie.com) (re-encoded to Opus from the Bandcamp FLAC) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| "Cut to Rip Torn" (`zabriskie-cut-to-rip-torn.ogg`), from *Mayor Feedback* (2025) | `src/renderer/public/music/` | Chris Zabriskie, [chriszabriskie.com](https://chriszabriskie.com) (re-encoded to Opus from the Bandcamp FLAC) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| "Hitchcock Would Have Fucked Up Charade" (`zabriskie-hitchcock-would-have-fucked-up-charade.ogg`), from *Angie's Sunday Service* (2022) | `src/renderer/public/music/` | Chris Zabriskie, [chriszabriskie.com](https://chriszabriskie.com) (re-encoded to Opus from the Bandcamp FLAC) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| "I Fuck You Not" (`zabriskie-i-fuck-you-not.ogg`), from *Mayor Feedback* (2025) | `src/renderer/public/music/` | Chris Zabriskie, [chriszabriskie.com](https://chriszabriskie.com) (re-encoded to Opus from the Bandcamp FLAC) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| "I Hope to Be Able to Live the Rest of My Life Without Ever Having to Make That Choice" (`zabriskie-i-hope-to-be-able-to-live.ogg`), from *I Want You to Think About Me* (2026) | `src/renderer/public/music/` | Chris Zabriskie, [chriszabriskie.com](https://chriszabriskie.com) (re-encoded to Opus from the Bandcamp FLAC) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| "What If She Doesn’t Need a Scarf?" (`zabriskie-what-if-she-doesnt-need-a-scarf.ogg`), from *I Want You to Think About Me* (2026) | `src/renderer/public/music/` | Chris Zabriskie, [chriszabriskie.com](https://chriszabriskie.com) (re-encoded to Opus from the Bandcamp FLAC) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| "Your Journey Is Resuming Now" (`zabriskie-your-journey-is-resuming-now.ogg`), from *Abandon Babylon* (2021) | `src/renderer/public/music/` | Chris Zabriskie, [chriszabriskie.com](https://chriszabriskie.com) (re-encoded to Opus from the Bandcamp FLAC) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Arcade game names, years and parent sets (`arcade-names.json`) | `src/main/library/` | MAME 0289 `-listxml`, the MAME team; rebuilt by `scripts/make-arcade-names.py` | GPL-2.0-or-later (MAME) |
| RetroArch icon (arcade card footers, recoloured white) | `src/renderer/public/fixtures/logos/retroarch.svg` | Simple Icons; the RetroArch logo is libretro's trademark | CC0 1.0 (SVG data) |
| Ryujinx icon (Switch card footers; Ryubing's design) | `src/renderer/public/fixtures/logos/ryujinx.png` | EmuDeck's icon pack ([dragoonDorise/EmuDeck](https://github.com/dragoonDorise/EmuDeck)); the Ryujinx/Ryubing project's mark (its code is MIT) | GPL-3.0 (EmuDeck) |
| RPCS3 icon (PS3 card footers) | `src/renderer/public/fixtures/logos/rpcs3.png` | RPCS3's own icon (`rpcs3.svg` from its AppImage), RPCS3 team | GPL-2.0-only (shipped as a separate image) |
| PCSX2 icon (PS2 card footers) | `src/renderer/public/fixtures/logos/pcsx2.png` | EmuDeck's icon pack; the PCSX2 project's mark (its code is GPL-3.0) | GPL-3.0 (EmuDeck) |
| xemu icon (Xbox card footers) | `src/renderer/public/fixtures/logos/xemu.png` | xemu's own icon (from its Flatpak), the xemu project | GPL-2.0 |
| Xenia icon (Xbox 360 card footers) | `src/renderer/public/fixtures/logos/xenia.png` | EmuDeck's icon pack; the Xenia project's mark (its code is BSD-3-Clause) | GPL-3.0 (EmuDeck) |
| Dolphin icon (GameCube card footers) | `src/renderer/public/fixtures/logos/dolphin.png` | Dolphin's own icon (from its Flatpak), Dolphin Emulator Project; its designer has also released the logo as CC0 | GPL-2.0-or-later |
| PPSSPP icon (PSP card footers) | `src/renderer/public/fixtures/logos/ppsspp.png` | PPSSPP's own icon (from its Flatpak, scaled to 96px), Henrik Rydgård and the PPSSPP project | GPL-2.0-or-later |
| Cemu icon (Wii U card footers) | `src/renderer/public/fixtures/logos/cemu.png` | Cemu's own icon (from its AppImage, scaled to 96px), the Cemu project | MPL-2.0 |
| Flycast icon, and a white copy (Dreamcast card footers) | `src/renderer/public/fixtures/logos/flycast.png`, `flycast-white.png` | EmuDeck's icon pack; the Flycast project's mark (its code is GPL-2.0) | GPL-3.0 (EmuDeck) |
| Battery icons (top bar) | `src/renderer/src/assets/battery/` | Henry Plant, from his alpha-es-de theme for ES-DE | CC0 1.0 |
| UI sounds | `src/renderer/src/assets/sounds/` | alpha-es-de theme for ES-DE | CC0 1.0 |
| ES-DE logo (Apps tile) | `src/renderer/public/fixtures/tiles/esde.webp` | ES-DE (Northwestern Software AB, Leon Styhre) | MIT |
| Controller button icons (welcome tour, Settings → Controller) | `src/renderer/src/assets/buttons/` | alpha-es-de theme for ES-DE | CC0-1.0 |
| IBM Plex Sans (descriptions and help text) | npm `@fontsource/ibm-plex-sans` | IBM | SIL Open Font License 1.1 |
| Marvin Visions Big Bold (headings, tabs, clock and date) | not in this repository; added to Henry's builds from a private folder by `scripts/private-assets.mjs` (cut down to Latin characters, WOFF2) | Atelier Triay Ltd ([readvisions.com](https://www.readvisions.com/marvin)) | Commercial licence held by Henry Plant for vaporTV. **Not** covered by the GPL and not redistributable; builds without it use Tilt Warp and Big Shoulders |
| Tilt Warp (menus and titles) | `src/renderer/src/assets/fonts/` | Andy Clymer (The Tilt Project Authors) | SIL Open Font License 1.1 (`TiltWarp-OFL.txt`) |
| Big Shoulders (clock and date) | `src/renderer/src/assets/fonts/` | Patric King (The Big Shoulders Project Authors) | SIL Open Font License 1.1 (`BigShoulders-OFL.txt`) |
| React, three.js, React Three Fiber, drei, postprocessing, qrcode and other npm dependencies | `package.json` | their authors | MIT / Apache-2.0 / ISC (see each package) |

vaporTV ships no streaming-service or app logos. App tiles and their small icons are
downloaded on your own box from SteamGridDB (with your SteamGridDB key, Settings →
Artwork), where the community uploads them; without a key a tile shows the app's name.
Service names are trademarks of their owners; vaporTV is not affiliated with them.
The emulator icons are their projects' marks, shown only to say which emulator runs a game.
