import type { HomeData } from '../../../shared/types'
import { AppTile } from '../components/AppTile'
import { Clock } from '../components/Clock'
import { DateWeather } from '../components/DateWeather'
import { NavBar, type Screen } from '../components/NavBar'
import { usePageScroll } from './usePageScroll'

/** The Apps tab: every app tile, laid out like Home's Favorite Apps. */
export function Apps({ apps, onNavigate }: { apps: HomeData['apps']; onNavigate: (screen: Screen) => void }) {
  const scroll = usePageScroll()
  return (
    <div className="page" {...scroll}>
      <DateWeather />
      <NavBar active="apps" onNavigate={onNavigate} />
      <Clock />

      <section className="favorites no-recents">
        <h2 className="section-label display">Apps ({apps.length})</h2>
        <div className="favorites-grid" data-focus-memory="apps">
          {apps.map((app, index) => (
            <AppTile key={app.id} app={app} isDefault={index === 0} />
          ))}
        </div>
      </section>
    </div>
  )
}
