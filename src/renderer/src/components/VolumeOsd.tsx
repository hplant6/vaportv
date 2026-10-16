import { useEffect, useState } from 'react'
import { VOLUME_EVENT } from '../input/volume'

const SHOWN_MS = 1500

/** The volume bar that appears while L2 / R2 change it. */
export function VolumeOsd() {
  const [volume, setVolume] = useState<{ level: number; muted: boolean } | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const onVolume = (event: Event): void => {
      setVolume((event as CustomEvent<{ level: number; muted: boolean }>).detail)
      setVisible(true)
      clearTimeout(timer)
      timer = setTimeout(() => setVisible(false), SHOWN_MS)
    }
    const onBlur = (): void => setVisible(false)
    window.addEventListener(VOLUME_EVENT, onVolume)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener(VOLUME_EVENT, onVolume)
      window.removeEventListener('blur', onBlur)
      clearTimeout(timer)
    }
  }, [])

  const level = volume?.muted ? 0 : (volume?.level ?? 0)
  return (
    <div className={`volume-osd${visible ? ' visible' : ''}`} aria-hidden={!visible}>
      <svg className="volume-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
        {level > 0 && <path d="M16 9a4 4 0 0 1 0 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />}
        {level > 50 && <path d="M18.5 6.5a7.5 7.5 0 0 1 0 11" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />}
        {level === 0 && <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
      </svg>
      <div className="volume-track">
        <div className="volume-fill" style={{ width: `${level}%` }} />
      </div>
      <span className="volume-level display">{level}</span>
    </div>
  )
}
