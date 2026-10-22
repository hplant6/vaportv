import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { UpdateState } from '../../../shared/types'
import { focus, TRAP_CLOSE_EVENT } from '../input/focus'
import { toast } from './Toast'

// A newer vaporTV: what changed in each release since this one, then Update now (download,
// swap in, restart) or Later. Opens by itself once per version, when vaporTV is in front
// with nothing else open; Settings → General → Updates opens it any time.

/** Settings asks for the window (with the state it has). */
export const OPEN_UPDATE_EVENT = 'steamtv:open-update'

type Phase = { kind: 'ready' } | { kind: 'downloading'; percent: number } | { kind: 'restarting' } | { kind: 'failed'; message: string }

export function UpdateDialog() {
  const [state, setState] = useState<UpdateState | null>(null)
  const [open, setOpen] = useState(false)
  /** Found while a game or another window was in front: open when vaporTV is free. */
  const pending = useRef<UpdateState | null>(null)

  const tryOpen = useCallback(() => {
    const next = pending.current
    if (!next?.update || !document.hasFocus() || document.querySelector('[data-focus-trap]')) return
    pending.current = null
    setState(next)
    setOpen(true)
  }, [])

  useEffect(() => {
    const offer = (next: UpdateState): void => {
      if (!next.update || next.dismissed === next.update.version) return
      pending.current = next
      tryOpen()
    }
    // One found before this window loaded counts too.
    window.steamtv.updates.get().then(offer)
    const off = window.steamtv.updates.onAvailable(offer)
    const fromSettings = (event: Event): void => {
      setState((event as CustomEvent<UpdateState>).detail)
      setOpen(true)
    }
    window.addEventListener('focus', tryOpen)
    window.addEventListener(OPEN_UPDATE_EVENT, fromSettings)
    return () => {
      off()
      window.removeEventListener('focus', tryOpen)
      window.removeEventListener(OPEN_UPDATE_EVENT, fromSettings)
    }
  }, [tryOpen])

  if (!open || !state?.update) return null
  return <Update state={state} onClose={() => setOpen(false)} />
}

function Update({ state, onClose }: { state: UpdateState; onClose: () => void }) {
  const update = state.update!
  const panel = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'ready' })
  const busy = phase.kind === 'downloading' || phase.kind === 'restarting'

  const later = useCallback(() => {
    if (busy) return
    window.steamtv.updates.dismiss(update.version)
    onClose()
  }, [busy, update.version, onClose])

  useEffect(() => {
    window.addEventListener(TRAP_CLOSE_EVENT, later)
    return () => window.removeEventListener(TRAP_CLOSE_EVENT, later)
  }, [later])

  useEffect(() => window.steamtv.updates.onProgress((percent) => setPhase({ kind: 'downloading', percent })), [])

  // The cursor starts on Update now.
  useEffect(() => {
    const button = panel.current?.querySelector<HTMLElement>('.update-buttons [data-focusable]')
    if (button) focus(button)
  }, [])

  const install = (): void => {
    setPhase({ kind: 'downloading', percent: 0 })
    window.steamtv.updates.install().then((err) => {
      if (err) {
        setPhase({ kind: 'failed', message: err })
        toast(`Couldn't update: ${err}`)
      } else setPhase({ kind: 'restarting' })
    })
  }

  const status =
    phase.kind === 'downloading'
      ? `Downloading… ${phase.percent}%`
      : phase.kind === 'restarting'
        ? 'Restarting vaporTV…'
        : phase.kind === 'failed'
          ? `Couldn't update: ${phase.message}`
          : `You have ${update.current}. The download is ${Math.round(update.size / 1e6)} MB.`

  return (
    <div className="dialog-backdrop">
      <div className="dialog-panel update-panel" ref={panel} data-focus-trap="">
        <h2 className="section-label display">vaporTV {update.version} is out</h2>
        <div className="update-notes">
          {update.notes.map((release) => (
            <section
              key={release.version}
              className="update-release"
              tabIndex={-1}
              data-focusable=""
              // Moving through the releases scrolls the notes along.
              onFocus={(event) => event.currentTarget.scrollIntoView({ block: 'nearest', behavior: 'smooth' })}
            >
              <h3 className="update-version display">
                {release.version}
                {release.date && <span className="update-date">{new Date(release.date).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>}
              </h3>
              <Notes text={release.body} />
            </section>
          ))}
        </div>
        <p className="dialog-message update-status">{status}</p>
        <div className="update-buttons">
          <button className="dialog-button display" tabIndex={-1} data-focusable="" disabled={busy} onClick={install}>
            {phase.kind === 'failed' ? 'Try again' : 'Update now'}
          </button>
          <button className="dialog-button display" tabIndex={-1} data-focusable="" data-select-sound="move" disabled={busy} onClick={later}>
            Later
          </button>
        </div>
      </div>
    </div>
  )
}

/** Release notes as written in CHANGELOG.md: "### " headings, "- " points, paragraphs, **bold** and `code`. */
function Notes({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  let points: string[] = []
  const flush = (): void => {
    if (points.length) blocks.push(<ul key={blocks.length}>{points.map((p, i) => <li key={i}>{inline(p)}</li>)}</ul>)
    points = []
  }
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim()
    if (/^[-*] /.test(line)) points.push(line.slice(2))
    else if (/^\s{2,}\S/.test(raw) && points.length) points[points.length - 1] += ' ' + line
    else {
      flush()
      if (line.startsWith('#')) blocks.push(<h4 key={blocks.length}>{inline(line.replace(/^#+\s*/, ''))}</h4>)
      else if (line) blocks.push(<p key={blocks.length}>{inline(line)}</p>)
    }
  }
  flush()
  return <div className="update-body">{blocks.length ? blocks : <p>No notes for this release.</p>}</div>
}

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, i) =>
    part.startsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part.startsWith('`') ? <code key={i}>{part.slice(1, -1)}</code> : part
  )
}
