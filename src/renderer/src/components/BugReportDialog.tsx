import { useEffect, useRef, useState } from 'react'
import type { BugReport } from '../../../shared/types'
import { focus, TRAP_CLOSE_EVENT } from '../input/focus'
import { OverStage } from './GooglePhotos'

// Settings → General → Report a problem: a QR code that opens a GitHub issue on a phone,
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

  useEffect(() => {
    window.steamtv
      .makeBugReport(pageDetails())
      .then(setReport)
      .catch((err) => setError(String(err?.message ?? err)))
  }, [])

  useEffect(() => {
    window.addEventListener(TRAP_CLOSE_EVENT, onClose)
    return () => window.removeEventListener(TRAP_CLOSE_EVENT, onClose)
  }, [onClose])

  useEffect(() => {
    const done = panel.current?.querySelector<HTMLElement>('[data-focusable]')
    if (done) focus(done)
  }, [])

  return (
    <div className="dialog-backdrop">
      <div className="dialog-panel bug-panel" ref={panel} data-focus-trap="">
        <div className="bug-text">
          <h2 className="bug-title display">Report a problem</h2>
          <p className="dialog-message">
            {error ?? 'Scan the code with your phone. It opens a bug report on GitHub with vaporTV\u2019s details and recent log filled in: describe what went wrong, then press Submit.'}
          </p>
          <p className="dialog-message bug-account">You need a GitHub account to send it.</p>
          <button className="dialog-button display" tabIndex={-1} data-focusable="" data-select-sound="move" onClick={onClose}>
            Done
          </button>
        </div>
        {report ? <img className="bug-qr" src={report.qr} alt="" /> : <div className="bug-qr bug-qr-waiting" />}
      </div>
    </div>
  )
}
