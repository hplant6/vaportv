import { useState } from 'react'
import pillBottom from '../assets/nav-pill-bottom.svg'
import pillTop from '../assets/nav-pill-top.svg'
import { GearIcon, PowerIcon } from './icons'
import { PowerMenu } from './PowerMenu'

export type Screen = 'home' | 'steam' | 'apps' | 'switch' | 'ps3' | 'xbox360' | 'gamecube' | 'dreamcast' | 'settings'

const TABS: { id: Screen; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'steam', label: 'Steam' },
  { id: 'apps', label: 'Apps' },
  { id: 'switch', label: 'Switch' },
  { id: 'ps3', label: 'PS3' },
  { id: 'xbox360', label: 'Xbox 360' },
  { id: 'gamecube', label: 'GameCube' },
  { id: 'dreamcast', label: 'Dreamcast' }
]

/** Screens in the order L1/R1 step through them: the tabs, then Settings. */
export const TAB_ORDER: Screen[] = [...TABS.map((t) => t.id), 'settings']

export function NavBar({ active, onNavigate }: { active: Screen; onNavigate: (screen: Screen) => void }) {
  const [powerOpen, setPowerOpen] = useState(false)
  const tab = (id: Screen, content: React.ReactNode, label: string, icon = false) => (
    <button
      key={id}
      className={`nav-tab display${icon ? ' nav-icon-tab' : ''}${id === active ? ' active' : ''}`}
      tabIndex={-1}
      aria-label={label}
      data-focusable=""
      data-select-sound="move"
      onClick={() => onNavigate(id)}
    >
      {content}
    </button>
  )

  return (
    <nav className="nav">
      <img className="pill-top" src={pillTop} alt="" />
      <img className="pill-bottom" src={pillBottom} alt="" />
      <div className="nav-tabs" data-focus-memory="nav">
        {TABS.map((t) => tab(t.id, t.label, t.label))}
        {tab('settings', <GearIcon />, 'Settings', true)}
        <div className="power">
          <button
            id="power-button"
            className={`nav-tab display nav-icon-tab${powerOpen ? ' open' : ''}`}
            tabIndex={-1}
            aria-label="Power"
            aria-haspopup="menu"
            aria-expanded={powerOpen}
            data-focusable=""
            data-select-sound="move"
            onClick={() => setPowerOpen(true)}
          >
            <PowerIcon />
          </button>
          {powerOpen && <PowerMenu onClose={() => setPowerOpen(false)} />}
        </div>
      </div>
    </nav>
  )
}
