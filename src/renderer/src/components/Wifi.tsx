import { useEffect, useRef, useState } from 'react'
import type { WifiNetwork, WifiStatus } from '../../../shared/types'
import { focus, TRAP_CLOSE_EVENT } from '../input/focus'
import { ActionRow, errorText, OverStage } from './GooglePhotos'
import { OnScreenKeyboard } from './Keyboard'
import { toast } from './Toast'

// Settings → Wi-Fi: the networks around, joining one (its password typed on the
// on-screen keyboard), forgetting one.

/** How often the list refreshes while the page is open. */
const POLL_MS = 3000

const bars = (signal: number): string => (signal >= 75 ? 'Excellent' : signal >= 50 ? 'Good' : signal >= 25 ? 'Fair' : 'Weak')

function networkDetail(network: WifiNetwork, status: WifiStatus): string {
  if (status.busy?.ssid === network.ssid) return status.busy.doing
  if (network.connected) return `Connected · ${bars(network.signal)}`
  return [network.saved ? 'Saved' : network.secure ? 'Password' : 'Open', bars(network.signal)].join(' · ')
}

export function WifiSettings() {
  const [status, setStatus] = useState<WifiStatus | null>(null)
  /** A saved network whose options are open. */
  const [chosen, setChosen] = useState<WifiNetwork | null>(null)
  /** A network whose password is being typed. */
  const [joining, setJoining] = useState<WifiNetwork | null>(null)

  const refresh = (): void => {
    window.steamtv.wifi.status().then(setStatus, () => undefined)
  }
  useEffect(() => {
    refresh()
    window.steamtv.wifi.rescan()
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
    setTimeout(refresh, 300)
  }

  /** Back to a network's row, after a dialog over it closes. */
  const backTo = (ssid: string): void => {
    const row = document.querySelector<HTMLElement>(`.settings-pane [aria-label="${CSS.escape(ssid)}"]`)
    if (row) focus(row)
  }

  const choose = (network: WifiNetwork): void => {
    if (network.saved || network.connected) setChosen(network)
    else if (network.secure) setJoining(network)
    else act(window.steamtv.wifi.connect(network.ssid, ''), `Connected to ${network.ssid}`)
  }

  if (!status) return null
  if (!status.available) {
    return (
      <div className="settings-group">
        <h3 className="settings-heading display">Wi-Fi</h3>
        <p className="settings-help">This box has no Wi-Fi adapter.{status.wired ? ' It’s connected by cable.' : ''}</p>
      </div>
    )
  }

  const setEnabled = (on: boolean): void => {
    setStatus({ ...status, enabled: on })
    act(window.steamtv.wifi.setEnabled(on))
  }

  return (
    <>
      <div className="settings-group">
        <h3 className="settings-heading display">Wi-Fi</h3>
        {status.wired && <p className="settings-help">Also connected by cable, which is used first.</p>}
        <div className="setting-list" data-focus-memory="settings-wifi-power">
          <button
            className={`setting-row${status.enabled ? ' on' : ''}`}
            tabIndex={-1}
            role="switch"
            aria-checked={status.enabled}
            aria-label="Wi-Fi"
            data-focusable=""
            data-select-sound="move"
            onClick={() => setEnabled(!status.enabled)}
          >
            <span className="toggle" aria-hidden="true">
              <span className="toggle-knob" />
            </span>
            <span className="setting-name display">Wi-Fi</span>
            <span className="setting-detail">{status.enabled ? 'On' : 'Off'}</span>
          </button>
        </div>
      </div>

      {status.enabled && (
        <div className="settings-group">
          <h3 className="settings-heading display">Networks</h3>
          <div className="setting-list" data-focus-memory="settings-wifi-networks">
            {status.networks.map((network) => (
              <ActionRow key={network.ssid} label={network.ssid} detail={networkDetail(network, status)} onSelect={() => choose(network)} />
            ))}
            <ActionRow label="Search again" detail="For networks that just came on" onSelect={() => act(window.steamtv.wifi.rescan())} />
          </div>
        </div>
      )}

      {chosen && (
        <NetworkDialog
          network={status.networks.find((n) => n.ssid === chosen.ssid) ?? chosen}
          onConnect={() => act(window.steamtv.wifi.connect(chosen.ssid), `Connected to ${chosen.ssid}`)}
          onNewPassword={() => setJoining(chosen)}
          onForget={() => act(window.steamtv.wifi.forget(chosen.ssid), `Forgot ${chosen.ssid}`)}
          onClose={() => {
            setChosen(null)
            backTo(chosen.ssid)
          }}
        />
      )}

      {joining && (
        <OnScreenKeyboard
          title={joining.ssid}
          prompt="Wi-Fi password"
          secret
          onDone={(password) => {
            setJoining(null)
            backTo(joining.ssid)
            act(window.steamtv.wifi.connect(joining.ssid, password), `Connected to ${joining.ssid}`)
          }}
          onCancel={() => {
            setJoining(null)
            backTo(joining.ssid)
          }}
        />
      )}
    </>
  )
}

/** A saved network: connect, type a new password, or forget it. B closes. */
function NetworkDialog({
  network,
  onConnect,
  onNewPassword,
  onForget,
  onClose
}: {
  network: WifiNetwork
  onConnect: () => void
  onNewPassword: () => void
  onForget: () => void
  onClose: () => void
}) {
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

  const then = (action: () => void) => () => {
    onClose()
    action()
  }
  // Forgetting loses the password: it takes a second press.
  const [confirming, setConfirming] = useState(false)

  return (
    <OverStage>
      <div className="dialog-backdrop">
        <div className="dialog-panel" ref={panel} data-focus-trap="">
          <h2 className="section-label display">{network.ssid}</h2>
          <p className="dialog-message">{network.connected ? 'Connected' : 'Saved'}</p>
          <div className="setting-list">
            {!network.connected && <ActionRow label="Connect" onSelect={then(onConnect)} />}
            {network.secure && <ActionRow label="Change password" detail="Type it again" onSelect={then(onNewPassword)} />}
            <ActionRow
              label={confirming ? 'Press A again to forget' : 'Forget this network'}
              detail="Its password is removed"
              onSelect={confirming ? then(onForget) : () => setConfirming(true)}
            />
          </div>
        </div>
      </div>
    </OverStage>
  )
}
