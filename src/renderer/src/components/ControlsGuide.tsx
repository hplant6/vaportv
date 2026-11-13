import { useEffect, useState, type ReactNode } from 'react'
import { DEFAULT_CONTROLS, type Controls } from '../../../shared/controls'
import { CONTROLS_GUIDE_EVENT } from '../input/focus'
import { ButtonIcon, useControllerFamily } from './ButtonIcon'

// R2 (by default): what every button does, in two lines along the bottom of the screen as
// ES-DE's help bar does, with the buttons as they're set in Settings → Controller. Press it
// again to put it away; it goes by itself after a while, and when a game or app opens.

const SHOW_MS = 8000

export function ControlsGuide() {
  const family = useControllerFamily()
  const [controls, setControls] = useState<Controls | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const hide = (): void => {
      clearTimeout(timer)
      setVisible(false)
    }
    const toggle = (): void => {
      setVisible((shown) => {
        clearTimeout(timer)
        if (shown) return false
        timer = setTimeout(() => setVisible(false), SHOW_MS)
        return true
      })
      // Read each time, so a button just moved in Settings shows where it is now.
      window.steamtv.getSettings().then((s) => setControls(s.controls))
    }
    window.addEventListener(CONTROLS_GUIDE_EVENT, toggle)
    window.addEventListener('blur', hide)
    return () => {
      window.removeEventListener(CONTROLS_GUIDE_EVENT, toggle)
      window.removeEventListener('blur', hide)
      clearTimeout(timer)
    }
  }, [])

  const c = controls ?? DEFAULT_CONTROLS
  const icon = (button: number) => <ButtonIcon key={button} button={button} family={family} />
  // Two at once (both sticks; Select and Start, held, while playing).
  const both = (a: number, b: number) => [icon(a), <span key="plus" className="controls-guide-plus">+</span>, icon(b)]
  // The D-pad and sticks move, which needs no saying.
  const items: [ReactNode, string][] = [
    [icon(c.select), 'Select'],
    [icon(c.back), 'Back'],
    [[icon(c.previousTab), icon(c.nextTab)], 'Tabs'],
    [icon(c.favorite), 'Favorite'],
    [icon(c.playlist), 'Playlist'],
    [icon(c.gameMenu), 'Game options'],
    [icon(c.sideBar), 'Lists'],
    [icon(c.controlsGuide), 'Help'],
    [icon(c.settings), 'Settings'],
    [icon(c.voiceSearch), 'Voice search'],
    [icon(c.nextSong), 'Next song'],
    [both(10, 11), 'Sound off'],
    [both(8, 9), 'Close game (hold)']
  ]

  // Halved, so the two lines are about as long as each other.
  const half = Math.ceil(items.length / 2)
  return (
    <div className={`controls-guide${visible ? ' visible' : ''}`} aria-hidden={!visible}>
      {[items.slice(0, half), items.slice(half)].map((row, i) => (
        <div className="controls-guide-row" key={i}>
          {row.map(([icons, label]) => (
            <span className="controls-guide-item" key={label}>
              {icons}
              <span className="controls-guide-label display">{label}</span>
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}
