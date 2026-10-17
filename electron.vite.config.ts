import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// VAPORTV_PUBLIC=1 builds the public release, without the extras (see src/shared/build.ts).
const define = { __VAPORTV_EXTRAS__: JSON.stringify(process.env.VAPORTV_PUBLIC !== '1') }

export default defineConfig({
  main: { define },
  preload: {},
  renderer: {
    define,
    plugins: [react()]
  }
})
