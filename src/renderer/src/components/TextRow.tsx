import { useRef, useState } from 'react'
import { focus } from '../input/focus'
import { OnScreenKeyboard } from './Keyboard'

/**
 * A text setting as a row: what's typed (or `placeholder`), and A opens vaporTV's keyboard to type it.
 * Never a real text box: in Gaming Mode Steam pops its own keyboard up over one, and the controller
 * then types into both (every press twice).
 *
 * `onTyping`: the keyboard opening and closing. A dialog the row sits in drops its data-focus-trap and
 * stops listening for B meanwhile (as Wi-Fi's and search's do), so the keyboard has the cursor and B.
 */
export function TextRow({
  label,
  value,
  placeholder,
  title,
  prompt,
  secret = false,
  className = '',
  onDone,
  onTyping
}: {
  label: string
  value: string
  placeholder: string
  /** The keyboard's heading. */
  title: string
  prompt?: string
  secret?: boolean
  className?: string
  onDone: (text: string) => void
  onTyping?: (typing: boolean) => void
}) {
  const row = useRef<HTMLButtonElement>(null)
  const [typing, setTyping] = useState(false)

  const open = (on: boolean): void => {
    setTyping(on)
    onTyping?.(on)
    // Back on the row once the keyboard has gone (the dialog may move the cursor on from there).
    if (!on) requestAnimationFrame(() => row.current && focus(row.current))
  }

  return (
    <>
      <button
        ref={row}
        className={`setting-row text-row${value ? '' : ' empty'} ${className}`}
        tabIndex={-1}
        aria-label={label}
        data-focusable=""
        data-select-sound="move"
        onClick={() => open(true)}
      >
        <span className="setting-name">{value ? (secret ? '•'.repeat(value.length) : value) : placeholder}</span>
      </button>
      {typing && (
        <OnScreenKeyboard
          title={title}
          prompt={prompt}
          secret={secret}
          initial={value}
          onDone={(text) => {
            open(false)
            onDone(text)
          }}
          onCancel={() => open(false)}
        />
      )}
    </>
  )
}
