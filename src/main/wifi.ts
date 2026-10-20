import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import type { WifiNetwork, WifiStatus } from '../shared/types'

// Wi-Fi from Settings, through NetworkManager's nmcli (SteamOS's own network service):
// seeing the networks around, joining one with its password, forgetting one.

const exec = promisify(execFile)

const COMMAND_MS = 15_000
const CONNECT_MS = 45_000

/** What's under way for one network ("Connecting…"), shown on its row. */
let busy: { ssid: string; doing: string } | null = null

const NOT_ALLOWED = /not authori[sz]ed|didn't allow/i
const notAllowed = (): Error => new Error("SteamOS didn't allow vaporTV to change the network")

async function nmcli(args: string[], timeout = COMMAND_MS): Promise<string> {
  try {
    const { stdout } = await exec('nmcli', args, { timeout })
    return stdout
  } catch (err) {
    // Only the session on the TV may change networks (not, say, an SSH login).
    if (NOT_ALLOWED.test(String((err as { stderr?: string }).stderr))) throw notAllowed()
    throw err
  }
}

/** One line of `nmcli -t` output: fields split on colons, with its \: and \\ escapes undone. */
export function terseFields(line: string): string[] {
  const fields: string[] = ['']
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '\\' && i + 1 < line.length) fields[fields.length - 1] += line[++i]
    else if (c === ':') fields.push('')
    else fields[fields.length - 1] += c
  }
  return fields
}

/**
 * Networks from `nmcli -t -f IN-USE,SSID,SIGNAL,SECURITY device wifi list`: one per name
 * (the strongest of its access points), hidden ones left out.
 */
export function parseNetworks(text: string, saved: Set<string>): WifiNetwork[] {
  const byName = new Map<string, WifiNetwork>()
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    const [inUse, ssid, signal, security] = terseFields(line)
    if (!ssid) continue
    const network: WifiNetwork = {
      ssid,
      signal: Number(signal) || 0,
      secure: !!security && security !== '--',
      saved: saved.has(ssid),
      connected: inUse === '*'
    }
    const seen = byName.get(ssid)
    if (!seen || network.connected || (!seen.connected && network.signal > seen.signal)) byName.set(ssid, network)
  }
  // The one in use, then saved ones, then by strength.
  return [...byName.values()].sort((a, b) => Number(b.connected) - Number(a.connected) || Number(b.saved) - Number(a.saved) || b.signal - a.signal)
}

/** Saved Wi-Fi connections: their NetworkManager name for each network name. */
async function savedNetworks(): Promise<Map<string, string>> {
  const saved = new Map<string, string>()
  const lines = (await nmcli(['-t', '-f', 'NAME,TYPE', 'connection', 'show']).catch(() => '')).split('\n')
  for (const line of lines) {
    const [name, type] = terseFields(line)
    if (type !== '802-11-wireless') continue
    const ssid = (await nmcli(['-g', '802-11-wireless.ssid', 'connection', 'show', name]).catch(() => '')).trim()
    saved.set(ssid || name, name)
  }
  return saved
}

export async function wifiStatus(): Promise<WifiStatus> {
  const devices = (await nmcli(['-t', '-f', 'TYPE,STATE', 'device']).catch(() => ''))
    .split('\n')
    .map(terseFields)
  const empty: WifiStatus = { available: false, enabled: false, wired: false, busy: null, networks: [] }
  const wired = devices.some(([type, state]) => type === 'ethernet' && state === 'connected')
  if (!devices.some(([type]) => type === 'wifi')) return { ...empty, wired }
  const enabled = (await nmcli(['radio', 'wifi']).catch(() => '')).trim() === 'enabled'
  if (!enabled) return { ...empty, available: true, wired }
  const [list, saved] = await Promise.all([
    nmcli(['-t', '-f', 'IN-USE,SSID,SIGNAL,SECURITY', 'device', 'wifi', 'list', '--rescan', 'no']).catch(() => ''),
    savedNetworks()
  ])
  return { available: true, enabled, wired, busy, networks: parseNetworks(list, new Set(saved.keys())) }
}

export async function setWifiEnabled(on: boolean): Promise<void> {
  await nmcli(['radio', 'wifi', on ? 'on' : 'off'])
}

/** Asks the Wi-Fi to look again; the list fills in over the next few seconds. */
export async function rescanWifi(): Promise<void> {
  await nmcli(['device', 'wifi', 'rescan']).catch(() => undefined)
}

/** Why nmcli couldn't connect, in words for the TV. */
function connectError(out: string): Error {
  if (NOT_ALLOWED.test(out)) return notAllowed()
  if (/secrets were required|802-1x|psk|password/i.test(out)) return new Error('Wrong password')
  if (/no network with SSID/i.test(out)) return new Error("That network isn't in range")
  return new Error("Couldn't connect")
}

/**
 * Joins a network: a saved one with what's saved, a new one with `password` (passed to
 * nmcli on its input, so it never shows in the process list). Throws a message.
 */
export async function connectWifi(ssid: string, password?: string): Promise<void> {
  busy = { ssid, doing: 'Connecting…' }
  try {
    const saved = (await savedNetworks()).get(ssid)
    if (saved && password === undefined) {
      const out = await nmcli(['connection', 'up', 'id', saved], CONNECT_MS).catch((err: { stdout?: string; stderr?: string; message: string }) =>
        err.stdout === undefined ? err.message : `${err.stdout}${err.stderr}`
      )
      if (!/successfully activated/i.test(out)) throw connectError(out)
      return
    }
    // A new password for a saved network replaces what's saved.
    if (saved) await nmcli(['connection', 'delete', 'id', saved]).catch(() => undefined)
    const out = await new Promise<string>((resolve) => {
      const child = spawn('nmcli', ['--ask', 'device', 'wifi', 'connect', ssid], { stdio: ['pipe', 'pipe', 'pipe'] })
      let text = ''
      const timer = setTimeout(() => child.kill(), CONNECT_MS)
      child.stdout.on('data', (chunk: Buffer) => (text += chunk.toString()))
      child.stderr.on('data', (chunk: Buffer) => (text += chunk.toString()))
      child.on('error', () => resolve(text))
      child.on('exit', () => {
        clearTimeout(timer)
        resolve(text)
      })
      child.stdin.end(password ? `${password}\n` : '\n')
    })
    if (!/successfully activated/i.test(out)) {
      // Don't keep a connection that never worked: its wrong password would be tried again.
      const left = (await savedNetworks()).get(ssid)
      if (left) await nmcli(['connection', 'delete', 'id', left]).catch(() => undefined)
      throw connectError(out)
    }
  } finally {
    busy = null
  }
}

export async function forgetWifi(ssid: string): Promise<void> {
  const saved = (await savedNetworks()).get(ssid)
  if (saved) await nmcli(['connection', 'delete', 'id', saved])
}
