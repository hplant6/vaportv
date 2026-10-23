import { useState } from 'react'
import { useAvailableTabs } from '../availableTabs'
import navLine from '../assets/nav-line.svg'
import { GearIcon, PowerIcon } from './icons'
import { Clock } from './Clock'
import { BatteryIndicator } from './BatteryIndicator'
import { DateWeather } from './DateWeather'
import { PowerMenu } from './PowerMenu'

export type Screen = 'home' | 'steam' | 'apps' | 'switch' | 'ps3' | 'xbox360' | 'gamecube' | 'dreamcast' | 'arcade' | 'settings'

const TABS: { id: Screen; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'steam', label: 'Steam' },
  { id: 'apps', label: 'Apps' },
  { id: 'switch', label: 'Switch' },
  { id: 'ps3', label: 'PS3' },
  { id: 'xbox360', label: 'Xbox 360' },
  { id: 'gamecube', label: 'GameCube' },
  { id: 'dreamcast', label: 'Dreamcast' },
  { id: 'arcade', label: 'Arcade' }
]

/** Screens in the order L1/R1 step through them, as the bar reads left to right: Settings, then the tabs. */
export const TAB_ORDER: Screen[] = ['settings', ...TABS.map((t) => t.id)]

export function NavBar({ active, onNavigate }: { active: Screen; onNavigate: (screen: Screen) => void }) {
  const [powerOpen, setPowerOpen] = useState(false)
  // Tabs with nothing to show (no Steam, or no games for a console) are left out.
  const shown = useAvailableTabs()
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

  // Settings sits after the date, power before the time: the bar keeps its room for the tabs.
  return (
    <>
      <DateWeather after={<span className="nav-edge" data-focus-memory="nav">{tab('settings', <GearIcon />, 'Settings', true)}</span>} />
      <nav className="nav">
        <img className="nav-line" src={navLine} alt="" />
        <div className="nav-tabs" data-focus-memory="nav">
          {TABS.filter((t) => shown(t.id)).map((t) => tab(t.id, t.label, t.label))}
        </div>
      </nav>
      <Clock
        before={
          <span className="nav-edge power" data-focus-memory="nav">
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
          </span>
        }
        battery={<BatteryIndicator />}
      />
    </>
  )
}
