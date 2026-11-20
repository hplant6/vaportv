import { describeElement, registerDiagnostics } from './diagnostics'

// The activity trail, the page's side (main has its own, trail.ts there): screens changing,
// where the cursor went, music starting and stopping and why. Kept in memory only, in a
// fixed-size ring, and handed over with Report a problem's snapshot, where it's merged by time
// with main's. Each entry is a timestamp and a short string, never a title, file name or label.

const SIZE = 2000

const entries: string[] = new Array(SIZE)
let next = 0
let count = 0
let lastKey = ''
let lastSlot = -1
let repeats = 0

const stamp = (): string => new Date().toISOString().slice(11, 23)

/** Adds an entry. Repeats in a row (the same `key`) are counted, not added again. */
export function trail(text: string, key = text): void {
  if (key === lastKey && lastSlot >= 0) {
    repeats++
    entries[lastSlot] = `${stamp()} [page] ${text} (×${repeats + 1})`
    return
  }
  lastKey = key
  repeats = 0
  lastSlot = next
  entries[next] = `${stamp()} [page] ${text}`
  next = (next + 1) % SIZE
  count = Math.min(count + 1, SIZE)
}

registerDiagnostics('trail', () => {
  const start = (next - count + SIZE) % SIZE
  return Array.from({ length: count }, (_, i) => entries[(start + i) % SIZE])
})

// Where the cursor goes: what it landed on, by kind (its tag, classes and markers), not its text.
document.addEventListener('focusin', (event) => trail(`focus ${describeElement(event.target as Element)}`))
window.addEventListener('focus', () => trail('window focused'))
window.addEventListener('blur', () => trail('window lost focus'))
document.addEventListener('visibilitychange', () => trail(`page ${document.hidden ? 'hidden' : 'shown'}`))
