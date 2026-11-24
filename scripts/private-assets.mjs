// Puts licensed assets that can't be in the public repo into the app being built: today,
// the plastic-wrap overlays Now playing lays over album covers (sleeves/*.webp, from
// Pixelbuddha's Plastic Wrap Texture Overlays, cut down to 1024 px; listed in sleeves.json;
// left out of the public release),
// Marvin Visions Big Bold (Atelier Triay), licensed to Henry for vaporTV, for headings,
// tabs and the clock; the console models some tabs' backdrops show (background/products.ts), and the handhelds' screens. They're kept
// outside the repo, in ~/.config/vaportv (the font cut down to Latin characters, as WOFF2),
// and copied to src/renderer/public/private/, which git ignores. Without them (anyone
// else's build) vaporTV uses its free fonts, and those tabs the usual backdrop.
//
// The models are optimised first (optimiseModel, below): duplicate textures merged and single-colour ones made
// plain colours, textures to WebP at their own size, geometry meshopt-compressed. A tenth to a thirtieth of the size, so they load that much sooner; the results are
// kept in ~/.cache/vaportv/models, so it's done once per model, not every build.
//
// The models ship encrypted (AES-256-GCM: a 12-byte IV, then the ciphertext and its tag) as .vtm, so the build
// doesn't hand out plain .glb files; background/product/scene.ts decrypts them. The key lives beside them in
// ~/.config/vaportv/model-key (made here the first time), never in the repo, and electron.vite.config.ts builds
// it into the renderer. It deters casual copying only: the key ships in the app.
//
//   node scripts/private-assets.mjs     (run by npm run dev / build / dist)
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createCipheriv, createHash, randomBytes } from 'node:crypto'
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
  { from: 'models/apps-tv.glb', to: 'apps-tv.vtm', name: 'TV stand model' },
  { from: 'models/apps.glb', to: 'apps.vtm', name: 'VHS tapes model' },
  { from: 'models/music.glb', to: 'music.vtm', name: 'Turntable model' },
  // What the handhelds' screens show (their home screens), laid on the models' screens.
  { from: 'screens/psp.jpg', to: 'screen-psp.jpg', name: 'PSP screen' },
  { from: 'screens/steamdeck.jpg', to: 'screen-steamdeck.jpg', name: 'Steam Deck screen' },
  { from: 'screens/switch.jpg', to: 'screen-switch.jpg', name: 'Switch screen' },
  { from: 'screens/arcade.jpg', to: 'screen-arcade.jpg', name: 'Arcade cabinet screen' },
  { from: 'screens/apps.jpg', to: 'screen-apps.jpg', name: 'Apps TV screen' }
]

const KEY_FILE = join(SOURCE, 'model-key')

/** The models' key (32 bytes, as hex), made the first time there are models to encrypt. */
async function modelKey() {
  if (!existsSync(KEY_FILE)) await writeFile(KEY_FILE, randomBytes(32).toString('hex') + '\n', { mode: 0o600 })
  return Buffer.from((await readFile(KEY_FILE, 'utf8')).trim(), 'hex')
}

async function encrypt(data, to, key) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([cipher.update(data), cipher.final()])
  await writeFile(to, Buffer.concat([iv, body, cipher.getAuthTag()]))
}

/** Change to optimise every model again (new settings below). */
const OPTIMISE_VERSION = 2
const CACHE = join(homedir(), '.cache', 'vaportv', 'models')

/**
 * `from` (a .glb) optimised: textures that are copies of another merged, and those of one colour made that
 * colour (the Wii had 41 textures, 17 different); textures to WebP at their own resolution (normal maps at quality 95,
 * the rest at the encoder's default), geometry meshopt-compressed with finer than default
 * positions and normals, so curved surfaces' highlights don't band. Nothing simplified.
 */
async function optimiseModel(from) {
  const source = await readFile(from)
  const hash = createHash('sha256').update(source).update(`v${OPTIMISE_VERSION}`).digest('hex').slice(0, 16)
  const cached = join(CACHE, `${hash}.glb`)
  if (existsSync(cached)) return readFile(cached)
  const [{ NodeIO }, { ALL_EXTENSIONS }, { dedup, prune, textureCompress, meshopt }, { MeshoptEncoder, MeshoptDecoder }, { default: sharp }] = await Promise.all([
    import('@gltf-transform/core'),
    import('@gltf-transform/extensions'),
    import('@gltf-transform/functions'),
    import('meshoptimizer'),
    import('sharp')
  ])
  await MeshoptEncoder.ready
  await MeshoptDecoder.ready
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder })
  const doc = await io.readBinary(new Uint8Array(source))
  await doc.transform(
    dedup(),
    prune({ keepSolidTextures: false }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^(?!normalTexture$)/ }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^normalTexture$/, quality: 95 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizePosition: 16, quantizeNormal: 12 })
  )
  const out = Buffer.from(await io.writeBinary(doc))
  await mkdir(CACHE, { recursive: true })
  await writeFile(cached, out)
  return out
}

await rm(OUT, { recursive: true, force: true })
const found = ASSETS.filter((asset) => existsSync(join(SOURCE, asset.from)))
if (found.length) await mkdir(OUT, { recursive: true })
const key = found.some((asset) => asset.to.endsWith('.vtm')) ? await modelKey() : null
for (const asset of found) {
  if (asset.to.endsWith('.vtm')) await encrypt(await optimiseModel(join(SOURCE, asset.from)), join(OUT, asset.to), key)
  else await copyFile(join(SOURCE, asset.from), join(OUT, asset.to))
}
// The cover sleeves: whichever are there, and a list of them for the app to choose from. Not
// in the public release (VAPORTV_PUBLIC=1): their licence is for using them, not handing them out.
const sleevesDir = join(SOURCE, 'sleeves')
const sleeves = process.env.VAPORTV_PUBLIC !== '1' && existsSync(sleevesDir) ? (await readdir(sleevesDir)).filter((f) => f.endsWith('.webp')).sort() : []
if (sleeves.length) {
  await mkdir(join(OUT, 'sleeves'), { recursive: true })
  for (const f of sleeves) await copyFile(join(SOURCE, 'sleeves', f), join(OUT, 'sleeves', f))
  await writeFile(join(OUT, 'sleeves.json'), JSON.stringify(sleeves.map((f) => `sleeves/${f}`)) + '\n')
  found.push({ name: `${sleeves.length} cover sleeves` })
}
console.log(`private assets: ${found.map((asset) => asset.name).join(', ') || 'none (free fonts only)'}`)
