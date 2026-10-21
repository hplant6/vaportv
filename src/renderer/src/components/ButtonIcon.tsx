import { useEffect, useState } from 'react'
import { buttonName } from '../../../shared/controls'
import { connectedFamily, type ControllerFamily } from '../../../shared/controllers'
import aPs from '../assets/buttons/a_PS.svg'
import aXbox from '../assets/buttons/a_XBOX.svg'
import bPs from '../assets/buttons/b_PS.svg'
import bXbox from '../assets/buttons/b_XBOX.svg'
import backPs123 from '../assets/buttons/back_PS123.svg'
import backPs4 from '../assets/buttons/back_PS4.svg'
import backPs5 from '../assets/buttons/back_PS5.svg'
import backSwitch from '../assets/buttons/back_switch.svg'
import backXbox from '../assets/buttons/back_XBOX.svg'
import dpad from '../assets/buttons/dpad_all.svg'
import l1 from '../assets/buttons/l.svg'
import l2 from '../assets/buttons/lt.svg'
import r1 from '../assets/buttons/r.svg'
import r2 from '../assets/buttons/rt.svg'
import startPs123 from '../assets/buttons/start_PS123.svg'
import startPs4 from '../assets/buttons/start_PS4.svg'
import startPs5 from '../assets/buttons/start_PS5.svg'
import startSwitch from '../assets/buttons/start_switch.svg'
import startXbox from '../assets/buttons/start_XBOX.svg'
import stick from '../assets/buttons/thumbstick_click.svg'
import xPs from '../assets/buttons/x_PS.svg'
import xXbox from '../assets/buttons/x_XBOX.svg'
import yPs from '../assets/buttons/y_PS.svg'
import yXbox from '../assets/buttons/y_XBOX.svg'

// Controller buttons drawn as the controller in hand marks them (the alpha-es-de theme's
// help icons, CC0): Xbox letters by default, PlayStation shapes or a Switch's layout
// when one of those is connected.

/** The face buttons by standard-mapping position: bottom, right, left, top. */
const FACE: Record<ControllerFamily, string[]> = {
  xbox: [aXbox, bXbox, xXbox, yXbox],
  ps3: [aPs, bPs, xPs, yPs],
  ps4: [aPs, bPs, xPs, yPs],
  ps5: [aPs, bPs, xPs, yPs],
  // Nintendo's letters sit the other way round: B at the bottom, A on the right, Y left, X top.
  switch: [bXbox, aXbox, yXbox, xXbox]
}

/** Select and Start: View and Menu on Xbox, Share/Create and Options on PlayStation, − and + on Switch. */
const SELECT_START: Record<ControllerFamily, [string, string]> = {
  xbox: [backXbox, startXbox],
  ps3: [backPs123, startPs123],
  ps4: [backPs4, startPs4],
  ps5: [backPs5, startPs5],
  switch: [backSwitch, startSwitch]
}

/** How often to look again: browsers don't always say when a controller comes or goes. */
const CHECK_MS = 5000

/** The family of the controller connected, kept up to date as controllers come and go. */
export function useControllerFamily(): ControllerFamily {
  const [family, setFamily] = useState<ControllerFamily>(() => connectedFamily([...navigator.getGamepads()].filter((p) => p !== null)))
  useEffect(() => {
    const check = (): void => setFamily(connectedFamily([...navigator.getGamepads()].filter((p) => p !== null)))
    window.addEventListener('gamepadconnected', check)
    window.addEventListener('gamepaddisconnected', check)
    const timer = setInterval(check, CHECK_MS)
    return () => {
      window.removeEventListener('gamepadconnected', check)
      window.removeEventListener('gamepaddisconnected', check)
      clearInterval(timer)
    }
  }, [])
  return family
}

/** `wide`: the shoulder buttons, drawn across the middle of a square, shown cropped wider. */
function iconFor(button: number, family: ControllerFamily): { src: string; mark?: string; wide?: boolean } | null {
  if (button <= 3) return { src: FACE[family][button] }
  if (button === 4) return { src: l1, wide: true }
  if (button === 5) return { src: r1, wide: true }
  if (button === 6) return { src: l2, wide: true }
  if (button === 7) return { src: r2, wide: true }
  if (button === 8) return { src: SELECT_START[family][0] }
  if (button === 9) return { src: SELECT_START[family][1] }
  // The stick clicks share one picture: marked with which stick.
  if (button === 10) return { src: stick, mark: 'L' }
  if (button === 11) return { src: stick, mark: 'R' }
  return null
}

/** A controller button (by standard-mapping index) as its picture; its name if there isn't one. */
export function ButtonIcon({ button, family }: { button: number; family: ControllerFamily }) {
  const icon = iconFor(button, family)
  const name = buttonName(button, family)
  if (!icon) return <span className="control-button display">{name}</span>
  return (
    <span className={`control-icon${icon.wide ? ' wide' : ''}`} title={name}>
      <img src={icon.src} alt={name} />
      {icon.mark && <span className="control-icon-mark display">{icon.mark}</span>}
    </span>
  )
}

export function DpadIcon() {
  return (
    <span className="control-icon" title="D-pad">
      <img src={dpad} alt="D-pad" />
    </span>
  )
}
