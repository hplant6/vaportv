import { useEffect, useRef, useState } from 'react'
import { focus, TRAP_CLOSE_EVENT } from '../input/focus'
import { OverStage } from './GooglePhotos'

// An on-screen keyboard for the D-pad, for the times vaporTV needs text (a Wi-Fi password,
// a search). Steam's own keyboard can't be opened from outside in Gaming Mode, so this one
// is laid out like it: a tray across the bottom of the screen that slides up, the keys
// staggered as on a real keyboard. A real keyboard types into it too; B (Escape, a remote's
// Back) cancels.

/** A key: what it types, and how many key-widths it takes (1 if not given). */
type Key = string | { label: string; units: number }

// Each row is 12.5 key-widths across; `null`s are gaps that stagger the rows.
const LETTERS: (Key | null)[][] = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-'],
  [null, 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '@', '_'],
  [null, 'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  [null, 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/']
]

const SYMBOLS: (Key | null)[][] = [
  ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '_'],
  [null, '`', '~', '-', '=', '+', '[', ']', '{', '}', '\\', '|', ';'],
  [null, ':', "'", '"', '<', '>', '?', '€', '£', '¥'],
  [null, '°', '§', '¿', '¡', '•', '…', '¢', ',', '.', '/']
]

/** The gap before each row, in key-widths. */
const INDENT = [0, 0.5, 0.75, 0]
/** The tray slides away this long before it's gone. */
const LEAVE_MS = 200

export function OnScreenKeyboard({
  title,
  prompt,
  secret = false,
  initial = '',
  showField = true,
  onChange,
  onDone,
  onCancel
}: {
  title: string
  prompt?: string
  /** A password: shown as dots until Show. */
  secret?: boolean
  /** Text to start from (a name being changed). */
  initial?: string
  /** Show what's typed in the tray (search shows it in its own field instead). */
  showField?: boolean
  /** Called as the text changes. */
  onChange?: (text: string) => void
  onDone: (text: string) => void
  onCancel: () => void
}) {
  const panel = useRef<HTMLDivElement>(null)
  const [text, setText] = useState(initial)
  const [shift, setShift] = useState(false)
  const [symbols, setSymbols] = useState(false)
  const [reveal, setReveal] = useState(!secret)
  const [leaving, setLeaving] = useState(false)

  // Slides down, then hands over.
  const leave = useRef((then: () => void) => {
    setLeaving(true)
    setTimeout(then, LEAVE_MS)
  })

  const changed = useRef(onChange)
  changed.current = onChange
  const first = useRef(true)
  useEffect(() => {
    if (first.current) first.current = false
    else changed.current?.(text)
  }, [text])

  // The cursor starts on Q, once: the page behind refreshing mustn't move it back.
  const cancel = useRef(onCancel)
  cancel.current = onCancel
  useEffect(() => {
    const q = panel.current?.querySelector<HTMLElement>('[data-key="q"]')
    if (q) focus(q)
    const close = (): void => leave.current(() => cancel.current())
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
      else if (event.key === 'Backspace' || event.key === 'BrowserBack') leave.current(() => cancel.current())
      else if (event.key.length === 1) setText((t) => t + event.key)
      else return
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const upper = shift && !symbols
  const type = (k: string): void => setText((t) => t + (upper ? k.toUpperCase() : k))
  const key = (label: string, onPress: () => void, units = 1, extra = '', props: Record<string, string> = {}) => (
    <button
      key={label}
      className={`osk-key${extra}`}
      style={{ flexGrow: units }}
      tabIndex={-1}
      data-focusable=""
      data-select-sound="move"
      onClick={onPress}
      {...props}
    >
      {label}
    </button>
  )
  const gap = (units: number, id: string) => units > 0 && <span key={id} className="osk-gap" style={{ flexGrow: units }} />

  const rows = symbols ? SYMBOLS : LETTERS
  const charKeys = (row: (Key | null)[]) =>
    row.filter((k): k is Key => k !== null).map((k) => {
      const ch = typeof k === 'string' ? k : k.label
      return key(upper ? ch.toUpperCase() : ch, () => type(ch), 1, '', { 'data-key': ch })
    })

  return (
    <OverStage>
      <div className={`osk-dock${leaving ? ' leaving' : ''}`}>
        <div className="osk-tray" ref={panel} data-focus-trap="">
          {showField && (
            <div className="osk-head">
              <h2 className="osk-title display">{title}</h2>
              {prompt && <p className="osk-prompt">{prompt}</p>}
              <div className={`osk-field${text ? '' : ' empty'}`}>{text ? (reveal ? text : '•'.repeat(text.length)) : 'Type with the D-pad and A'}</div>
            </div>
          )}
          <div className="osk-rows">
            <div className="osk-row">
              {charKeys(rows[0])}
              {key('⌫', () => setText((t) => t.slice(0, -1)), 1.5, ' fn')}
            </div>
            <div className="osk-row">
              {gap(INDENT[1], 'g1')}
              {charKeys(rows[1])}
            </div>
            <div className="osk-row">
              {gap(INDENT[2], 'g2')}
              {charKeys(rows[2])}
              {key('Enter', () => leave.current(() => onDone(text)), 2.75, ' done')}
            </div>
            <div className="osk-row">
              {key(shift ? '⇧ On' : '⇧', () => setShift((s) => !s), 1.5, shift ? ' fn on' : ' fn')}
              {charKeys(rows[3])}
              {key(symbols ? 'ABC' : '?123', () => setSymbols((s) => !s), 1, ' fn')}
            </div>
            <div className="osk-row">
              {key('Space', () => setText((t) => t + ' '), secret ? 10.5 : 12.5, '', { 'data-key': ' ' })}
              {secret && key(reveal ? 'Hide' : 'Show', () => setReveal((r) => !r), 2, ' fn')}
            </div>
          </div>
        </div>
      </div>
    </OverStage>
  )
}
