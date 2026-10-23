/** A setting that's on or off, shown as a switch. */
export function ToggleRow({
  label,
  detail,
  on,
  onToggle,
  onFocus
}: {
  label: string
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
      <span className="setting-name display">{label}</span>
      {detail && <span className="setting-detail">{detail}</span>}
    </button>
  )
}
