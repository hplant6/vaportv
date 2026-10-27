import { useEffect, useState, type ReactNode } from 'react'
import { DEFAULT_CONTROLS, type Controls } from '../../../shared/controls'
import { CONTROLS_GUIDE_EVENT } from '../input/focus'
import { ButtonIcon, DpadIcon, useControllerFamily } from './ButtonIcon'

// Select (by default): what each button does, in one line along the bottom of the screen as
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
  const items: [ReactNode, string][] = [
    [<DpadIcon key="dpad" />, 'Move'],
    [icon(c.select), 'Select'],
    [icon(c.back), 'Back'],
    [[icon(c.previousTab), icon(c.nextTab)], 'Tabs'],
    [icon(c.favorite), 'Favorite'],
    [icon(c.options), 'Artwork'],
    [icon(c.gameMenu), 'Game options'],
    [[icon(c.volumeDown), icon(c.volumeUp)], 'Volume'],
    [icon(c.voiceSearch), 'Voice search']
  ]

  return (
    <div className={`controls-guide${visible ? ' visible' : ''}`} aria-hidden={!visible}>
      {items.map(([icons, label]) => (
        <span className="controls-guide-item" key={label}>
          {icons}
          <span className="controls-guide-label display">{label}</span>
        </span>
      ))}
    </div>
  )
}
