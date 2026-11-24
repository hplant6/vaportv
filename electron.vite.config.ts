import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// VAPORTV_PUBLIC=1 builds the public release, without the extras (see src/shared/build.ts).
const define = { __VAPORTV_EXTRAS__: JSON.stringify(process.env.VAPORTV_PUBLIC !== '1') }

// The key the console models are encrypted with (scripts/private-assets.mjs makes it, beside them, outside the
// repo); empty in a build without them.
const modelKeyFile = join(homedir(), '.config', 'vaportv', 'model-key')
const modelKey = existsSync(modelKeyFile) ? readFileSync(modelKeyFile, 'utf8').trim() : ''

// package.json's `dependencies` are left out of main's bundle and shipped as node_modules in
// the AppImage, so only what main loads at runtime goes there (qrcode). Everything else is a
// devDependency: Vite bundles it, and the AppImage doesn't carry a second copy.
export default defineConfig({
  main: { define },
  preload: {},
  renderer: {
    define: { ...define, __MODEL_KEY__: JSON.stringify(modelKey) },
    plugins: [react()]
  }
})
