import type { HomeData } from '../../../shared/types'
import { AppRow } from '../components/AppRow'
import { AppTile } from '../components/AppTile'
import { CardRow } from '../components/CardRow'
import { CollectionGrid } from '../components/CollectionGrid'
import { NavBar, type Screen } from '../components/NavBar'
import { usePageScroll } from './usePageScroll'

export function Home({ data, onNavigate }: { data: HomeData; onNavigate: (screen: Screen) => void }) {
  const scroll = usePageScroll()

  return (
    <div className="page" {...scroll}>
      <NavBar active="home" onNavigate={onNavigate} />

      {data.recentsLayout === 'grid' && data.recents.length > 0 ? (
        // Grid: Recents grows downward, so Favorite Apps follows it down the page.
        <div className="home-flow">
          <CollectionGrid title="Recents" items={data.recents} memoryKey="recents" hasDefault />
          <FavoriteApps data={data} variant="flow" />
        </div>
      ) : (
        <>
          {data.recents.length > 0 && (
            <CardRow
              className="recents"
              title="Recents"
              items={data.recents}
              logos={data.platformLogos}
              memoryKey="recents"
              hasDefault
            />
          )}
          <FavoriteApps data={data} variant={data.recents.length ? undefined : 'no-recents'} />
        </>
      )}
    </div>
  )
}

function FavoriteApps({ data, variant }: { data: HomeData; variant?: 'no-recents' | 'flow' }) {
  return (
    <section className={`favorites${variant ? ` ${variant}` : ''}`}>
      <h2 className="section-label display">Favorite Apps</h2>
      {data.apps.length === 0 ? (
        <p className="empty-note">Press Y on an app in the Apps tab to add it here.</p>
      ) : data.favoritesLayout === 'grid' ? (
        <div className="favorites-grid">
          {data.apps.map((app, index) => (
            <AppTile key={app.id} app={app} isDefault={variant === 'no-recents' && index === 0} />
          ))}
        </div>
      ) : (
        <AppRow apps={data.apps} hasDefault={variant === 'no-recents'} />
      )}
    </section>
  )
}
