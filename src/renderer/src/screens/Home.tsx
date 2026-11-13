import type { HomeData } from '../../../shared/types'
import { AppRow } from '../components/AppRow'
import { AppTile } from '../components/AppTile'
import { CardRow } from '../components/CardRow'
import { CollectionGrid } from '../components/CollectionGrid'
import { ContinueWatching } from '../components/ContinueWatching'
import { NavBar, type Screen } from '../components/NavBar'
import { usePageScroll } from './usePageScroll'

export function Home({ data, onNavigate }: { data: HomeData; onNavigate: (screen: Screen) => void }) {
  const scroll = usePageScroll()

  return (
    <div className="page">
      <NavBar active="home" onNavigate={onNavigate} />
      <div className="page-viewport">
        <div className="page-scroll" {...scroll}>
          {data.recentsLayout === 'grid' && data.recents.length > 0 ? (
            // Grid: Recents grows downward, so Favorite Apps follows it down the page.
            <div className="home-flow">
              <CollectionGrid title="Recents" items={data.recents} logos={data.platformLogos} memoryKey="recents" hasDefault />
              <FavoriteApps data={data} variant="flow" />
              <ContinueWatching />
              <Playlists data={data} />
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
              {/* Favorite Apps keeps its place in the Figma frame; playlist rows follow it down the page. */}
              <div className={`home-lower${data.recents.length ? '' : ' no-recents'}`}>
                <FavoriteApps data={data} variant={data.recents.length ? undefined : 'no-recents'} />
                <ContinueWatching />
                <Playlists data={data} />
              </div>
            </>
          )}
        </div>
      </div>
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

/** Your game playlists, a row each, in the order set in Settings → Home. */
function Playlists({ data }: { data: HomeData }) {
  return data.playlists.map((playlist) => (
    <CardRow
      key={playlist.id}
      className="playlist-row"
      title={playlist.name}
      items={playlist.items}
      logos={data.platformLogos}
      memoryKey={`playlist-${playlist.id}`}
      hasDefault={false}
    />
  ))
}
