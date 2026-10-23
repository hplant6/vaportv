// Puts licensed assets that can't be in the public repo into the app being built: today,
// Marvin Visions Big Bold (Atelier Triay), licensed to Henry for vaporTV, for headings,
// tabs and the clock. It's kept outside the repo, in ~/.config/vaportv/fonts (cut down
// to Latin characters, as WOFF2), and copied to src/renderer/public/private/, which git
// ignores. Without it (anyone else's build) vaporTV uses its free fonts instead.
//
//   node scripts/private-assets.mjs     (run by npm run dev / build / dist)
import { copyFile, mkdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const SOURCE = join(homedir(), '.config', 'vaportv', 'fonts', 'marvin-visions-big-bold.woff2')
const OUT = 'src/renderer/public/private'

if (existsSync(SOURCE)) {
  await mkdir(OUT, { recursive: true })
  await copyFile(SOURCE, join(OUT, 'display.woff2'))
  console.log('private assets: Marvin Visions Big Bold')
} else {
  await rm(OUT, { recursive: true, force: true })
  console.log('private assets: none (free fonts only)')
}
