import { spawn, type ChildProcess } from 'node:child_process'

// Steam's menu from a remote. Steam opens it only for a controller's Steam button (in
// Gaming Mode no key does it), so this makes a virtual Xbox pad and presses its Guide
// button. Node can't make input devices, so a small Python helper does it, with the
// evdev module SteamOS ships. The pad lives only around presses: one that stayed would be
// a phantom controller in games, maybe player 1. Steam takes ~0.7s to start reading a new
// pad, so the helper waits for that, then stays a few seconds for a second press
// (closing the menu) to be instant.

const HELPER = `
import glob, os, select, sys, time
from evdev import AbsInfo, UInput, ecodes as e

stick, trigger, hat = AbsInfo(0, -32768, 32767, 16, 128, 0), AbsInfo(0, 0, 255, 0, 0, 0), AbsInfo(0, -1, 1, 0, 0, 0)
pad = UInput({
    e.EV_KEY: [e.BTN_SOUTH, e.BTN_EAST, e.BTN_NORTH, e.BTN_WEST, e.BTN_TL, e.BTN_TR, e.BTN_SELECT, e.BTN_START,
               e.BTN_MODE, e.BTN_THUMBL, e.BTN_THUMBR],
    e.EV_ABS: [(e.ABS_X, stick), (e.ABS_Y, stick), (e.ABS_RX, stick), (e.ABS_RY, stick),
               (e.ABS_Z, trigger), (e.ABS_RZ, trigger), (e.ABS_HAT0X, hat), (e.ABS_HAT0Y, hat)],
}, name='Microsoft X-Box 360 pad', vendor=0x045e, product=0x028e, version=0x110, bustype=e.BUS_USB)
node = pad.device.path

def steam_reads_pad():
    for comm in glob.glob('/proc/[0-9]*/comm'):
        try:
            if open(comm).read().strip() != 'steam': continue
            if any(os.readlink(fd) == node for fd in glob.glob(comm[:-4] + 'fd/*')): return True
        except OSError: pass
    return False

deadline = time.time() + 3
while not steam_reads_pad() and time.time() < deadline: time.sleep(0.02)
time.sleep(0.1)
print('ready' if steam_reads_pad() else 'steam never opened the pad', file=sys.stderr, flush=True)
while select.select([sys.stdin], [], [], 8)[0] and sys.stdin.readline():
    pad.write(e.EV_KEY, e.BTN_MODE, 1); pad.syn(); time.sleep(0.1)
    pad.write(e.EV_KEY, e.BTN_MODE, 0); pad.syn()
pad.close()
`

let helper: ChildProcess | null = null

/** Presses a controller's Steam button, which opens (or closes) Steam's menu. */
export function pressSteamButton(log: (line: string) => void): void {
  if (process.platform !== 'linux') return
  if (!helper) {
    const child = spawn('python3', ['-c', HELPER], { stdio: ['pipe', 'ignore', 'pipe'] })
    child.stderr?.on('data', (chunk: Buffer) => log(`steam button: ${chunk.toString().trim()}`))
    child.stdin?.on('error', () => undefined)
    child.on('error', (err) => log(`steam button: ${err.message}`))
    child.on('exit', () => {
      if (helper === child) helper = null
    })
    helper = child
  }
  helper.stdin?.write('press\n')
}
