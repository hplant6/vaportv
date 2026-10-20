import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'
import type { BluetoothDevice, BluetoothStatus } from '../shared/types'

// Bluetooth from Settings, through BlueZ's own bluetoothctl (on SteamOS, as on any
// Linux desktop): pairing a remote's hub, a headset or a keyboard without leaving the
// couch. Pairing needs no PIN ("just works"), which is what hubs and most headsets do.

const exec = promisify(execFile)

/** How long Find devices searches for. */
const SCAN_SECONDS = 30
const COMMAND_MS = 10_000
const PAIR_SECONDS = 25

let scan: ChildProcess | null = null
/** What's under way for one device ("Pairing…"), shown on its row. */
let busy: { address: string; doing: string } | null = null

async function ctl(args: string[], timeout = COMMAND_MS): Promise<string> {
  const { stdout } = await exec('bluetoothctl', args, { timeout })
  return stdout
}

/** `Device <address> <name>` lines, as `bluetoothctl devices [filter]` lists them. */
export function parseDevices(text: string): { address: string; name: string }[] {
  return text
    .split('\n')
    .map((line) => /^Device ([0-9A-F:]{17}) (.*)$/i.exec(line.trim()))
    .filter((m): m is RegExpExecArray => !!m)
    .map(([, address, name]) => ({ address, name }))
}

/** What a device is, from BlueZ's icon name: "input-keyboard", "audio-headset", ... */
export function deviceKind(icon: string | undefined): BluetoothDevice['kind'] {
  if (!icon) return 'other'
  if (icon.startsWith('audio')) return 'audio'
  if (icon === 'input-gaming') return 'controller'
  if (icon === 'input-keyboard') return 'keyboard'
  if (icon === 'input-mouse' || icon === 'input-tablet') return 'mouse'
  if (icon === 'phone') return 'phone'
  return 'other'
}

/** BlueZ names unnamed devices after their address ("12-34-56-..."): not worth listing. */
const unnamed = (name: string): boolean => /^([0-9A-F]{2}[-:]){5}[0-9A-F]{2}$/i.test(name)

export async function bluetoothStatus(): Promise<BluetoothStatus> {
  let show: string
  try {
    show = await ctl(['show'])
  } catch {
    return { available: false, powered: false, scanning: false, busy: null, devices: [] }
  }
  if (!/^Controller /m.test(show)) return { available: false, powered: false, scanning: false, busy: null, devices: [] }
  const powered = /Powered: yes/.test(show)
  const scanning = scan !== null
  const [all, paired, connected] = await Promise.all([
    ctl(['devices']).then(parseDevices, () => []),
    ctl(['devices', 'Paired']).then(parseDevices, () => []),
    ctl(['devices', 'Connected']).then(parseDevices, () => [])
  ])
  const isPaired = new Set(paired.map((d) => d.address))
  const isConnected = new Set(connected.map((d) => d.address))
  // Paired devices always; others only while (or after) searching, and only named ones.
  const listed = all.filter((d) => isPaired.has(d.address) || (scanning && !unnamed(d.name)))
  const devices = await Promise.all(
    listed.map(async (d): Promise<BluetoothDevice> => {
      // Only paired devices are asked what they are: the search can turn up dozens.
      const icon = isPaired.has(d.address) ? /Icon: (\S+)/.exec(await ctl(['info', d.address]).catch(() => ''))?.[1] : undefined
      return { address: d.address, name: d.name, kind: deviceKind(icon), paired: isPaired.has(d.address), connected: isConnected.has(d.address) }
    })
  )
  return { available: true, powered, scanning, busy, devices }
}

export async function setBluetoothPowered(on: boolean): Promise<void> {
  await ctl(['power', on ? 'on' : 'off'])
}

/** Searches for devices for a while; they turn up in bluetoothStatus as they're found. */
export function findBluetoothDevices(): void {
  if (scan) return
  // Discovery lasts as long as the bluetoothctl that started it, so it runs for the timeout.
  scan = spawn('bluetoothctl', ['--timeout', String(SCAN_SECONDS), 'scan', 'on'], { stdio: 'ignore' })
  const done = (): void => {
    scan = null
  }
  scan.on('exit', done)
  scan.on('error', done)
}

function stopSearching(): void {
  scan?.kill()
  scan = null
}

async function withBusy(address: string, doing: string, work: () => Promise<void>): Promise<void> {
  busy = { address, doing }
  try {
    await work()
  } finally {
    busy = null
  }
}

/** Pairs (no PIN), trusts (so it reconnects by itself) and connects. Throws a message on failure. */
export async function pairBluetooth(address: string): Promise<void> {
  // Searching while pairing makes pairing slow and flaky.
  stopSearching()
  await withBusy(address, 'Pairing…', async () => {
    const out = await ctl(['--agent', 'NoInputNoOutput', '--timeout', String(PAIR_SECONDS), 'pair', address], (PAIR_SECONDS + 5) * 1000).catch(
      (err: { stdout?: string }) => err.stdout ?? ''
    )
    if (!/Pairing successful|AlreadyExists/.test(out)) {
      const reason = /Failed to pair: (\S+)/.exec(out)?.[1]
      throw new Error(reason === 'org.bluez.Error.AuthenticationFailed' ? "It didn't accept the pairing: put it in pairing mode and try again" : "Couldn't pair: is it in pairing mode?")
    }
    await ctl(['trust', address])
    await ctl(['connect', address]).catch(() => undefined)
  })
}

export async function connectBluetooth(address: string): Promise<void> {
  await withBusy(address, 'Connecting…', async () => {
    const out = await ctl(['connect', address], 20_000).catch((err: { stdout?: string }) => err.stdout ?? '')
    if (!/Connection successful/.test(out)) throw new Error("Couldn't connect: is it switched on and nearby?")
  })
}

export async function disconnectBluetooth(address: string): Promise<void> {
  await ctl(['disconnect', address])
}

export async function forgetBluetooth(address: string): Promise<void> {
  await ctl(['remove', address])
}
