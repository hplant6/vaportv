import { useEffect, useRef, useState } from 'react'
import type { BugReport, VoiceState } from '../../../shared/types'
import { focus, TRAP_CLOSE_EVENT } from '../input/focus'
import { OverStage } from './GooglePhotos'
import { OnScreenKeyboard } from './Keyboard'
import { MUSIC_HOLD_EVENT } from './MusicPreview'
import { ToggleRow } from './ToggleRow'

// Settings → General → Report a problem: say or type what went wrong, then a QR code opens
// it on a phone as a filled-in GitHub issue (with vaporTV's version, the system and recent
// log lines) to check and submit there.

/** Opens the report (detail: the row to come back to). */
export const OPEN_BUG_REPORT_EVENT = 'steamtv:bug-report'

const LISTENING: Partial<Record<VoiceState['phase'], string>> = {
  starting: 'One moment…',
  preparing: 'Getting voice ready…',
  listening: 'Listening… say what went wrong',
  thinking: 'One moment…'
}

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
  const [description, setDescription] = useState('')
  const [includeLog, setIncludeLog] = useState(true)
  const [voice, setVoice] = useState<VoiceState | null>(null)
  const [typing, setTyping] = useState(false)
  const [report, setReport] = useState<BugReport | null>(null)
  const [making, setMaking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Dictation: what's heard is added to what's there. The music pauses while it listens.
  useEffect(() => {
    let holding = false
    const hold = (on: boolean): void => {
      if (on === holding) return
      holding = on
      window.dispatchEvent(new CustomEvent(MUSIC_HOLD_EVENT, { detail: on }))
    }
    const off = window.steamtv.onVoice((state, purpose) => {
      if (purpose !== 'dictation') return
      setVoice(state)
      hold(state.phase in LISTENING)
      if (state.phase === 'heard') setDescription((d) => (d ? `${d} ${state.text}` : state.text))
    })
    return () => {
      off()
      window.steamtv.stopVoice()
      hold(false)
    }
  }, [])

  // B: from the QR code back to the report; from the report, closed. The keyboard has its own B.
  useEffect(() => {
    if (typing) return
    const back = (): void => (report ? setReport(null) : onClose())
    window.addEventListener(TRAP_CLOSE_EVENT, back)
    return () => window.removeEventListener(TRAP_CLOSE_EVENT, back)
  }, [typing, report, onClose])

  // The cursor goes to the first button of each step.
  useEffect(() => {
    if (typing) return
    const first = panel.current?.querySelector<HTMLElement>('[data-focusable]')
    if (first) focus(first)
  }, [typing, report])

  const make = (): void => {
    if (making) return
    setMaking(true)
    setError(null)
    window.steamtv
      .makeBugReport({ description, includeLog, ...pageDetails() })
      .then(setReport)
      .catch((err) => setError(String(err?.message ?? err)))
      .finally(() => setMaking(false))
  }

  if (typing)
    return (
      <OnScreenKeyboard
        title="What went wrong?"
        initial={description}
        onDone={(text) => {
          setDescription(text.trim())
          setTyping(false)
        }}
        onCancel={() => setTyping(false)}
      />
    )

  const listening = voice ? LISTENING[voice.phase] : undefined
  const button = (label: string, onPress: () => void, disabled = false) => (
    <button className="dialog-button display" tabIndex={-1} data-focusable="" data-select-sound="move" disabled={disabled} onClick={onPress}>
      {label}
    </button>
  )

  return (
    <div className="dialog-backdrop">
      <div className="dialog-panel bug-panel" ref={panel} data-focus-trap="">
        {report ? (
          <>
            <h2 className="section-label display">Scan to send</h2>
            <img className="bug-qr" src={report.qr} alt="" />
            <p className="dialog-message">
              Opens the report on GitHub, filled in. Check it, then press Submit there (it needs a GitHub account).
              {includeLog && ` ${report.logLines} log ${report.logLines === 1 ? 'line' : 'lines'} included.`}
            </p>
            <div className="bug-buttons">
              {button('Done', onClose)}
              {button('Back', () => setReport(null))}
            </div>
          </>
        ) : (
          <>
            <h2 className="section-label display">Report a problem</h2>
            <p className="dialog-message">Say or type what went wrong. You'll send it from your phone.</p>
            <div className={`osk-field bug-description${description || listening ? '' : ' empty'}`}>
              {description || listening || 'What happened, and what you were doing'}
              {description && listening && <span className="bug-listening"> {listening}</span>}
            </div>
            {voice?.phase === 'error' && <p className="dialog-message">{voice.message}</p>}
            <div className="bug-buttons">
              {button(listening ? 'Listening…' : 'Speak', () => window.steamtv.startVoice('dictation'), !!listening)}
              {button('Type', () => setTyping(true))}
              {button('Clear', () => setDescription(''), !description)}
            </div>
            <div className="setting-list bug-options">
              <ToggleRow
                label="Include recent log"
                detail="Errors and the last things vaporTV did (games, buttons)"
                on={includeLog}
                onToggle={() => setIncludeLog((on) => !on)}
              />
            </div>
            {error && <p className="dialog-message">{error}</p>}
            <div className="bug-buttons">{button(making ? 'Making it…' : 'Make QR code', make, making || !description.trim())}</div>
          </>
        )}
      </div>
    </div>
  )
}
