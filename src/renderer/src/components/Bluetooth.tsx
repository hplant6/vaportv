import { useEffect, useRef, useState } from 'react'
import type { BluetoothDevice, BluetoothStatus } from '../../../shared/types'
import { focus, TRAP_CLOSE_EVENT } from '../input/focus'
import { ActionRow, errorText, OverStage } from './GooglePhotos'
import { toast } from './Toast'

// Settings → Bluetooth: pair a remote's hub, headphones or a keyboard from the couch.

/** How often the list refreshes while the page is open. */
const POLL_MS = 2000

const KIND: Record<BluetoothDevice['kind'], string> = {
  audio: 'Audio',
  controller: 'Controller',
  keyboard: 'Keyboard',
  mouse: 'Mouse',
  phone: 'Phone',
  other: 'Device'
}

function deviceDetail(device: BluetoothDevice, status: BluetoothStatus): string {
  if (status.busy?.address === device.address) return status.busy.doing
  if (!device.paired) return 'A to pair'
  return `${KIND[device.kind]} · ${device.connected ? 'Connected' : 'Not connected'}`
}

export function BluetoothSettings() {
  const [status, setStatus] = useState<BluetoothStatus | null>(null)
  const [chosen, setChosen] = useState<BluetoothDevice | null>(null)

  const refresh = (): void => {
    window.steamtv.bluetooth.status().then(setStatus, () => undefined)
  }
  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, POLL_MS)
    return () => clearInterval(timer)
  }, [])

  /** Runs an action, then says how it went and refreshes the list. */
  const act = (work: Promise<void>, done?: string): void => {
    work.then(
      () => {
        if (done) toast(done)
        refresh()
      },
      (err: unknown) => {
        toast(errorText(err))
        refresh()
      }
    )
    // Show the device's "Pairing…" straight away.
    setTimeout(refresh, 300)
  }

  if (!status) return null
  if (!status.available) {
    return (
      <div className="settings-group">
        <h3 className="settings-heading display">Bluetooth</h3>
        <p className="settings-help">This box has no Bluetooth adapter.</p>
      </div>
    )
  }

  const paired = status.devices.filter((d) => d.paired)
  const nearby = status.devices.filter((d) => !d.paired).sort((a, b) => a.name.localeCompare(b.name))
  const setPowered = (on: boolean): void => {
    setStatus({ ...status, powered: on })
    act(window.steamtv.bluetooth.setPowered(on))
  }

  return (
    <>
      <div className="settings-group">
        <h3 className="settings-heading display">Bluetooth</h3>
        <div className="setting-list" data-focus-memory="settings-bluetooth-power">
          <button
            className={`setting-row${status.powered ? ' on' : ''}`}
            tabIndex={-1}
            role="switch"
            aria-checked={status.powered}
            aria-label="Bluetooth"
            data-focusable=""
            data-select-sound="move"
            onClick={() => setPowered(!status.powered)}
          >
            <span className="toggle" aria-hidden="true">
              <span className="toggle-knob" />
            </span>
            <span className="setting-name display">Bluetooth</span>
            <span className="setting-detail">{status.powered ? 'On' : 'Off'}</span>
          </button>
        </div>
      </div>

      {status.powered && (
        <>
          <div className="settings-group">
            <h3 className="settings-heading display">Paired devices</h3>
            {paired.length === 0 && <p className="settings-help">None yet.</p>}
            <div className="setting-list" data-focus-memory="settings-bluetooth-paired">
              {paired.map((device) => (
                <ActionRow key={device.address} label={device.name} detail={deviceDetail(device, status)} onSelect={() => setChosen(device)} />
              ))}
            </div>
          </div>

          <div className="settings-group">
            <h3 className="settings-heading display">Add a device</h3>
            <p className="settings-help">Put the device in pairing mode, then search. A remote&apos;s hub (such as a Sofabaton) pairs as a keyboard.</p>
            <div className="setting-list" data-focus-memory="settings-bluetooth-find">
              <ActionRow
                label="Find devices"
                detail={status.scanning ? 'Searching…' : 'Searches for 30 seconds'}
                onSelect={() => act(window.steamtv.bluetooth.find())}
              />
              {nearby.map((device) => (
                <ActionRow
                  key={device.address}
                  label={device.name}
                  detail={deviceDetail(device, status)}
                  onSelect={() => act(window.steamtv.bluetooth.pair(device.address), `Paired with ${device.name}`)}
                />
              ))}
            </div>
            {status.scanning && nearby.length === 0 && <p className="settings-help">Nothing found yet…</p>}
          </div>
        </>
      )}

      {chosen && (
        <DeviceDialog
          device={status.devices.find((d) => d.address === chosen.address) ?? chosen}
          onAct={act}
          onClose={() => {
            const row = document.querySelector<HTMLElement>(`.settings-pane [aria-label="${CSS.escape(chosen.name)}"]`)
            setChosen(null)
            if (row) focus(row)
          }}
        />
      )}
    </>
  )
}

/** A paired device: connect or disconnect it, or forget it. B closes. */
function DeviceDialog({ device, onAct, onClose }: { device: BluetoothDevice; onAct: (work: Promise<void>, done?: string) => void; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null)

  // The cursor goes in once: the page behind refreshing mustn't move it back.
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const first = panel.current?.querySelector<HTMLElement>('[data-focusable]')
    if (first) focus(first)
    const onBack = (): void => close.current()
    window.addEventListener(TRAP_CLOSE_EVENT, onBack)
    return () => window.removeEventListener(TRAP_CLOSE_EVENT, onBack)
  }, [])

  const run = (work: Promise<void>, done?: string): void => {
    onAct(work, done)
    onClose()
  }
  // Forgetting means pairing again: it takes a second press.
  const [confirming, setConfirming] = useState(false)

  return (
    <OverStage>
      <div className="dialog-backdrop">
        <div className="dialog-panel" ref={panel} data-focus-trap="">
          <h2 className="section-label display">{device.name}</h2>
          <p className="dialog-message">
            {KIND[device.kind]} · {device.connected ? 'Connected' : 'Not connected'}
          </p>
          <div className="setting-list">
            {device.connected ? (
              <ActionRow label="Disconnect" onSelect={() => run(window.steamtv.bluetooth.disconnect(device.address))} />
            ) : (
              <ActionRow label="Connect" onSelect={() => run(window.steamtv.bluetooth.connect(device.address), `Connected to ${device.name}`)} />
            )}
            <ActionRow
              label={confirming ? 'Press A again to forget' : 'Forget this device'}
              detail="Pair it again to use it"
              onSelect={() => (confirming ? run(window.steamtv.bluetooth.forget(device.address), `Forgot ${device.name}`) : setConfirming(true))}
            />
          </div>
        </div>
      </div>
    </OverStage>
  )
}
