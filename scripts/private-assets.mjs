// Puts licensed assets that can't be in the public repo into the app being built: today,
// Marvin Visions Big Bold (Atelier Triay), licensed to Henry for vaporTV, for headings,
// tabs and the clock; the console models some tabs' backdrops show (background/products.ts), and the handhelds' screens. They're kept
// outside the repo, in ~/.config/vaportv (the font cut down to Latin characters, as WOFF2),
// and copied to src/renderer/public/private/, which git ignores. Without them (anyone
// else's build) vaporTV uses its free fonts, and those tabs the usual backdrop.
//
// The models ship encrypted (AES-256-GCM: a 12-byte IV, then the ciphertext and its tag) as .vtm, so the build
// doesn't hand out plain .glb files; background/product/scene.ts decrypts them. The key lives beside them in
// ~/.config/vaportv/model-key (made here the first time), never in the repo, and electron.vite.config.ts builds
// it into the renderer. It deters casual copying only: the key ships in the app.
//
//   node scripts/private-assets.mjs     (run by npm run dev / build / dist)
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createCipheriv, randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const SOURCE = join(homedir(), '.config', 'vaportv')
const OUT = 'src/renderer/public/private'
const ASSETS = [
  { from: 'fonts/marvin-visions-big-bold.woff2', to: 'display.woff2', name: 'Marvin Visions Big Bold' },
  { from: 'models/ps3-slim.glb', to: 'ps3-slim.vtm', name: 'PS3 Slim model' },
  { from: 'models/switch.glb', to: 'switch.vtm', name: 'Switch model' },
  { from: 'models/wii.glb', to: 'wii.vtm', name: 'Wii model' },
  { from: 'models/wiiu.glb', to: 'wiiu.vtm', name: 'Wii U model' },
  { from: 'models/n64.glb', to: 'n64.vtm', name: 'N64 model' },
  { from: 'models/xbox360.glb', to: 'xbox360.vtm', name: 'Xbox 360 model' },
  { from: 'models/gamecube.glb', to: 'gamecube.vtm', name: 'GameCube model' },
  { from: 'models/psp.glb', to: 'psp.vtm', name: 'PSP model' },
  { from: 'models/saturn.glb', to: 'saturn.vtm', name: 'Saturn model' },
  { from: 'models/dreamcast.glb', to: 'dreamcast.vtm', name: 'Dreamcast model' },
  { from: 'models/ps2.glb', to: 'ps2.vtm', name: 'PS2 model' },
  { from: 'models/psx.glb', to: 'psx.vtm', name: 'PlayStation model' },
  { from: 'models/snes.glb', to: 'snes.vtm', name: 'SNES model' },
  { from: 'models/steamdeck.glb', to: 'steamdeck.vtm', name: 'Steam Deck model' },
  { from: 'models/nes.glb', to: 'nes.vtm', name: 'NES model' },
  { from: 'models/genesis.glb', to: 'genesis.vtm', name: 'Genesis model' },
  { from: 'models/xbox.glb', to: 'xbox.vtm', name: 'Xbox model' },
  { from: 'models/arcade.glb', to: 'arcade.vtm', name: 'Arcade cabinet model' },
  { from: 'models/neogeo.glb', to: 'neogeo.vtm', name: 'Neo Geo model' },
  { from: 'models/apps.glb', to: 'apps.vtm', name: 'VHS tapes model' },
  // What the handhelds' screens show (their home screens), laid on the models' screens.
  { from: 'screens/psp.jpg', to: 'screen-psp.jpg', name: 'PSP screen' },
  { from: 'screens/steamdeck.jpg', to: 'screen-steamdeck.jpg', name: 'Steam Deck screen' },
  { from: 'screens/switch.jpg', to: 'screen-switch.jpg', name: 'Switch screen' },
  { from: 'screens/arcade.jpg', to: 'screen-arcade.jpg', name: 'Arcade cabinet screen' }
]

const KEY_FILE = join(SOURCE, 'model-key')

/** The models' key (32 bytes, as hex), made the first time there are models to encrypt. */
async function modelKey() {
  if (!existsSync(KEY_FILE)) await writeFile(KEY_FILE, randomBytes(32).toString('hex') + '\n', { mode: 0o600 })
  return Buffer.from((await readFile(KEY_FILE, 'utf8')).trim(), 'hex')
}

async function encrypt(from, to, key) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([cipher.update(await readFile(from)), cipher.final()])
  await writeFile(to, Buffer.concat([iv, body, cipher.getAuthTag()]))
}

await rm(OUT, { recursive: true, force: true })
const found = ASSETS.filter((asset) => existsSync(join(SOURCE, asset.from)))
if (found.length) await mkdir(OUT, { recursive: true })
const key = found.some((asset) => asset.to.endsWith('.vtm')) ? await modelKey() : null
for (const asset of found) {
  if (asset.to.endsWith('.vtm')) await encrypt(join(SOURCE, asset.from), join(OUT, asset.to), key)
  else await copyFile(join(SOURCE, asset.from), join(OUT, asset.to))
}
console.log(`private assets: ${found.map((asset) => asset.name).join(', ') || 'none (free fonts only)'}`)
