import { useEffect, useState } from 'react'
import { buttonName } from '../../../shared/controls'
import { connectedFamily, type ControllerFamily } from '../../../shared/controllers'
import { buttonIcon, type ButtonIconName } from '../../../shared/buttonIcons'

/** Every button picture, by its file name. */
const URLS = import.meta.glob<string>('../assets/buttons/*.svg', { eager: true, import: 'default' })
const url = (name: ButtonIconName): string => URLS[`../assets/buttons/${name}.svg`]

// Controller buttons drawn as the controller in hand marks them (the alpha-es-de theme's
// help icons, CC0): Xbox letters by default, PlayStation shapes or a Switch's layout
// when one of those is connected.

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

function iconFor(button: number, family: ControllerFamily): { src: string; mark?: string; wide?: boolean } | null {
  const icon = buttonIcon(button, family)
  return icon && { src: url(icon.name), mark: icon.mark, wide: icon.wide }
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

/** The D-pad; `leftRight` marks just its left and right (the player's scrub; from the Alpha theme for ES-DE). */
export function DpadIcon({ leftRight = false }: { leftRight?: boolean }) {
  return (
    <span className="control-icon" title={leftRight ? 'D-pad left and right' : 'D-pad'}>
      <img src={url(leftRight ? 'dpad_leftright' : 'dpad_all')} alt={leftRight ? 'D-pad left and right' : 'D-pad'} />
    </span>
  )
}
