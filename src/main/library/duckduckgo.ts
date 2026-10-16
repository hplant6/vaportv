import { BrowserWindow } from 'electron'
import type { WebImage } from './webImages'

// DuckDuckGo image search, free and keyless. It has no API: its page asks a script
// challenge of anything that isn't a browser, so the search runs the real page in a
// hidden window and reads the results the page itself fetches (its i.js request).
// Unofficial, so it may break when DuckDuckGo changes; Brave's API is the steady option.

const TIMEOUT_MS = 20000
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Safari/537.36'

interface DuckResult {
  image?: string
  thumbnail?: string
  width?: number
  height?: number
  source?: string
}

let busy: Promise<unknown> = Promise.resolve()

/** One search at a time: each runs in its own hidden window. */
export function searchDuckDuckGo(query: string): Promise<WebImage[]> {
  const run = busy.then(() => search(query))
  busy = run.catch(() => {})
  return run
}

async function search(query: string): Promise<WebImage[]> {
  const win = new BrowserWindow({
    show: false,
    focusable: false,
    webPreferences: { partition: 'persist:duckduckgo', backgroundThrottling: false }
  })
  win.webContents.setUserAgent(UA)
  win.webContents.setAudioMuted(true)
  try {
    await win.loadURL('about:blank')
    const debug = win.webContents.debugger
    debug.attach('1.3')
    await debug.sendCommand('Network.enable')
    const results = new Promise<DuckResult[]>((resolve, reject) => {
      const requests = new Set<string>()
      const timer = setTimeout(() => reject(new Error("DuckDuckGo didn't send pictures. Try again in a moment.")), TIMEOUT_MS)
      debug.on('message', (_event, method, params) => {
        if (method === 'Network.responseReceived' && params.response.url.includes('duckduckgo.com/i.js')) requests.add(params.requestId)
        if (method !== 'Network.loadingFinished' || !requests.has(params.requestId)) return
        debug
          .sendCommand('Network.getResponseBody', { requestId: params.requestId })
          .then(({ body }: { body: string }) => {
            const json = JSON.parse(body) as { results?: DuckResult[] }
            if (!json.results) return
            clearTimeout(timer)
            resolve(json.results)
          })
          .catch(() => {})
      })
    })
    void win.loadURL(`https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`).catch(() => {})
    return (await results).flatMap((r) =>
      r.image && r.thumbnail && /^https?:/.test(r.image)
        ? [{ url: r.image, thumb: r.thumbnail, width: r.width, height: r.height, source: r.source }]
        : []
    )
  } finally {
    win.destroy()
  }
}
