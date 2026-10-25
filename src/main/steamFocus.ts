import { spawn, type ChildProcess } from 'node:child_process'
import { ownHelper } from './helpers'
import { STEAMTV_APPID } from './hotkey'

// Steam's menu (the controller's Steam button) takes gamescope's input focus but leaves
// vaporTV drawn under it, and our window never hears about it: no blur, no focus. So the
// A that picks something in the menu also reached vaporTV the moment the menu handed focus
// back, still held, and opened whatever was highlighted. This watches gamescope's
// GAMESCOPE_FOCUSED_APP (input focus; _GFX is what's drawn) and reports whether something
// else has it. gamescope rewrites the property every frame, so only changes are passed on.

const RESTART_MS = 5000

let child: ChildProcess | null = null

/** Calls back with true when another app (usually Steam's menu) has the input, false when we do. */
export function watchSteamFocus(onAway: (away: boolean) => void, log: (line: string) => void): void {
  if (process.platform !== 'linux' || STEAMTV_APPID === null || child) return
  let last: boolean | null = null
  let buffer = ''
  const proc = spawn('xprop', ['-root', '-spy', 'GAMESCOPE_FOCUSED_APP'], {
    env: { ...process.env, DISPLAY: ':0' },
    stdio: ['ignore', 'pipe', 'ignore']
  })
  child = proc
  ownHelper(proc)
  proc.stdout?.on('data', (chunk: Buffer) => {
    buffer += chunk.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const match = /=\s*(\d+)/.exec(line)
      if (!match) continue
      const away = Number(match[1]) !== STEAMTV_APPID
      if (away === last) continue
      last = away
      onAway(away)
    }
  })
  proc.on('error', (err) => log(`steam focus: ${err.message}`))
  proc.on('exit', () => {
    if (child !== proc) return
    child = null
    // gamescope restarting, or not up yet: try again, and don't leave input paused.
    if (last) onAway(false)
    setTimeout(() => watchSteamFocus(onAway, log), RESTART_MS)
  })
}
