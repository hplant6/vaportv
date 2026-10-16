import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { app } from 'electron'
import type { PowerAction } from '../shared/types'

/** Only act on the box itself; on a dev machine these would sleep or switch off the PC. */
function onSteamOS(): boolean {
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
      return run('systemctl', ['suspend'])
    case 'poweroff':
      return run('systemctl', ['poweroff'])
  }
}
