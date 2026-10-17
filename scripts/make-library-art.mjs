// Builds vaporTV's Steam library art (cover, banner, hero, logo) into build/library-art/,
// which the installer copies into Steam's grid folder for the vaporTV shortcut, and the
// app icon (build/icon.png, which electron-builder picks up; a copy ships as library art).
//
//   node scripts/make-library-art.mjs
//
// The background is vaporTV's own sea backdrop at sunset (source-sea-sunset.jpg, a
// screenshot taken with STEAMTV_BACKDROP_ONLY=1 STEAMTV_TIME=18:20); the wordmark is
// set in Tilt Warp, the font vaporTV's menus use.
import { copyFile, mkdir } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'

const OUT = 'build/library-art'
const SOURCE = join(OUT, 'source-sea-sunset.jpg')

// librsvg finds fonts through fontconfig: make Tilt Warp visible to it.
const fontDir = join(homedir(), '.local', 'share', 'fonts', 'vaportv-build')
await mkdir(fontDir, { recursive: true })
await copyFile('src/renderer/src/assets/fonts/TiltWarp.ttf', join(fontDir, 'TiltWarp.ttf'))
execFileSync('fc-cache', ['-f', fontDir])

/** The wordmark as an SVG layer, `size` px tall, centred in a w x h box. */
function wordmark(w, h, size, y = h / 2) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><filter id="s" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="${size / 24}" stdDeviation="${size / 14}" flood-color="#000" flood-opacity="0.55"/>
    </filter></defs>
    <text x="${w / 2}" y="${y}" font-family="Tilt Warp" font-size="${size}" fill="#fff" text-anchor="middle"
      dominant-baseline="central" filter="url(#s)">vaporTV</text>
  </svg>`)
}

/** The backdrop cropped to w x h around its horizon, darkened a touch so the wordmark reads. */
async function background(w, h, gravity = 'centre') {
  return sharp(SOURCE).resize(w, h, { fit: 'cover', position: gravity }).modulate({ brightness: 0.85 }).toBuffer()
}

async function compose(file, w, h, size, y) {
  await sharp(await background(w, h))
    .composite([{ input: wordmark(w, h, size, y) }])
    .png()
    .toFile(join(OUT, file))
  console.log('wrote', file)
}

await mkdir(OUT, { recursive: true })
await compose('capsule.png', 600, 900, 130, 330)
await compose('header.png', 920, 430, 150)
// The hero sits behind the logo in Steam's game page, so it has no wordmark of its own.
await sharp(await background(1920, 620)).png().toFile(join(OUT, 'hero.png'))
console.log('wrote hero.png')
await sharp(wordmark(1280, 400, 260)).png().toFile(join(OUT, 'logo.png'))
console.log('wrote logo.png')

// The app icon: the sunset in a rounded square with a big "v", which still reads at 32px.
const ICON = 512
const iconMask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${ICON}" height="${ICON}">
  <rect width="${ICON}" height="${ICON}" rx="${ICON * 0.22}" fill="#fff"/></svg>`)
const iconLetter = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${ICON}" height="${ICON}">
  <defs><filter id="s" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#000" flood-opacity="0.5"/>
  </filter></defs>
  <text x="${ICON / 2}" y="${ICON * 0.46}" font-family="Tilt Warp" font-size="${ICON * 0.78}" fill="#fff" text-anchor="middle"
    dominant-baseline="central" filter="url(#s)">v</text>
</svg>`)
const icon = await sharp(await background(ICON, ICON))
  .composite([{ input: iconLetter }, { input: iconMask, blend: 'dest-in' }])
  .png()
  .toBuffer()
await sharp(icon).toFile('build/icon.png')
await sharp(icon).toFile(join(OUT, 'icon.png'))
console.log('wrote icon.png')
