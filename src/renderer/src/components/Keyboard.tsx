import { useEffect, useRef, useState } from 'react'
import { focus, TRAP_CLOSE_EVENT } from '../input/focus'
import { OverStage } from './GooglePhotos'

// An on-screen keyboard for the D-pad, as on Android TV, for the times vaporTV needs
// text (a Wi-Fi password). Steam's own keyboard can't be opened from outside in Gaming
// Mode. A real keyboard types into it too; B (Escape, a remote's Back) cancels.

const LETTERS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', '-'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', '.', '@', '_']
]

const SYMBOLS = [
  ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')'],
  ['-', '_', '=', '+', '[', ']', '{', '}', '\\', '|'],
  [';', ':', "'", '"', ',', '.', '<', '>', '/', '?'],
  ['`', '~', '€', '£', '¥', '°', '§', '¿', '¡', '•']
]

export function OnScreenKeyboard({
  title,
  prompt,
  secret = false,
  onDone,
  onCancel
}: {
  title: string
  prompt?: string
  /** A password: shown as dots until Show. */
  secret?: boolean
  onDone: (text: string) => void
  onCancel: () => void
}) {
  const panel = useRef<HTMLDivElement>(null)
  const [text, setText] = useState('')
  const [shift, setShift] = useState(false)
  const [symbols, setSymbols] = useState(false)
  const [reveal, setReveal] = useState(!secret)

  // The cursor starts on Q, once: the page behind refreshing mustn't move it back.
  const cancel = useRef(onCancel)
  cancel.current = onCancel
  useEffect(() => {
    const first = panel.current?.querySelector<HTMLElement>('[data-key="q"]')
    if (first) focus(first)
    const close = (): void => cancel.current()
    window.addEventListener(TRAP_CLOSE_EVENT, close)
    return () => window.removeEventListener(TRAP_CLOSE_EVENT, close)
  }, [])

  // A real keyboard types straight in (arrows and Enter still move and press keys here).
  // A remote's Backspace deletes, and with nothing left to delete, cancels, as Back.
  const typed = useRef(text)
  typed.current = text
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.altKey || event.metaKey) return
      if (event.key === 'Backspace' && typed.current) setText((t) => t.slice(0, -1))
      else if (event.key === 'Backspace' || event.key === 'BrowserBack') cancel.current()
      else if (event.key.length === 1) setText((t) => t + event.key)
      else return
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const rows = symbols ? SYMBOLS : LETTERS
  const type = (key: string): void => setText((t) => t + (shift && !symbols ? key.toUpperCase() : key))
  const key = (label: string, onPress: () => void, extra = '', props: Record<string, string> = {}) => (
    <button
      key={label}
      className={`osk-key display${extra}`}
      tabIndex={-1}
      data-focusable=""
      data-select-sound="move"
      onClick={onPress}
      {...props}
    >
      {label}
    </button>
  )

  return (
    <OverStage>
      <div className="dialog-backdrop">
        <div className="dialog-panel osk-panel" ref={panel} data-focus-trap="">
          <h2 className="section-label display">{title}</h2>
          {prompt && <p className="dialog-message">{prompt}</p>}
          <div className={`osk-field${text ? '' : ' empty'}`}>{text ? (reveal ? text : '•'.repeat(text.length)) : 'Type with the D-pad and A'}</div>
          <div className="osk-keys">
            {rows.flat().map((k) => key(shift && !symbols ? k.toUpperCase() : k, () => type(k), '', { 'data-key': k }))}
          </div>
          <div className="osk-actions">
            {key(shift ? '⇧ ON' : '⇧', () => setShift((s) => !s), shift ? ' on' : '')}
            {key(symbols ? 'ABC' : '?123', () => setSymbols((s) => !s))}
            {key('Space', () => setText((t) => t + ' '), ' wide')}
            {key('⌫', () => setText((t) => t.slice(0, -1)))}
            {secret && key(reveal ? 'Hide' : 'Show', () => setReveal((r) => !r))}
            {key('Done', () => onDone(text), ' done')}
          </div>
        </div>
      </div>
    </OverStage>
  )
}
