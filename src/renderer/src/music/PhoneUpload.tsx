import QRCode from 'qrcode'
import { useEffect, useRef, useState } from 'react'
import { focus, trap, TRAP_CLOSE_EVENT } from '../input/focus'
import { play } from '../input/sounds'

// Send from your phone: a code to scan, the page it opens taking songs from the phone, and
// each one listed here as it arrives (into ~/Music/From your phone, then the library). B, or
// Done, closes the page on the phone too.

export function PhoneUpload({ onClose }: { onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [received, setReceived] = useState<string[]>([])

  useEffect(() => {
    const off = window.steamtv.music.onPhone((event) => {
      if (event.phase === 'ready') {
        setUrl(event.url)
        void QRCode.toDataURL(event.url, { margin: 1, width: 360, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } }).then(setQr)
      } else if (event.phase === 'received') {
        play('favorite')
        setReceived((was) => [event.name, ...was].slice(0, 12))
      } else setMessage(event.message ?? 'Closed')
    })
    window.steamtv.music.phone(true)
    const done = box.current?.querySelector<HTMLElement>('[data-focusable]')
    if (done) focus(done)
    const onBack = (): void => {
      if (trap() === box.current) onClose()
    }
    window.addEventListener(TRAP_CLOSE_EVENT, onBack)
    return () => {
      off()
      window.steamtv.music.phone(false)
      window.removeEventListener(TRAP_CLOSE_EVENT, onBack)
    }
  }, [])

  return (
    <div className="dialog-backdrop music-picker-backdrop">
      <div className="phone-upload" ref={box} data-focus-trap="">
        <h2 className="phone-upload-title display">Send music from your phone</h2>
        <p className="phone-upload-help">Scan this with your phone's camera (on the same Wi-Fi), then pick songs. They land on this TV and show up in the Music tab.</p>
        <div className="phone-upload-body">
          <div className="phone-upload-qr">{qr ? <img src={qr} alt="" /> : <span>{message ?? 'Getting ready…'}</span>}</div>
          <div className="phone-upload-side">
            {url && <p className="phone-upload-url">{url}</p>}
            {message && <p className="phone-upload-url">{message}</p>}
            <p className="phone-upload-count">{received.length ? `Received ${received.length}${received.length === 12 ? '+' : ''}:` : 'Nothing yet'}</p>
            <ul className="phone-upload-list">
              {received.map((name, i) => (
                <li key={`${name}-${i}`}>♪ {name}</li>
              ))}
            </ul>
          </div>
        </div>
        <button className="files-action display" tabIndex={-1} data-focusable="" data-select-sound="move" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  )
}
