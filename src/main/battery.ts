import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { BatteryState } from '../shared/types'

// The system's own battery (a Steam Deck's, a laptop's), for the top bar. Controllers and
// remotes list their batteries here too, but as the "Device" scope: those aren't the
// box's, so they're left out. A box on mains power has none, and shows nothing.

/** $STEAMTV_POWER_SUPPLY: a stand-in folder, for trying the battery on a machine without one. */
const POWER_SUPPLY = process.env.STEAMTV_POWER_SUPPLY ?? '/sys/class/power_supply'

export async function systemBattery(root = POWER_SUPPLY): Promise<BatteryState | null> {
  const read = (name: string, file: string): Promise<string> =>
    readFile(join(root, name, file), 'utf8').then(
      (text) => text.trim(),
      () => ''
    )
  for (const name of await readdir(root).catch(() => [] as string[])) {
    if ((await read(name, 'type')) !== 'Battery' || (await read(name, 'scope')) === 'Device') continue
    const percent = Number(await read(name, 'capacity'))
    if (!Number.isFinite(percent) || (await read(name, 'present')) === '0') continue
    const status = await read(name, 'status')
    return { percent: Math.max(0, Math.min(100, Math.round(percent))), charging: status === 'Charging' || status === 'Full' }
  }
  return null
}
