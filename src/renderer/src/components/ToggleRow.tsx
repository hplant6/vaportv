/** A setting that's on or off, shown as a switch. */
export function ToggleRow({ label, detail, on, onToggle }: { label: string; detail?: string; on: boolean; onToggle: () => void }) {
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
    >
      <span className="toggle" aria-hidden="true">
        <span className="toggle-knob" />
      </span>
      <span className="setting-name display">{label}</span>
      {detail && <span className="setting-detail">{detail}</span>}
    </button>
  )
}
