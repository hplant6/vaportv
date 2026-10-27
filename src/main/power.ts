import { execFile, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { app } from 'electron'
import type { PowerAction } from '../shared/types'
import { disconnectAllBluetooth } from './bluetooth'

/** Only act on the box itself; on a dev machine these would sleep or switch off the PC. */
export function onSteamOS(): boolean {
  try {
    return /^ID=steamos$/m.test(readFileSync('/etc/os-release', 'utf8'))
  } catch {
    return false
  }
}

function run(command: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'ignore' })
    child.on('error', () => resolve(false))
    child.on('exit', (code) => resolve(code === 0))
  })
}

/** The power menu's actions. Resolves false if the action couldn't be carried out. */
export async function power(action: PowerAction): Promise<boolean> {
  if (action === 'steam') {
    // Quitting steamtv leaves Gaming Mode on Steam's own UI.
    setTimeout(() => app.quit(), 400)
    return true
  }
  if (!onSteamOS()) {
    console.log(`steamtv: power ${action} ignored (not SteamOS)`)
    return false
  }
  switch (action) {
    case 'desktop':
      // SteamOS's own switch, as Steam's "Switch to Desktop" does.
      return run('steamos-session-select', ['plasma'])
    case 'sleep':
      await disconnectAllBluetooth()
      return run('systemctl', ['suspend'])
    case 'restart':
      return run('systemctl', ['reboot'])
    case 'poweroff':
      return run('systemctl', ['poweroff'])
  }
}

/**
 * What, if anything, is holding a sleep block (`systemd-inhibit --list`), e.g. a long
 * copy: its reason. Delay locks (every box has a few) only hold sleep up briefly.
 */
export function parseSleepBlocker(list: string): string | null {
  for (const line of list.split('\n')) {
    // WHO  UID  USER  PID  COMM  WHAT  WHY  MODE, in columns two or more spaces apart.
    const m = /^(.*?)\s{2,}\d+\s+\S+\s+\d+\s+\S+\s+(\S+)\s+(.*?)\s+(block|delay)\s*$/.exec(line)
    if (m && m[4] === 'block' && m[2].split(':').includes('sleep')) return m[3].trim() || m[1].trim()
  }
  return null
}

/** Something's reason for keeping the box awake, or null if nothing is. */
export async function sleepBlocker(): Promise<string | null> {
  if (!onSteamOS()) return null
  const list = await new Promise<string>((resolve) =>
    execFile('systemd-inhibit', ['--list', '--no-pager', '--no-legend'], (err, stdout) => resolve(err ? '' : stdout))
  )
  return parseSleepBlocker(list)
}
