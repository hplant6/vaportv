import { useEffect, useState } from 'react'
import { inMore, useTabArrangement } from '../availableTabs'
import navLine from '../assets/nav-line.svg'
import { GearIcon, PowerIcon } from './icons'
import { ClockCorner } from './ClockCorner'
import { PowerMenu } from './PowerMenu'
import { keepCursorInBar, takeBarCursor } from '../input/focus'
import { MORE_LABEL, TAB_LIST } from '../../../shared/tabs'
import { NOW_PLAYING_BUTTON, NowPlayingRow, useNowPlayingShown } from './NowPlayingRow'

export type Screen = 'home' | 'steam' | 'apps' | 'media' | 'music' | 'switch' | 'ps2' | 'psx' | 'psp' | 'ps3' | 'xbox' | 'xbox360' | 'gamecube' | 'wii' | 'wiiu' | 'dreamcast' | 'saturn' | 'n64' | 'nes' | 'snes' | 'genesis' | 'sega32x' | 'neogeo' | 'arcade' | 'more' | 'settings'

/** Opens a screen by name (detail: the Screen): the Apps tab's Music tile opens the Music tab. App listens. */
export const OPEN_SCREEN_EVENT = 'steamtv:open-screen'

/** The bar's tabs, in order (Settings and power sit either side of them). */
export const TABS = TAB_LIST as { id: Screen; label: string }[]


/** Whether the last bar had its second row open, for the next screen's bar to start from. */
let rowWasOpen = false

/** Down from the bar (a tab, Settings or power) goes to the second row's button nearest it. */
const INTO_SECOND_ROW = `nearest:.${NOW_PLAYING_BUTTON}`

export function NavBar({ active, onNavigate }: { active: Screen; onNavigate: (screen: Screen) => void }) {
  const [powerOpen, setPowerOpen] = useState(false)
  // Tabs with nothing to show (no Steam, or no games for a console) are left out; the rest
  // sit in the bar or More, as arranged in Settings → Tabs. More's tab comes last, once
  // anything's in it, and is the one lit while you're on one of its tabs.
  const arrangement = useTabArrangement()
  const label = (id: Screen): { id: Screen; label: string } => TABS.find((t) => t.id === id) ?? { id, label: id }
  const bar = ['home' as const, ...arrangement.bar].map(label)
  if (arrangement.more.length) bar.push({ id: 'more', label: MORE_LABEL })
  const lit: Screen = inMore(active) ? 'more' : active
  // The second row opens while music plays. Each screen has its own bar, so a new one starts
  // as the last was, then opens or closes (animating the line, as when a song starts).
  const shown = useNowPlayingShown()
  const [open, setOpen] = useState(rowWasOpen)
  useEffect(() => {
    // Two frames, so the starting state is drawn before the change.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setOpen(shown))
    })
    return () => cancelAnimationFrame(frame)
  }, [shown])
  useEffect(() => {
    rowWasOpen = open
  }, [open])
  // Picked from the bar, a screen keeps the cursor on its tab (before the screen's own default focus runs).
  useEffect(takeBarCursor, [])
  const pick = (id: Screen): void => {
    keepCursorInBar()
    onNavigate(id)
  }

  // With the second row up, Down from the bar steps into it.
  const down = shown ? { 'data-nav-down': INTO_SECOND_ROW } : {}

  const tab = (id: Screen, content: React.ReactNode, label: string, icon = false) => (
    <button
      key={id}
      className={`nav-tab display${icon ? ' nav-icon-tab' : ''}${id === lit ? ' active' : ''}`}
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

  // Settings and power are pinned to either end of the bar; the tabs are centred between them.
  return (
    <>
      <ClockCorner side="left" />
      {/* Up from the second row goes to the tab above it. */}
      <nav className={`nav${open ? ' more-open' : ''}`} data-focus-direct="">
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
        {/* After the bar's tabs, so a screen with nothing in it starts on Settings, not here.
            B from it goes up to the bar's tab you're on. */}
        <div className="nav-more-list" data-focus-memory="nav-more" data-back-focus=".nav-tab-list .nav-tab.active" aria-hidden={!open}>
          <NowPlayingRow />
        </div>
      </nav>
      <ClockCorner side="right" />
    </>
  )
}
