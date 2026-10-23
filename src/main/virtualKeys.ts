import { spawn, type ChildProcess } from 'node:child_process'
import { ownHelper } from './helpers'

// Keys pressed for an app that wants a different one than a remote sends (YouTube's TV
// app goes back on Escape; remotes' Back sends Backspace). A virtual keyboard, made by a
// small Python helper with the evdev module SteamOS ships (Node can't make input devices).
// Unlike a virtual controller, a spare keyboard bothers nothing, so it stays once made;
// gamescope takes a moment to start reading a new one, so the first press waits for that.

const KEYS = ['KEY_ESC'] as const
export type VirtualKey = (typeof KEYS)[number]

const HELPER = `
import sys, time
from evdev import UInput, ecodes as e

keys = [getattr(e, name) for name in sys.argv[1:]]
board = UInput({e.EV_KEY: keys}, name='vaporTV keys')
time.sleep(1)
for line in sys.stdin:
    code = getattr(e, line.strip(), None)
    if code not in keys: continue
    board.write(e.EV_KEY, code, 1); board.syn(); time.sleep(0.05)
    board.write(e.EV_KEY, code, 0); board.syn()
board.close()
`

let helper: ChildProcess | null = null

/** Presses `key` on vaporTV's virtual keyboard (made on first use). */
export function pressVirtualKey(key: VirtualKey, log: (line: string) => void): void {
  if (process.platform !== 'linux') return
  if (!helper) {
    const child = spawn('python3', ['-c', HELPER, ...KEYS], { stdio: ['pipe', 'ignore', 'pipe'] })
    child.stderr?.on('data', (chunk: Buffer) => log(`virtual keys: ${chunk.toString().trim()}`))
    child.stdin?.on('error', () => undefined)
    child.on('error', (err) => log(`virtual keys: ${err.message}`))
    child.on('exit', () => {
      if (helper === child) helper = null
    })
    ownHelper(child)
    helper = child
  }
  helper.stdin?.write(`${key}\n`)
}
