// What kind of build this is. The public release (VAPORTV_PUBLIC=1 npm run dist) leaves
// out the extras: the Google Photos/Drive add-on and the unofficial DuckDuckGo image
// search. Other builds (development, the author's box) keep them.

declare const __VAPORTV_EXTRAS__: boolean

/** Whether the extras are in this build (true when not built by electron-vite, as in tests). */
export const EXTRAS: boolean = typeof __VAPORTV_EXTRAS__ === 'undefined' || __VAPORTV_EXTRAS__
