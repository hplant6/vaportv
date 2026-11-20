import type { IpcMain } from 'electron'

// The activity trail, main's side: the last few thousand things that happened, kept in memory
// only (never written to disk) and put in Report a problem's full details, merged by time with
// the page's (renderer trail.ts). The log says what was pressed; the trail says what vaporTV did
// about it: every call the page made to main, how long it took and what came back ("340 items",
// "error: ..."). Each entry is a timestamp and a short string in a fixed-size ring, so keeping it
// costs next to nothing.

/** Entries kept: several minutes of busy use. */
const SIZE = 3000

const entries: string[] = new Array(SIZE)
let next = 0
let count = 0
/** The last entry's key, and its slot: a repeat bumps a count instead of adding a line. */
let lastKey = ''
let lastSlot = -1
let repeats = 0

const stamp = (): string => new Date().toISOString().slice(11, 23)

/** Adds an entry. Repeats in a row (the same `key`: a call with the same result, whatever it took) are counted, not added again. */
export function trail(text: string, key = text): void {
  if (key === lastKey && lastSlot >= 0) {
    repeats++
    entries[lastSlot] = `${stamp()} [main] ${text} (×${repeats + 1})`
    return
  }
  lastKey = key
  repeats = 0
  lastSlot = next
  entries[next] = `${stamp()} [main] ${text}`
  next = (next + 1) % SIZE
  count = Math.min(count + 1, SIZE)
}

/** The trail, oldest first. */
export function trailEntries(): string[] {
  const start = (next - count + SIZE) % SIZE
  return Array.from({ length: count }, (_, i) => entries[(start + i) % SIZE])
}

/** What a call returned, in a few words: never the values themselves (titles, paths), only their shape. */
export function summarize(value: unknown): string {
  if (value === undefined) return 'done'
  if (value === null) return 'null'
  if (typeof value === 'boolean' || typeof value === 'number') return String(value)
  if (typeof value === 'string') return `text (${value.length})`
  if (Array.isArray(value)) return `${value.length} items`
  if (typeof value === 'object') {
    // A list inside an object (most replies are { items: [...] } or the like): its size says most.
    const lists = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => Array.isArray(v))
      .slice(0, 3)
      .map(([k, v]) => `${k}: ${(v as unknown[]).length}`)
    return lists.length ? `{ ${lists.join(', ')} }` : `{ ${Object.keys(value as object).length} fields }`
  }
  return typeof value
}

/** A call this slow is marked, to stand out. */
const SLOW_MS = 1000

/**
 * Every ipcMain.handle registered after this is traced: its channel, how long it took, and the
 * shape of what came back, or its error (a short message, home folder and all, scrubbed later).
 */
export function traceIpc(ipc: IpcMain): void {
  const handle = ipc.handle.bind(ipc)
  ipc.handle = (channel, listener) =>
    handle(channel, async (event, ...args) => {
      const start = performance.now()
      try {
        const result = await listener(event, ...args)
        const ms = Math.round(performance.now() - start)
        const said = summarize(result)
        trail(`${channel} ${ms >= SLOW_MS ? `SLOW ${ms}` : ms} ms → ${said}`, `${channel} → ${said}`)
        return result
      } catch (err) {
        const ms = Math.round(performance.now() - start)
        trail(`${channel} ${ms} ms → error: ${String((err as Error)?.message ?? err).slice(0, 160)}`)
        throw err
      }
    })
}
