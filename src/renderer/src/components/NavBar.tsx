import { useEffect, useState, type FocusEvent } from 'react'
import { useTabArrangement } from '../availableTabs'
import navLine from '../assets/nav-line.svg'
import { GearIcon, PowerIcon } from './icons'
import { ClockCorner } from './ClockCorner'
import { PowerMenu } from './PowerMenu'
import { keepCursorInBar, takeBarCursor } from '../input/focus'
import { TAB_LIST } from '../../../shared/tabs'

export type Screen = 'home' | 'steam' | 'apps' | 'switch' | 'ps2' | 'psx' | 'psp' | 'ps3' | 'xbox' | 'xbox360' | 'gamecube' | 'wii' | 'wiiu' | 'dreamcast' | 'saturn' | 'n64' | 'nes' | 'snes' | 'genesis' | 'sega32x' | 'neogeo' | 'arcade' | 'settings'

/** The bar's tabs, in order (Settings and power sit either side of them). */
export const TABS = TAB_LIST as { id: Screen; label: string }[]


/** Whether the last bar had its second row open, for the next screen's bar to start from. */
let moreWasOpen = false

/** Down from the bar (a tab, Settings or power) opens the second row on the tab under it. */
const INTO_SECOND_ROW = 'nearest:.nav-more-tab'

export function NavBar({ active, onNavigate }: { active: Screen; onNavigate: (screen: Screen) => void }) {
  const [powerOpen, setPowerOpen] = useState(false)
  // Tabs with nothing to show (no Steam, or no games for a console) are left out; the rest
  // sit in the bar or its second row, as arranged in Settings → Tabs.
  const arrangement = useTabArrangement()
  const label = (id: Screen): { id: Screen; label: string } => TABS.find((t) => t.id === id) ?? { id, label: id }
  const bar = ['home' as const, ...arrangement.bar].map(label)
  const more = arrangement.more.map(label)
  // On a tab in the second row, it stays open to show where you are.
  const inMore = more.some((t) => t.id === active)
  // Each screen has its own bar, so a new one starts as the last was and then opens or
  // closes: stepping onto or off a tab in the second row (L1/R1) animates the line as Down does.
  const [moreOpen, setMoreOpen] = useState(moreWasOpen)
  useEffect(() => {
    // Two frames, so the starting state is drawn before the change.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setMoreOpen(inMore))
    })
    return () => cancelAnimationFrame(frame)
  }, [inMore])
  const open = moreOpen && more.length > 0
  // Picked from the bar, a screen keeps the cursor on its tab (before the screen's own default focus runs).
  useEffect(takeBarCursor, [])
  const pick = (id: Screen): void => {
    keepCursorInBar()
    onNavigate(id)
  }
  useEffect(() => {
    moreWasOpen = open
  }, [open])

  // With a second row, Down from the bar steps into it (focusing it opens it).
  const down = more.length > 0 ? { 'data-nav-down': INTO_SECOND_ROW } : {}

  const tab = (id: Screen, content: React.ReactNode, label: string, icon = false) => (
    <button
      key={id}
      className={`nav-tab display${icon ? ' nav-icon-tab' : ''}${id === active ? ' active' : ''}`}
      tabIndex={-1}
      aria-label={label}
      data-focusable=""
      data-select-sound="move"
      {...down}
      onClick={() => pick(id)}
    >
      {content}
    </button>
  )

  // Leaving the bar folds the second row away again (unless you're on one of its tabs).
  const onBlur = (event: FocusEvent<HTMLElement>): void => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setMoreOpen(inMore)
  }

  // Settings and power are pinned to either end of the bar; the tabs are centred between them.
  return (
    <>
      <ClockCorner side="left" />
      {/* Up from the second row goes to the tab above, and down from a tab to the one below it. */}
      <nav className={`nav${open ? ' more-open' : ''}`} onBlur={onBlur} data-focus-direct="">
        <img className="nav-line" src={navLine} alt="" />
        {/* The lower line, drawn here so it can drop down to make room for the second row. */}
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
        {/* A faint band behind the second row, fading in once the line has dropped. */}
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
              {...down}
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
            // B goes up to the bar's tab you're on (or, from a tab in this row, Home).
            data-back-focus=".nav-tab-list .nav-tab.active"
            aria-hidden={!open}
            onFocus={() => setMoreOpen(true)}
          >
            {more.map((t) => (
              <button
                key={t.id}
                className={`nav-tab nav-more-tab display${t.id === active ? ' active' : ''}`}
                tabIndex={-1}
                aria-label={t.label}
                // Always reachable, open or not: it's under the bar, so Down from the bar or Up from the page comes here
                // first, and focusing it opens the row.
                data-focusable=""
                data-select-sound="move"
                onClick={() => pick(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </nav>
      <ClockCorner side="right" />
    </>
  )
}
