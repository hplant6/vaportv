import { useEffect, useState } from 'react'
import type { InstallStatus } from '../../../shared/types'
import '../setup.css'

type Phase = 'ready' | 'working' | 'done' | 'failed'

function Check({ on, label }: { on: boolean; label: string }) {
  return (
    <li className={on ? 'on' : ''}>
      <span className="mark" aria-hidden="true">
        {on ? '✓' : '○'}
      </span>
      {label}
    </li>
  )
}

const SETUP_NOTE: Record<string, string> = {
  install: 'installs from Flathub',
  web: 'opens in Chrome, added to Steam',
  emudeck: 'comes with EmuDeck',
  shortcut: 'add its Steam shortcut yourself'
}

/** The app tiles: ready ones ticked off, the rest offered for setting up along with vaporTV. */
function AppsChecklist({
  apps,
  chosen,
  disabled,
  onChange
}: {
  apps: InstallStatus['apps']
  chosen: string[]
  disabled: boolean
  onChange: (ids: string[]) => void
}) {
  const offered = apps.filter((a) => !a.state.ready && (a.state.setup === 'install' || a.state.setup === 'web'))
  const toggle = (id: string, on: boolean): void => onChange(on ? [...chosen, id] : chosen.filter((c) => c !== id))
  return (
    <div className="setup-apps">
      <h3>Apps</h3>
      {offered.length > 0 && (
        <button className="setup-link" disabled={disabled} onClick={() => onChange(chosen.length === offered.length ? [] : offered.map((a) => a.id))}>
          {chosen.length === offered.length ? 'Clear all' : 'Choose all'}
        </button>
      )}
      <ul>
        {apps.map((a) => (
          <li key={a.id}>
            {a.state.ready ? (
              <span className="setup-app-ready">
                <span className="mark">✓</span>
                {a.name}
              </span>
            ) : (
              <label>
                <input
                  type="checkbox"
                  checked={chosen.includes(a.id)}
                  disabled={disabled || !offered.includes(a)}
                  onChange={(e) => toggle(a.id, e.target.checked)}
                />
                <span>
                  {a.name}{' '}
                  <span className="hint">
                    ({a.state.program ? `installs ${a.state.program} from Flathub` : SETUP_NOTE[a.state.setup ?? 'shortcut']})
                  </span>
                </span>
              </label>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * The Desktop Mode install window: what's set up so far, two options, and Install
 * (or Update) / Uninstall. Used with a mouse and keyboard, not a controller.
 */
export function Setup() {
  const [status, setStatus] = useState<InstallStatus | null>(null)
  const [autostart, setAutostart] = useState(true)
  const [wake, setWake] = useState(true)
  const [phase, setPhase] = useState<Phase>('ready')
  const [log, setLog] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [action, setAction] = useState<'install' | 'uninstall'>('install')
  const [apps, setApps] = useState<string[]>([])

  const refresh = (): void => {
    window.steamtv.setup.status().then(setStatus)
  }
  useEffect(() => {
    refresh()
    return window.steamtv.setup.onProgress((line) => setLog((lines) => [...lines, line]))
  }, [])

  const start = (which: 'install' | 'uninstall'): void => {
    setAction(which)
    setPhase('working')
    setLog([])
    setError(null)
    const job = which === 'install' ? window.steamtv.setup.install({ autostart, wake, apps }) : window.steamtv.setup.uninstall()
    job.then((err) => {
      setError(err)
      setPhase(err ? 'failed' : 'done')
      refresh()
    })
  }

  const installed = !!status?.shortcut
  const working = phase === 'working'

  return (
    <main className="setup">
      <header>
        <h1 className="setup-title">vaporTV</h1>
        <p className="setup-tagline">A TV home screen for SteamOS Gaming Mode.</p>
      </header>

      <section className="setup-card">
        <h2>{installed ? 'vaporTV is set up' : 'Set up vaporTV'}</h2>
        {status && (
          <ul className="setup-status">
            <Check on={status.shortcut} label="In your Steam library" />
            <Check on={status.autostart} label="Opens when Gaming Mode starts" />
            <Check on={status.wake} label="Controller can wake the box" />
          </ul>
        )}

        {phase !== 'done' && (
          <>
            <div className="setup-options">
              <label>
                <input type="checkbox" checked={autostart} disabled={working} onChange={(e) => setAutostart(e.target.checked)} />
                <span>Open vaporTV when Gaming Mode starts</span>
              </label>
              <label>
                <input type="checkbox" checked={wake} disabled={working} onChange={(e) => setWake(e.target.checked)} />
                <span>
                  Let my controller wake the box from sleep{' '}
                  <span className="hint">(needs an admin password; set one with passwd in Konsole if you never have)</span>
                </span>
              </label>
            </div>
            {status && <AppsChecklist apps={status.apps} chosen={apps} disabled={working} onChange={setApps} />}
            {status?.steamRunning && <p className="hint">Steam will close for a moment while vaporTV is added.</p>}
            <div className="setup-buttons">
              <button className="primary" disabled={working} onClick={() => start('install')}>
                {working && action === 'install' ? 'Installing…' : installed ? 'Update' : 'Install'}
              </button>
              {installed && (
                <button className="quiet" disabled={working} onClick={() => start('uninstall')}>
                  {working && action === 'uninstall' ? 'Removing…' : 'Uninstall'}
                </button>
              )}
            </div>
          </>
        )}

        {log.length > 0 && (
          <ol className="setup-log">
            {log.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
        )}
        {error && <p className="setup-error">{error}</p>}

        {phase === 'done' && action === 'install' && (
          <div className="setup-buttons">
            <button className="primary" onClick={() => window.steamtv.setup.gamingMode()}>
              Return to Gaming Mode
            </button>
            <button className="quiet" onClick={() => window.close()}>
              Close
            </button>
          </div>
        )}
        {phase === 'done' && action === 'uninstall' && (
          <div className="setup-buttons">
            <button className="quiet" onClick={() => window.close()}>
              Close
            </button>
          </div>
        )}
      </section>
    </main>
  )
}
