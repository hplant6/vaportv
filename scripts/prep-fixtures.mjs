// Turns raw Figma exports into the dev fixtures under src/renderer/public/fixtures.
// Usage: npm run fixtures -- <dir with the Figma exports>
import { mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const src = process.argv[2] ?? '/mnt/c/Users/hplan/figma-export/steamtv'
const out = join(dirname(fileURLToPath(import.meta.url)), '../src/renderer/public/fixtures')

const covers = ['the-thing', 'mario-3d-world', 'pragmata', 'the-below']
const logos = { default: 'emby', variant2: 'steam', variant3: 'switch', variant4: 'youtube', variant5: 'netflix' }
const tiles = ['youtube', 'netflix', 'jme', 'disney', 'emby', 'steam', 'doki', 'prime']

for (const dir of ['covers', 'wide', 'logos', 'tiles']) await mkdir(join(out, dir), { recursive: true })

await sharp(join(src, 'background.png')).jpeg({ quality: 88 }).toFile(join(out, 'background.jpg'))

for (const name of covers) {
  await sharp(join(src, `cover-${name}.png`))
    .resize({ width: 600, withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toFile(join(out, 'covers', `${name}.jpg`))
}

await sharp(join(src, 'wide-pragmata.png')).jpeg({ quality: 88 }).toFile(join(out, 'wide', 'pragmata-video.jpg'))

for (const [variant, name] of Object.entries(logos)) {
  const file = join(src, `logo-${variant}`)
  if (variant === 'variant2') {
    await sharp(`${file}.svg`, { density: 600 }).resize({ height: 96 }).png().toFile(join(out, 'logos', `${name}.png`))
  } else {
    await sharp(`${file}.png`).resize({ height: 96 }).png().toFile(join(out, 'logos', `${name}.png`))
  }
}

// Tile renders are 2x exports of the Figma nodes, which include the drop shadow
// around the tile. Crop back to the tile itself.
for (const name of tiles) {
  const image = sharp(join(src, 'tiles2x', `${name}.png`))
  const { width } = await image.metadata()
  const region =
    name === 'youtube'
      ? { left: 77, top: 0, width: 884, height: 498 }
      : { left: 75, top: 55, width: width - 150, height: 478 }
  await image.extract(region).webp({ quality: 92 }).toFile(join(out, 'tiles', `${name}.webp`))
}

console.log(`fixtures written to ${out}`)
