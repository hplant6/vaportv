import { useEffect, useState } from 'react'
import { assignButton, buttonName, CONTROL_ACTIONS, DEFAULT_CONTROLS, holderOf, type ControlAction, type Controls } from '../../../shared/controls'
import { cancelCapture, captureButton, CONTROLS_CHANGED_EVENT } from '../input/gamepad'
import { ButtonIcon, useControllerFamily } from './ButtonIcon'
import { toast } from './Toast'

/** Pressed together, and the same whatever the buttons above are set to. */
const FIXED: { name: string; detail: string; buttons: [number, number]; hold?: true }[] = [
  { name: 'Close a game or app', detail: 'Hold both while it’s playing', buttons: [8, 9], hold: true },
  { name: 'Sound off or on', detail: 'Click both sticks in', buttons: [10, 11] }
]

/**
 * Settings → Controller → Controls: a row per action showing its button. Choosing a row
 * waits for the next button pressed; a button another action had is swapped.
 */
export function ControlsSettings({ controls, onChange }: { controls: Controls; onChange: (controls: Controls) => void }) {
  const [waiting, setWaiting] = useState<ControlAction | null>(null)
  const family = useControllerFamily()

  const save = (next: Controls): void => {
    onChange(next)
    window.steamtv.setControls(next).then(() => window.dispatchEvent(new Event(CONTROLS_CHANGED_EVENT)))
  }

  const listen = (action: ControlAction): void => {
    setWaiting(action)
    captureButton((button) => {
      setWaiting(null)
      if (button === null || button === controls[action]) return
      const holder = CONTROL_ACTIONS.find((a) => a.id === holderOf(controls, action, button))
      save(assignButton(controls, action, button))
      if (holder) toast(`${holder.name} moved to ${buttonName(controls[action], family)}`)
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
        Choose an action, then press the button you want for it. The D-pad and sticks always move around, and the two-button presses at the end can’t be changed.
      </p>
      <div className="setting-list" data-focus-memory="settings-controls">
        {CONTROL_ACTIONS.map((a) => (
          <button
            key={a.id}
            className={`setting-row${waiting === a.id ? ' waiting' : ''}`}
            tabIndex={-1}
            aria-label={`${a.name}: ${buttonName(controls[a.id], family)}`}
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
                <ButtonIcon button={controls[a.id]} family={family} />
              </>
            )}
          </button>
        ))}
        {/* Two-button presses that are always the same: listed so they can be found, not changed. */}
        {FIXED.map((f) => (
          <button
            key={f.name}
            className="setting-row"
            tabIndex={-1}
            aria-label={`${f.name}: ${f.buttons.map((b) => buttonName(b, family)).join(' and ')}${f.hold ? ', held' : ''}`}
            data-focusable=""
            data-select-sound="move"
            onClick={() => toast(`${f.name} is always ${f.buttons.map((b) => buttonName(b, family)).join(' + ')}${f.hold ? ', held' : ''}`)}
          >
            <span className="setting-name display">{f.name}</span>
            <span className="setting-detail">{f.detail}</span>
            <span className="control-combo">
              <ButtonIcon button={f.buttons[0]} family={family} />
              <span className="controls-guide-plus">+</span>
              <ButtonIcon button={f.buttons[1]} family={family} />
            </span>
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
