import { useEffect, useState } from 'react'
import { assignButton, buttonName, CONTROL_ACTIONS, DEFAULT_CONTROLS, type ControlAction, type Controls } from '../../../shared/controls'
import { cancelCapture, captureButton, CONTROLS_CHANGED_EVENT } from '../input/gamepad'
import { toast } from './Toast'

/**
 * Settings → Controller → Controls: a row per action showing its button. Choosing a
 * row waits for the next button pressed; a button another action had is swapped.
 */
export function ControlsSettings({ controls, onChange }: { controls: Controls; onChange: (controls: Controls) => void }) {
  const [waiting, setWaiting] = useState<ControlAction | null>(null)

  const save = (next: Controls): void => {
    onChange(next)
    window.steamtv.setControls(next).then(() => window.dispatchEvent(new Event(CONTROLS_CHANGED_EVENT)))
  }

  const listen = (action: ControlAction): void => {
    setWaiting(action)
    captureButton((button) => {
      setWaiting(null)
      if (button === null || button === controls[action]) return
      const holder = CONTROL_ACTIONS.find((a) => a.id !== action && controls[a.id] === button)
      save(assignButton(controls, action, button))
      if (holder) toast(`${holder.name} moved to ${buttonName(controls[action])}`)
    })
  }

  // Leaving Settings, or any keyboard key, stops waiting.
  useEffect(() => {
    if (!waiting) return
    const onKey = (event: KeyboardEvent): void => {
      event.preventDefault()
      event.stopImmediatePropagation()
      cancelCapture()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [waiting])
  useEffect(() => () => cancelCapture(), [])

  const isDefault = CONTROL_ACTIONS.every((a) => controls[a.id] === DEFAULT_CONTROLS[a.id])

  return (
    <div className="settings-group">
      <h3 className="settings-heading display">Controls</h3>
      <p className="settings-help">
        Choose an action, then press the button you want for it. The D-pad and sticks always move around.
      </p>
      <div className="setting-list" data-focus-memory="settings-controls">
        {CONTROL_ACTIONS.map((a) => (
          <button
            key={a.id}
            className={`setting-row${waiting === a.id ? ' waiting' : ''}`}
            tabIndex={-1}
            aria-label={`${a.name}: ${buttonName(controls[a.id])}`}
            data-focusable=""
            data-select-sound="move"
            onClick={() => listen(a.id)}
          >
            <span className="setting-name display">{a.name}</span>
            {waiting === a.id ? (
              <span className="setting-detail">Press a button…</span>
            ) : (
              <>
                {a.detail && <span className="setting-detail">{a.detail}</span>}
                <span className="control-button display">{buttonName(controls[a.id])}</span>
              </>
            )}
          </button>
        ))}
        {!isDefault && (
          <button
            className="setting-row"
            tabIndex={-1}
            data-focusable=""
            data-select-sound="move"
            onClick={() => {
              save(DEFAULT_CONTROLS)
              toast('Controls set back to the defaults')
            }}
          >
            <span className="setting-name display">Reset to defaults</span>
          </button>
        )}
      </div>
    </div>
  )
}
