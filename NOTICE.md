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
| "Gradient Drift" (Gradient Drift backdrop: shaders, presets, circle motion) | `src/renderer/src/background/drift/`, `DriftBackground.tsx` | Liam Egan (codepen.io/shubniggurath), ported from WebGL via wtc-gl to plain WebGL2 | MIT (CodePen public pen) |
| Asphalt textures (`road/`) and HDR sky (`shanghai_bund_2k.hdr`) | `src/renderer/public/backdrops/rain/` | Poly Haven, via the rain demo | CC0 |
| Litter decal (`debris/`) | `src/renderer/public/backdrops/rain/debris/` | vaporTV, drawn by `scripts/make-debris-decal.mjs` (replaced the demo's Megascans decal) | GPL-3.0, as vaporTV |
| Rain splash flipbook (`Splash.png`) | `src/renderer/public/backdrops/rain/` | Faraz Shaikh (rain demo) | GPL-3.0 |
| Rain sound (`rain.mp3`, light-rain-109591) | `src/renderer/public/music/` | Pixabay, via the rain demo | Pixabay Content License (use within an app) |
| Arcade game names, years and parent sets (`arcade-names.json`) | `src/main/library/` | MAME 0289 `-listxml`, the MAME team; rebuilt by `scripts/make-arcade-names.py` | GPL-2.0-or-later (MAME) |
| RetroArch icon (arcade card footers, recoloured white) | `src/renderer/public/fixtures/logos/retroarch.svg` | Simple Icons; the RetroArch logo is libretro's trademark | CC0 1.0 (SVG data) |
| UI sounds | `src/renderer/src/assets/sounds/` | alpha-es-de theme for ES-DE | CC0 1.0 |
| ES-DE logo (Apps tile) | `src/renderer/public/fixtures/tiles/esde.webp` | ES-DE (Northwestern Software AB, Leon Styhre) | MIT |
| IBM Plex Mono | npm `@fontsource/ibm-plex-mono` | IBM | SIL Open Font License 1.1 |
| Tilt Warp (menus and titles) | `src/renderer/src/assets/fonts/` | Andy Clymer (The Tilt Project Authors) | SIL Open Font License 1.1 (`TiltWarp-OFL.txt`) |
| Big Shoulders (clock and date) | `src/renderer/src/assets/fonts/` | Patric King (The Big Shoulders Project Authors) | SIL Open Font License 1.1 (`BigShoulders-OFL.txt`) |
| React, three.js, React Three Fiber, drei, postprocessing, qrcode and other npm dependencies | `package.json` | their authors | MIT / Apache-2.0 / ISC (see each package) |

Streaming service names and logos used on app tiles are trademarks of their owners;
vaporTV is not affiliated with them.
