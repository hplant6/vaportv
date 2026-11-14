import type { ReactNode, Ref } from 'react'

// The players' on-screen buttons (MediaPlayer, and the Files viewer): round buttons the cursor
// steps along, each showing its name while it has the cursor, and the controller icon's panel
// listing the shortcuts. Each player moves the cursor between its rows itself.

/** The icons, on a 24-unit box; `.fill` parts are solid. */
export const ICONS = {
  stop: <rect x="6" y="6" width="12" height="12" rx="1.5" className="fill" />,
  play: <path d="M8 5.5v13l10.5-6.5z" className="fill" />,
  pause: <path d="M7.5 5.5h3v13h-3zM13.5 5.5h3v13h-3z" className="fill" />,
  back: (seconds: number) => (
    <>
      <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" />
      <text x="12" y="15.5" className="media-button-num">
        {seconds}
      </text>
    </>
  ),
  on: (seconds: number) => (
    <>
      <path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v4h-4" />
      <text x="12" y="15.5" className="media-button-num">
        {seconds}
      </text>
    </>
  ),
  previous: <path d="M6 5.5v13M18.5 5.5v13L8.5 12z" className="fill-stroke" />,
  next: <path d="M18 5.5v13M5.5 5.5v13l10-6.5z" className="fill-stroke" />,
  subtitles: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M7 14.5h4M13 14.5h4M7 11h2M11 11h6" />
    </>
  ),
  controller: (
    <>
      <path d="M7 8.5h10a4 4 0 0 1 3.9 4.9l-.8 3.4a2.2 2.2 0 0 1-3.8 1L14.6 16H9.4l-1.7 1.8a2.2 2.2 0 0 1-3.8-1l-.8-3.4A4 4 0 0 1 7 8.5z" />
      <path d="M8 11.2v2.6M6.7 12.5h2.6" />
      <circle cx="15.6" cy="11.8" r=".5" className="fill" />
      <circle cx="17" cy="13.2" r=".5" className="fill" />
    </>
  )
}

/** One of the player's buttons: an icon (from ICONS), its name shown while it has the cursor. */
export function PlayerButton({
  label,
  big = false,
  pressed,
  disabled = false,
  buttonRef,
  onClick,
  children
}: {
  label: string
  big?: boolean
  pressed?: boolean
  /** Shown dimmed and skipped by the cursor (the first file has no previous). */
  disabled?: boolean
  buttonRef?: Ref<HTMLButtonElement>
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      ref={buttonRef}
      className={`media-button${big ? ' big' : ''}${disabled ? ' disabled' : ''}`}
      tabIndex={-1}
      {...(disabled ? { 'aria-disabled': true } : { 'data-focusable': '' })}
      data-select-sound="move"
      aria-label={label}
      aria-pressed={pressed}
      onClick={disabled ? undefined : onClick}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {children}
      </svg>
      <span className="media-button-label">{label}</span>
    </button>
  )
}

/** The controller icon's panel: the shortcuts, as `files-hint` lines. */
export function ShortcutsPanel({ children }: { children: ReactNode }) {
  return (
    <div className="media-keys" role="dialog" aria-label="Controller shortcuts">
      <h3 className="settings-heading display">Shortcuts</h3>
      {children}
    </div>
  )
}

/** Left or right along a row of buttons from the one with the cursor; false at the end. */
export function stepAlong(row: HTMLElement | null, direction: 'left' | 'right'): HTMLElement | null {
  const buttons = [...(row?.querySelectorAll<HTMLElement>('[data-focusable]') ?? [])]
  return buttons[buttons.indexOf(document.activeElement as HTMLElement) + (direction === 'right' ? 1 : -1)] ?? null
}
