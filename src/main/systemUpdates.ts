// Updates for the box's other software, so they can be approved from Settings instead of
// Desktop Mode's Discover. On SteamOS those are Flatpaks: apps (Chrome, Kodi, the
// emulators…) and the runtimes they run on, in the system installation (where Discover
// puts them) and this user's (where vaporTV's app setup puts them). SteamOS itself is
// updated by Steam, in its own Settings → System.
//
// Updating system Flatpaks needs no password: SteamOS's polkit rules let the user at the
// screen do it, the same as Discover.

import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import type { SystemUpdate } from '../shared/types'

const exec = promisify(execFile)

type Installation = '--system' | '--user'

/** Pending updates in one installation; none if it has no remotes (or isn't there). */
async function pending(installation: Installation): Promise<SystemUpdate[]> {
  const { stdout } = await exec('flatpak', ['remote-ls', installation, '--updates', '--columns=application,name,branch'], { timeout: 2 * 60 * 1000 }).catch(
    (err: { stdout?: string; stderr?: string }) => {
      // A user installation without remotes says so; anything else is worth reporting.
      if (installation === '--user' || /no remote/i.test(err.stderr ?? '')) return { stdout: '' }
      throw new Error((err.stderr ?? '').trim().split('\n').pop() || 'flatpak failed')
    }
  )
  return stdout
    .split('\n')
    .map((line) => line.split('\t'))
    .filter(([id]) => id?.includes('.'))
    .map(([id, name, branch]) => ({ id, name: name?.trim() || id, branch: branch ?? '', runtime: !isApp(id) }))
}

/** Runtimes and their extensions (org.freedesktop.Platform.GL.default…) rather than apps people open. */
function isApp(id: string): boolean {
  return !/\.(Platform|Sdk|BaseApp)(\.|$)|\.(GL|GL32|VAAPI|ffmpeg-full|openh264|Locale|Debug)(\.|$)|^org\.gtk\.Gtk3theme\./.test(id)
}

/** Everything with an update waiting, apps first; the same runtime in both installations listed once. */
export async function listSystemUpdates(): Promise<SystemUpdate[]> {
  const [system, user] = await Promise.all([pending('--system'), pending('--user')])
  const seen = new Set<string>()
  return [...system, ...user]
    .filter((u) => {
      const key = `${u.id}/${u.branch}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => Number(a.runtime) - Number(b.runtime) || a.name.localeCompare(b.name))
}

/**
 * Updates every Flatpak, system and user, reporting what it's on ("Updating com.google.Chrome… 40%").
 * Apps that are open keep running the old version until they're next opened.
 */
export async function installSystemUpdates(report: (line: string) => void): Promise<void> {
  for (const installation of ['--system', '--user'] as Installation[]) {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('flatpak', ['update', installation, '--noninteractive', '-y'], { stdio: ['ignore', 'pipe', 'pipe'] })
      let current = ''
      let lastPercent = -1
      let lastError = ''
      const onData = (chunk: Buffer): void => {
        // Progress comes as lines redrawn with \r.
        for (const line of chunk.toString().split(/[\r\n]+/)) {
          const ref = /(?:Updating|Installing)\s+(?:app\/|runtime\/)?([\w.-]+\.[\w.-]+)/.exec(line)?.[1]
          if (ref && ref !== current) {
            current = ref
            lastPercent = -1
            report(`Updating ${current}…`)
          }
          const percent = Number(/(\d{1,3})%/.exec(line)?.[1] ?? NaN)
          if (Number.isFinite(percent) && percent !== lastPercent) {
            lastPercent = percent
            report(`Updating ${current || 'apps'}… ${percent}%`)
          }
          if (/^error:/i.test(line.trim())) lastError = line.trim().replace(/^error:\s*/i, '')
        }
      }
      child.stdout.on('data', onData)
      child.stderr.on('data', onData)
      child.on('error', reject)
      child.on('exit', (code) => {
        // The user installation may have nothing in it, which is fine.
        if (code === 0 || (installation === '--user' && !lastError)) resolve()
        else reject(new Error(lastError || `flatpak exited ${code}`))
      })
    })
  }
  report('Done')
}
