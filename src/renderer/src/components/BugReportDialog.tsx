import { useEffect, useRef, useState } from 'react'
import type { BugReport } from '../../../shared/types'
import { focus, TRAP_CLOSE_EVENT } from '../input/focus'
import { OverStage } from './GooglePhotos'
import { collectDiagnostics } from '../diagnostics'

// Settings → Help → Report a problem: a QR code that opens a GitHub issue on a phone,
// filled in with vaporTV's version, the system and recent log lines. What went wrong is
// typed there, where it's easier than with a controller.

/** Opens the report (detail: the row to come back to). */
export const OPEN_BUG_REPORT_EVENT = 'steamtv:bug-report'

/** What only the page knows about the system: the GPU's name, the controllers, the screen. */
function pageDetails(): { gpu?: string; controllers: string[]; display: string } {
  let gpu: string | undefined
  try {
    const gl = document.createElement('canvas').getContext('webgl')
    const info = gl?.getExtension('WEBGL_debug_renderer_info')
    if (gl && info) gpu = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))
  } catch {
    // No WebGL: left out.
  }
  const controllers = navigator
    .getGamepads()
    .filter((pad): pad is Gamepad => !!pad?.connected)
    .map((pad) => pad.id)
  const ratio = window.devicePixelRatio || 1
  return { gpu, controllers, display: `${Math.round(screen.width * ratio)}×${Math.round(screen.height * ratio)}` }
}

/** Mounted once in App; shows the report while it's open. */
export function BugReportDialog() {
  const [from, setFrom] = useState<HTMLElement | null | undefined>(undefined)
  useEffect(() => {
    const onOpen = (event: Event): void => setFrom((event as CustomEvent<HTMLElement | null>).detail ?? null)
    window.addEventListener(OPEN_BUG_REPORT_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_BUG_REPORT_EVENT, onOpen)
  }, [])
  if (from === undefined) return null
  return (
    <OverStage>
      <Report
        onClose={() => {
          if (from?.isConnected) requestAnimationFrame(() => focus(from))
          setFrom(undefined)
        }}
      />
    </OverStage>
  )
}

function Report({ onClose }: { onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  const [report, setReport] = useState<BugReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Two steps: the report itself, then (optional, but the most help) the full details to attach.
  const [step, setStep] = useState<'report' | 'details'>('report')

  useEffect(() => {
    // The snapshot first, before anything here moves: what every part of the page is doing now.
    window.steamtv
      .makeBugReport({ ...pageDetails(), snapshot: collectDiagnostics() })
      .then(setReport)
      .catch((err) => setError(String(err?.message ?? err)))
    // Closed: the full details' page stops.
    return () => window.steamtv.closeBugReport()
  }, [])

  useEffect(() => {
    window.addEventListener(TRAP_CLOSE_EVENT, onClose)
    return () => window.removeEventListener(TRAP_CLOSE_EVENT, onClose)
  }, [onClose])

  // The cursor on each step's first button (Add details on the first, once it's there).
  const canAddDetails = !!report?.detailsQr
  useEffect(() => {
    const first = panel.current?.querySelector<HTMLElement>('[data-focusable]')
    if (first) focus(first)
  }, [step, canAddDetails])

  const button = (label: string, onClick: () => void) => (
    <button className="dialog-button display" tabIndex={-1} data-focusable="" data-select-sound="move" onClick={onClick}>
      {label}
    </button>
  )

  const details = step === 'details' && report?.detailsQr
  return (
    <div className="dialog-backdrop">
      <div className="dialog-panel bug-panel" ref={panel} data-focus-trap="">
        <div className="bug-text">
          {details ? (
            <>
              <p className="bug-step">Step 2 of 2 · optional</p>
              <h2 className="bug-title display">Add details</h2>
              <p className="dialog-message">This helps us find the problem much faster.</p>
              <p className="dialog-message">Scan to download a file of what vaporTV was doing, then attach it to your report on GitHub.</p>
              <p className="dialog-message bug-note">Your phone needs to be on the same Wi-Fi as the TV.</p>
              <div className="bug-buttons">
                {button('Done', onClose)}
                {button('Back', () => setStep('report'))}
              </div>
            </>
          ) : (
            <>
              {canAddDetails && <p className="bug-step">Step 1 of 2</p>}
              <h2 className="bug-title display">Report a problem</h2>
              <p className="dialog-message">{error ?? 'Scan with your phone to open a report on GitHub, then say what went wrong.'}</p>
              <p className="dialog-message bug-note">Reports are public, and need a GitHub account.</p>
              <div className="bug-buttons">
                {canAddDetails && button('Add details', () => setStep('details'))}
                {button('Done', onClose)}
              </div>
            </>
          )}
        </div>
        {details ? (
          <img className="bug-qr" src={report.detailsQr} alt="" />
        ) : report ? (
          <img className="bug-qr" src={report.qr} alt="" />
        ) : (
          <div className="bug-qr bug-qr-waiting" />
        )}
      </div>
    </div>
  )
}
