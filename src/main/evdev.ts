import { close, constants, open, read } from 'node:fs'

// Reading input devices (/dev/input/event*) without tying up a thread. A plain read
// stream waits for the next event on one of Node's four file threads, so a few idle
// controllers and remotes would leave none for anything else (and vaporTV's library
// stopped loading). Opened non-blocking instead, and read a little at a time.

const EV_KEY = 1
/** struct input_event on 64-bit Linux: timeval (16) + type (2) + code (2) + value (4). */
const EVENT_SIZE = 24
/** How often an idle device is looked at again: quick enough that a press feels instant. */
const POLL_MS = 15

/**
 * Calls `onKey(code, value)` for each key event from the device at `path` (value 1 is a
 * press, 0 a release, 2 a repeat) until it goes away, then `onGone`. Returns a stop.
 */
export function readKeys(path: string, onKey: (code: number, value: number) => void, onGone: () => void): () => void {
  const buffer = Buffer.alloc(EVENT_SIZE * 64)
  let fd: number | null = null
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const finish = (): void => {
    if (stopped) return
    stopped = true
    clearTimeout(timer)
    if (fd !== null) close(fd, () => undefined)
    onGone()
  }

  const next = (): void => {
    if (stopped || fd === null) return
    read(fd, buffer, 0, buffer.length, null, (err, bytes) => {
      if (stopped) return
      // Nothing waiting: look again shortly. Anything else (the device unplugged): done.
      if (err) return (err as NodeJS.ErrnoException).code === 'EAGAIN' ? void (timer = setTimeout(next, POLL_MS)) : finish()
      for (let at = 0; at + EVENT_SIZE <= bytes; at += EVENT_SIZE) {
        if (buffer.readUInt16LE(at + 16) === EV_KEY) onKey(buffer.readUInt16LE(at + 18), buffer.readInt32LE(at + 20))
      }
      // A full buffer may mean more waiting; otherwise rest a moment.
      if (bytes === buffer.length) next()
      else timer = setTimeout(next, POLL_MS)
    })
  }

  open(path, constants.O_RDONLY | constants.O_NONBLOCK, (err, opened) => {
    if (err) return finish()
    fd = opened
    next()
  })
  return finish
}
