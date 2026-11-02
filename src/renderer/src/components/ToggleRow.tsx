import type { ReactNode } from 'react'
import { RowLabel } from './RowLabel'

/** A setting that's on or off, shown as a switch. */
export function ToggleRow({
  label,
  subtitle,
  detail,
  on,
  onToggle,
  onFocus
}: {
  label: string
  /** A second line under the name (a track's credit). */
  subtitle?: ReactNode
  detail?: string
  on: boolean
  onToggle: () => void
  /** For a list that scrolls to the row the cursor is on. */
  onFocus?: (el: HTMLElement) => void
}) {
  return (
    <button
      className={`setting-row${on ? ' on' : ''}`}
      tabIndex={-1}
      role="switch"
      aria-checked={on}
      aria-label={label}
      data-focusable=""
      data-select-sound="move"
      onClick={onToggle}
      onFocus={onFocus && ((e) => onFocus(e.currentTarget))}
    >
      <span className="toggle" aria-hidden="true">
        <span className="toggle-knob" />
      </span>
      <RowLabel label={label} subtitle={subtitle} />
      {detail && <span className="setting-detail">{detail}</span>}
    </button>
  )
}
