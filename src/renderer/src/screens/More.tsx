import { useTabArrangement } from '../availableTabs'
import { NavBar, TABS, type Screen } from '../components/NavBar'
import { usePageScroll } from './usePageScroll'

/** The More tab you last opened: back on More, the cursor starts on it. */
let lastPicked: Screen | null = null

/** Remembers a tab opened from More (App sends B from it back here, onto it). */
export function pickedFromMore(screen: Screen): void {
  lastPicked = screen
}

/**
 * The More tab: every tab that isn't in the bar, as a grid of tiles (any number of them;
 * Settings → Tabs chooses which go here). A opens one; B from there comes back here.
 */
export function More({ logos, onNavigate }: { logos: Record<string, string>; onNavigate: (screen: Screen) => void }) {
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
                <button
                  key={t.id}
                  className="app-tile more-tile"
                  tabIndex={-1}
                  data-focusable=""
                  {...(t.id === start ? { 'data-focus-default': '' } : {})}
                  data-more-tab={t.id}
                  aria-label={t.label}
                  onClick={() => open(t.id)}
                >
                  <span className="app-tile-name more-tile-name display">{t.label}</span>
                  {logos[t.id] && <img className="more-tile-logo" src={logos[t.id]} alt="" />}
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
