import { useEffect, useState } from 'react'
import { useTabArrangement } from '../availableTabs'
import { ConsoleSpin, useConsoleStill, useSpinningConsoles } from '../background/ConsoleSpin'
import { PRODUCTS } from '../background/products'
import { NavBar, TABS, type Screen } from '../components/NavBar'
import { LOGOS } from '../components/SideBar'
import { usePageScroll } from './usePageScroll'

/** The More tab you last opened: back on More, the cursor starts on it. */
let lastPicked: Screen | null = null

/** Remembers a tab opened from More (App sends B from it back here, onto it). */
export function pickedFromMore(screen: Screen): void {
  lastPicked = screen
}

/** The cursor must rest on a tile this long before its console starts turning (passing over them doesn't load each one). */
const SPIN_AFTER_MS = 350
/** One turn every this many seconds: brisker than the left bar's, as it's only while the tile's picked. */
const TURN_SECONDS = 8

/**
 * One of More's tiles: the tab's logo (or name, for those without one: Apps, Video, Music) over
 * its console, a picture of it standing as it first stands in the turning view. Under the
 * cursor, the console turns, as in the console tab's left bar.
 */
function MoreTile({ id, label, isDefault, onOpen }: { id: Screen; label: string; isDefault: boolean; onOpen: () => void }) {
  const logo = LOGOS[id]
  const hasModel = !!PRODUCTS[id]
  const still = useConsoleStill(id)
  const spinning = useSpinningConsoles()
  const [focused, setFocused] = useState(false)
  const [turning, setTurning] = useState(false)
  // The turning view has drawn its first frame: the picture under it goes.
  const [drawn, setDrawn] = useState(false)
  useEffect(() => {
    setDrawn(false)
    if (!focused || !hasModel || !spinning) return setTurning(false)
    const timer = setTimeout(() => setTurning(true), SPIN_AFTER_MS)
    return () => clearTimeout(timer)
  }, [focused, hasModel, spinning])
  return (
    <button
      className={`app-tile more-tile${hasModel ? ' has-model' : ''}`}
      tabIndex={-1}
      data-focusable=""
      {...(isDefault ? { 'data-focus-default': '' } : {})}
      data-more-tab={id}
      aria-label={label}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onClick={onOpen}
    >
      <span className="more-tile-head">{logo ? <img className="more-tile-logo" src={logo} alt="" /> : <span className="more-tile-name display">{label}</span>}</span>
      {hasModel && (
        <span className="more-tile-console">
          {still && <img className={`more-tile-still${turning && drawn ? ' hidden' : ''}`} src={still} alt="" />}
          {turning && <ConsoleSpin tab={id} className="more-tile-spin" turnSeconds={TURN_SECONDS} onReady={() => setDrawn(true)} />}
        </span>
      )}
    </button>
  )
}

/**
 * The More tab: every tab that isn't in the bar, as a grid of tiles (any number of them;
 * Settings → Tabs chooses which go here). A opens one; B from there comes back here.
 */
export function More({ onNavigate }: { onNavigate: (screen: Screen) => void }) {
  const scroll = usePageScroll()
  const { more } = useTabArrangement()
  const tabs = more.map((id) => TABS.find((t) => t.id === id) ?? { id: id as Screen, label: id })
  const start = tabs.some((t) => t.id === lastPicked) ? lastPicked : tabs[0]?.id
  const open = (id: Screen): void => {
    pickedFromMore(id)
    onNavigate(id)
  }
  return (
    <div className="page">
      <NavBar active="more" onNavigate={onNavigate} />
      <div className="page-viewport">
        <div className="page-scroll" {...scroll}>
          <section className="favorites no-recents">
            <h2 className="section-label display">More ({tabs.length})</h2>
            <div className="favorites-grid" data-focus-memory="more">
              {tabs.map((t) => (
                <MoreTile key={t.id} id={t.id} label={t.label} isDefault={t.id === start} onOpen={() => open(t.id)} />
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
