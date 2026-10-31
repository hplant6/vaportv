// Puts licensed assets that can't be in the public repo into the app being built: today,
// Marvin Visions Big Bold (Atelier Triay), licensed to Henry for vaporTV, for headings,
// tabs and the clock; and the console models some tabs' backdrops show (background/products.ts). They're kept
// outside the repo, in ~/.config/vaportv (the font cut down to Latin characters, as WOFF2),
// and copied to src/renderer/public/private/, which git ignores. Without them (anyone
// else's build) vaporTV uses its free fonts, and those tabs the usual backdrop.
//
//   node scripts/private-assets.mjs     (run by npm run dev / build / dist)
import { copyFile, mkdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const SOURCE = join(homedir(), '.config', 'vaportv')
const OUT = 'src/renderer/public/private'
const ASSETS = [
  { from: 'fonts/marvin-visions-big-bold.woff2', to: 'display.woff2', name: 'Marvin Visions Big Bold' },
  { from: 'models/ps3-slim.glb', to: 'ps3-slim.glb', name: 'PS3 Slim model' },
  { from: 'models/switch.glb', to: 'switch.glb', name: 'Switch model' },
  { from: 'models/wii.glb', to: 'wii.glb', name: 'Wii model' },
  { from: 'models/wiiu.glb', to: 'wiiu.glb', name: 'Wii U model' },
  { from: 'models/n64.glb', to: 'n64.glb', name: 'N64 model' },
  { from: 'models/xbox360.glb', to: 'xbox360.glb', name: 'Xbox 360 model' },
  { from: 'models/gamecube.glb', to: 'gamecube.glb', name: 'GameCube model' },
  { from: 'models/psp.glb', to: 'psp.glb', name: 'PSP model' },
  { from: 'models/saturn.glb', to: 'saturn.glb', name: 'Saturn model' },
  { from: 'models/dreamcast.glb', to: 'dreamcast.glb', name: 'Dreamcast model' },
  { from: 'models/ps2.glb', to: 'ps2.glb', name: 'PS2 model' },
  { from: 'models/psx.glb', to: 'psx.glb', name: 'PlayStation model' },
  { from: 'models/snes.glb', to: 'snes.glb', name: 'SNES model' },
  { from: 'models/steamdeck.glb', to: 'steamdeck.glb', name: 'Steam Deck model' }
]

await rm(OUT, { recursive: true, force: true })
const found = ASSETS.filter((asset) => existsSync(join(SOURCE, asset.from)))
if (found.length) await mkdir(OUT, { recursive: true })
for (const asset of found) await copyFile(join(SOURCE, asset.from), join(OUT, asset.to))
console.log(`private assets: ${found.map((asset) => asset.name).join(', ') || 'none (free fonts only)'}`)
