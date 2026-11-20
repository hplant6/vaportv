import { app, type BrowserWindow } from 'electron'
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { registerDiagnostics } from './diagnostics'
import { trail } from './trail'

// Crashes and hangs, caught where they happen so the log and Report a problem's details say
// what broke: an error main didn't catch, a promise nobody handled, the page crashing (it's
// reloaded, a few times at most, rather than leaving the TV blank), the GPU or another helper
// process dying, the page freezing and coming back, and a page that failed to load.

type Log = (line: string) => void

/** What went wrong this run, newest last (for the details; the log has them too). */
const events: string[] = []

function note(log: Log, line: string): void {
  log(`crash: ${line}`)
  trail(`crash: ${line}`)
  events.push(`${new Date().toISOString()} ${line}`)
  if (events.length > 30) events.shift()
}

/** The page is reloaded after a crash at most this many times in this long, so a page that crashes as it starts doesn't loop. */
const RELOADS = 3
const RELOAD_WINDOW_MS = 5 * 60_000

/** Crash dumps Chromium's own reporter left (never uploaded), as a count and the newest one's time. */
async function dumps(): Promise<{ count: number; newest: string | null }> {
  let count = 0
  let newest = 0
  const walk = async (dir: string, depth: number): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const path = join(dir, entry.name)
      if (entry.isDirectory() && depth < 3) await walk(path, depth + 1)
      else if (entry.name.endsWith('.dmp')) {
        count++
        const ms = (await stat(path).catch(() => null))?.mtimeMs ?? 0
        newest = Math.max(newest, ms)
      }
    }
  }
  await walk(app.getPath('crashDumps'), 0)
  return { count, newest: newest ? new Date(newest).toISOString() : null }
}

/** Starts watching; `window()` is vaporTV's window, when there is one. */
export function watchCrashes(log: Log, window: () => BrowserWindow | null): void {
  process.on('uncaughtException', (err) => note(log, `uncaught in main: ${err?.stack?.split('\n').slice(0, 3).join(' | ') ?? err}`))
  process.on('unhandledRejection', (reason) => {
    const err = reason as Error
    note(log, `unhandled promise in main: ${err?.stack?.split('\n').slice(0, 3).join(' | ') ?? String(reason)}`)
  })

  const reloads: number[] = []
  app.on('render-process-gone', (_event, contents, details) => {
    note(log, `page gone (${details.reason}, exit ${details.exitCode})`)
    const win = window()
    if (!win || win.isDestroyed() || win.webContents !== contents || details.reason === 'clean-exit') return
    const now = Date.now()
    while (reloads.length && now - reloads[0] > RELOAD_WINDOW_MS) reloads.shift()
    if (reloads.length >= RELOADS) return note(log, `page crashed ${RELOADS} times in a few minutes: not reloading again`)
    reloads.push(now)
    note(log, 'reloading the page')
    contents.reload()
  })
  app.on('child-process-gone', (_event, details) => {
    // A helper exiting normally (a utility process finishing its job) isn't news.
    if (details.reason === 'clean-exit') return
    note(log, `${details.type}${details.name ? ` (${details.name})` : ''} process gone (${details.reason}, exit ${details.exitCode})`)
  })
  app.on('web-contents-created', (_event, contents) => {
    contents.on('unresponsive', () => note(log, 'page not responding'))
    contents.on('responsive', () => note(log, 'page responding again'))
    contents.on('did-fail-load', (_e, code, description, _url, isMainFrame) => {
      if (isMainFrame && code !== -3) note(log, `page failed to load (${code} ${description})`)
    })
  })

  registerDiagnostics('crashes', async () => ({ thisRun: events, crashDumps: await dumps() }))
}
