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
    const job = which === 'install' ? window.steamtv.setup.install({ autostart, wake }) : window.steamtv.setup.uninstall()
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
                  Let my controller wake the box from sleep <span className="hint">(asks for your password)</span>
                </span>
              </label>
            </div>
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
