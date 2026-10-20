import { readFile } from 'node:fs/promises'
import { readKeys } from './evdev'
import { power, sleepBlocker } from './power'

// A remote's power button puts the box to sleep, whatever is on screen. SteamOS ignores
// the Power key (Steam handles the box's own button), so remotes that send it — a
// Sofabaton hub over Bluetooth, a USB TV remote — would otherwise do nothing.

const KEY_POWER = 116
const RESCAN_MS = 5000
/** After waking, Power is ignored this long: a remote's "on" may send it too. */
const AFTER_WAKE_MS = 15_000
/** A gap this long between ticks means the box was asleep. */
const ASLEEP_GAP_MS = 5000

type Log = (line: string) => void

/** Whether a device's KEY= capability bitmap (64-bit words, most significant first) has `code`. */
export function hasKey(bitmap: string, code: number): boolean {
  const words = bitmap.trim().split(/\s+/).reverse()
  const word = words[Math.floor(code / 64)]
  return !!word && ((BigInt(`0x${word}`) >> BigInt(code % 64)) & 1n) === 1n
}

/**
 * Remotes' keyboards from the kernel's device list: Bluetooth (bus 0005) or USB (0003)
 * keyboards with a Power key. The box's own power button (bus 0019) is left to Steam.
 */
export function remoteKeyboards(devices: string): string[] {
  return devices
    .split('\n\n')
    .filter((block) => /^I: Bus=000[35]\b/m.test(block) && !/^N: Name=".*power button/im.test(block))
    .filter((block) => hasKey(/^B: KEY=(.*)$/m.exec(block)?.[1] ?? '', KEY_POWER))
    .map((block) => /^H: Handlers=.*\b(event\d+)\b/m.exec(block)?.[1])
    .filter((name): name is string => !!name)
    .map((name) => `/dev/input/${name}`)
}

export function startRemotePower(log: Log): void {
  if (process.platform !== 'linux') return
  const watched = new Set<string>()
  let lastTick = Date.now()
  let awokeAt = 0
  let sleepingUntil = 0

  // The process is paused while the box sleeps, so a long gap between ticks is a wake.
  setInterval(() => {
    const now = Date.now()
    if (now - lastTick > ASLEEP_GAP_MS) awokeAt = now
    lastTick = now
  }, 1000)

  const pressed = async (): Promise<void> => {
    const now = Date.now()
    if (now - awokeAt < AFTER_WAKE_MS || now < sleepingUntil) return log('remote power: ignored (just woke)')
    const why = await sleepBlocker()
    if (why) return log(`remote power: staying awake (${why})`)
    log('remote power: sleeping')
    sleepingUntil = now + AFTER_WAKE_MS
    await power('sleep')
  }

  const watch = (path: string): void => {
    readKeys(
      path,
      (code, value) => {
        if (code === KEY_POWER && value === 1) pressed().catch((err) => log(`remote power: ${err}`))
      },
      () => watched.delete(path)
    )
    watched.add(path)
    log(`remote power: watching ${path}`)
  }

  // Bluetooth remotes come and go (they disconnect to save battery), hence the rescans.
  const rescan = async (): Promise<void> => {
    const devices = await readFile('/proc/bus/input/devices', 'utf8').catch(() => '')
    for (const path of remoteKeyboards(devices)) if (!watched.has(path)) watch(path)
  }
  rescan()
  setInterval(rescan, RESCAN_MS)
}
