import { useEffect, useRef, useState } from 'react'
import { TextRow } from '../components/TextRow'
import { toast } from '../components/Toast'
import { focus, trap, TRAP_CLOSE_EVENT } from '../input/focus'
import { play } from '../input/sounds'

// Add a network share (Music sources): the computer's name or address, a username and
// password, then its shares to choose from; the one chosen is mounted under ~/Network and read
// into the library. The first time, vaporTV fetches its share helper (rclone, about 20 MB).

export function AddShare({ onClose }: { onClose: (added: boolean) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [host, setHost] = useState('')
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [typing, setTyping] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [shares, setShares] = useState<string[] | null>(null)

  useEffect(() => {
    const first = box.current?.querySelector<HTMLElement>('[data-focusable]')
    if (first) focus(first)
  }, [])
  useEffect(() => {
    const onBack = (): void => {
      if (trap() === box.current && !busy) onClose(false)
    }
    window.addEventListener(TRAP_CLOSE_EVENT, onBack)
    return () => window.removeEventListener(TRAP_CLOSE_EVENT, onBack)
  }, [busy, onClose])
  useEffect(() => {
    const first = box.current?.querySelector<HTMLElement>('.add-share-list [data-focusable]')
    if (first) focus(first)
  }, [shares])

  const find = (): void => {
    if (!host.trim()) return setError("Type the computer's name or address first")
    setError('')
    setBusy('Looking for its shares… (the first time, vaporTV fetches its share helper: about 20 MB)')
    window.steamtv.music.shares
      .find({ host: host.trim(), user: user.trim(), password })
      .then((found) => {
        setShares(found)
        if (!found.length) setError('That computer has no shares this account can see')
      })
      .catch((e: unknown) => setError(String((e as Error).message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))
      .finally(() => setBusy(''))
  }

  const add = (share: string): void => {
    setError('')
    setBusy(`Connecting to ${share}…`)
    window.steamtv.music.shares
      .add({ host: host.trim(), user: user.trim(), password, share })
      .then(() => {
        play('favorite')
        toast(`${share} on ${host.trim()} is in your library: reading its music now`)
        onClose(true)
      })
      .catch((e: unknown) => setError(String((e as Error).message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))
      .finally(() => setBusy(''))
  }

  return (
    <div className="dialog-backdrop music-picker-backdrop">
      <div className="phone-upload add-share" ref={box} {...(typing ? {} : { 'data-focus-trap': '' })} data-nav-scope="">
        <h2 className="phone-upload-title display">Add a network share</h2>
        <p className="phone-upload-help">Music on another computer or a NAS. Use the account you sign in to it with; it's kept on this TV, readable only by vaporTV.</p>
        <div className="setting-list">
          <TextRow label="Computer" value={host} placeholder="Computer name or address (e.g. LargeBox, 192.168.1.12)" title="Computer name or address" onDone={setHost} onTyping={setTyping} />
          <TextRow label="Username" value={user} placeholder="Username" title="Username" onDone={setUser} onTyping={setTyping} />
          <TextRow label="Password" value={password} placeholder="Password" title="Password" secret onDone={setPassword} onTyping={setTyping} />
          <button className="setting-row" tabIndex={-1} data-focusable="" data-select-sound="move" onClick={find}>
            <span className="setting-name display">Find its shares</span>
          </button>
        </div>
        {busy && <p className="phone-upload-count">{busy}</p>}
        {error && <p className="add-share-error">{error}</p>}
        {shares && shares.length > 0 && (
          <div className="setting-list add-share-list">
            <p className="phone-upload-count">Choose the one with your music:</p>
            {shares.map((s) => (
              <button key={s} className="setting-row" tabIndex={-1} data-focusable="" data-select-sound="move" onClick={() => add(s)}>
                <span className="setting-name display">{s}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
