import { useEffect, useState, type FocusEvent } from 'react'
import { useTabArrangement } from '../availableTabs'
import navLine from '../assets/nav-line.svg'
import { GearIcon, PowerIcon } from './icons'
import { Clock } from './Clock'
import { BatteryIndicator } from './BatteryIndicator'
import { DateWeather } from './DateWeather'
import { PowerMenu } from './PowerMenu'
import { TAB_LIST } from '../../../shared/tabs'
import { focus } from '../input/focus'

export type Screen = 'home' | 'steam' | 'apps' | 'switch' | 'ps2' | 'psx' | 'psp' | 'ps3' | 'xbox' | 'xbox360' | 'gamecube' | 'wii' | 'wiiu' | 'dreamcast' | 'saturn' | 'n64' | 'arcade' | 'settings'

/** The bar's tabs, in order (Settings and power sit either side of them). */
export const TABS = TAB_LIST as { id: Screen; label: string }[]


/** Whether the last bar had More open, for the next screen's bar to start from. */
let moreWasOpen = false

export function NavBar({ active, onNavigate }: { active: Screen; onNavigate: (screen: Screen) => void }) {
  const [powerOpen, setPowerOpen] = useState(false)
  // Tabs with nothing to show (no Steam, or no games for a console) are left out; the rest
  // sit in the bar or under More, as arranged in Settings → Tabs.
  const arrangement = useTabArrangement()
  const label = (id: Screen): { id: Screen; label: string } => TABS.find((t) => t.id === id) ?? { id, label: id }
  const bar = ['home' as const, ...arrangement.bar].map(label)
  const more = arrangement.more.map(label)
  // On a tab under More, its row stays open to show where you are.
  const inMore = more.some((t) => t.id === active)
  // Each screen has its own bar, so a new one starts as the last was and then opens or
  // closes: stepping onto or off a tab under More (L1/R1) animates the line like A does.
  const [moreOpen, setMoreOpen] = useState(moreWasOpen)
  useEffect(() => {
    // Two frames, so the starting state is drawn before the change.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setMoreOpen(inMore))
    })
    return () => cancelAnimationFrame(frame)
  }, [inMore])
  const open = moreOpen && more.length > 0
  useEffect(() => {
    moreWasOpen = open
  }, [open])

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

  // A on More opens its row and steps into it (onto the tab you're on, if it's there).
  const toggleMore = (): void => {
    if (open) return setMoreOpen(inMore)
    setMoreOpen(true)
    requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>('.nav-more-tab.active') ?? document.querySelector<HTMLElement>('.nav-more-tab')
      if (target) focus(target)
    })
  }

  // Leaving the bar folds More away again (unless you're on one of its tabs).
  const onBlur = (event: FocusEvent<HTMLElement>): void => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setMoreOpen(inMore)
  }

  // Settings and power are pinned to either end of the bar; the tabs are centred between them.
  return (
    <>
      <DateWeather />
      <nav className={`nav${open ? ' more-open' : ''}`} onBlur={onBlur}>
        <img className="nav-line" src={navLine} alt="" />
        {/* The lower line, drawn here so it can drop down to make room for More's row. */}
        <svg className="nav-line-lower" width="1848" height="96" viewBox="0 0 1848 96" fill="none" aria-hidden="true">
          <path stroke="url(#nav-line-lower-paint)" strokeWidth="2" strokeOpacity="0.14" />
          <defs>
            <linearGradient id="nav-line-lower-paint" x1="1846.43" y1="35.29" x2="-0.2" y2="35.29" gradientUnits="userSpaceOnUse">
              <stop stopColor="#BE936F" stopOpacity="0.1" />
              <stop offset="0.5" stopColor="#BE936F" />
              <stop offset="1" stopColor="#BE936F" stopOpacity="0.1" />
            </linearGradient>
          </defs>
        </svg>
        {/* A faint band behind More's row, fading in once the line has dropped. */}
        {more.length > 0 && (
          <svg className="nav-more-band" width="1337" height="67" viewBox="0 0 1337 67" fill="none" aria-hidden="true">
            <path
              d="M47.7676 29.5166C57.632 38.5488 70.5226 43.5586 83.8975 43.5586H1242.09C1252.28 43.5586 1262.26 40.6475 1270.85 35.168L1323.66 1.49219L1336.03 20.8848L1283.22 54.5605C1270.93 62.3958 1256.66 66.5586 1242.09 66.5586H83.8975C64.7726 66.5586 46.3406 59.3947 32.2354 46.4795L0 16.9629L15.5312 0L47.7676 29.5166Z"
              fill="url(#nav-more-band-paint)"
              fillOpacity="0.08"
            />
            <defs>
              <linearGradient id="nav-more-band-paint" x1="1269.41" y1="34" x2="8.2" y2="30.43" gradientUnits="userSpaceOnUse">
                <stop offset="0.0045" stopColor="#BE936F" stopOpacity="0" />
                <stop offset="0.0317" stopColor="#BE936F" />
                <stop offset="0.93" stopColor="#BE936F" />
                <stop offset="0.9624" stopColor="#BE936F" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
        )}
        <div className="nav-tabs" data-focus-memory="nav">
          {tab('settings', <GearIcon />, 'Settings', true)}
          <div className="nav-tab-list">
            {bar.map((t) => tab(t.id, t.label, t.label))}
            {more.length > 0 && (
              <button
                id="nav-more"
                className={`nav-tab display${open ? ' open' : ''}${inMore ? ' active' : ''}`}
                tabIndex={-1}
                aria-label="More"
                aria-expanded={open}
                data-focusable=""
                data-select-sound="move"
                // Down steps into More's row (opening it), as A does.
                data-nav-down=".nav-more-tab"
                onClick={toggleMore}
              >
                More
              </button>
            )}
          </div>
          <span className="nav-power">
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
        </div>
        {/* After the bar's tabs, so a screen with nothing in it starts on Settings, not here. */}
        {more.length > 0 && (
          <div
            className="nav-more-list"
            data-focus-memory="nav-more"
            data-back-focus="#nav-more"
            // Up from anywhere in the row goes back to More, not whatever tab is above.
            data-nav-up="#nav-more"
            aria-hidden={!open}
            onFocus={() => setMoreOpen(true)}
          >
            {more.map((t) => (
              <button
                key={t.id}
                className={`nav-tab nav-more-tab display${t.id === active ? ' active' : ''}`}
                tabIndex={-1}
                aria-label={t.label}
                // Only reachable while the row is open.
                {...(open ? { 'data-focusable': '' } : {})}
                data-select-sound="move"
                onClick={() => onNavigate(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </nav>
      <Clock battery={<BatteryIndicator />} />
    </>
  )
}
