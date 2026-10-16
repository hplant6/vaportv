// Placeholder Favorite Apps tiles (852×478, like the Figma exports) for apps that
// don't have a designed tile yet: the service's colours and its name.
import sharp from 'sharp'
import { join } from 'node:path'

const OUT = new URL('../src/renderer/public/fixtures/tiles/', import.meta.url).pathname

const TILES = [
  { id: 'max', text: 'HBO max', from: '#002be7', to: '#0b0c3d', color: '#ffffff' },
  { id: 'hulu', text: 'hulu', from: '#0b0c0f', to: '#1a1d21', color: '#1ce783' },
  { id: 'paramount', text: 'Paramount+', from: '#0064ff', to: '#00267a', color: '#ffffff' },
  { id: 'peacock', text: 'Peacock', from: '#000000', to: '#16161a', color: '#ffffff', dots: true },
  { id: 'tubi', text: 'tubi', from: '#7408ff', to: '#33006f', color: '#fff200' },
  { id: 'jellyfin', text: 'Jellyfin', from: '#aa5cc3', to: '#00a4dc', color: '#ffffff' }
]

// Peacock's six brand colours, as a row of dots above the name.
const PEACOCK = ['#ffc000', '#ff8a00', '#ff3c3c', '#a84cff', '#2f8fff', '#00c868']

for (const t of TILES) {
  const dots = t.dots
    ? PEACOCK.map((c, i) => `<circle cx="${336 + i * 36}" cy="150" r="13" fill="${c}"/>`).join('')
    : ''
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="852" height="478">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${t.from}"/><stop offset="1" stop-color="${t.to}"/>
    </linearGradient></defs>
    <rect width="852" height="478" fill="url(#g)"/>
    ${dots}
    <text x="426" y="${t.dots ? 290 : 270}" font-family="DejaVu Sans" font-weight="bold" font-size="${t.text.length > 8 ? 96 : 120}"
      fill="${t.color}" text-anchor="middle" letter-spacing="-2">${t.text}</text>
  </svg>`
  await sharp(Buffer.from(svg)).webp({ quality: 90 }).toFile(join(OUT, `${t.id}.webp`))
  console.log('wrote', t.id)
}
