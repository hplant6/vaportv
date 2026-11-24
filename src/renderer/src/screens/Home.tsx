import { useState } from 'react'
import type { HomeData, RecentItem } from '../../../shared/types'
import { isGrid } from '../../../shared/tabSections'
import { AppRow } from '../components/AppRow'
import { AppTile } from '../components/AppTile'
import { CardRow } from '../components/CardRow'
import { CollectionGrid, PosterGrid } from '../components/CollectionGrid'
import { SpotlightSection } from '../components/Spotlight'
import { ContinueWatching } from '../components/ContinueWatching'
import { MusicRow } from '../components/MusicRow'
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
              <MusicRow />
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
                <MusicRow />
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

/**
 * Your playlists switched on for Home, in the order set in Settings → Home, each in its style
 * there (as a tab's sections: Spotlight, Carousel, or a grid, which goes last).
 */
function Playlists({ data }: { data: HomeData }) {
  // What the cursor's on (or was last on) in a Spotlight, and which playlist.
  const [spot, setSpot] = useState<{ playlist: string; item: RecentItem } | null>(null)
  const ordered = [...data.playlists.filter((p) => !isGrid(p.homeStyle)), ...data.playlists.filter((p) => isGrid(p.homeStyle))]
  return ordered.map((playlist) => {
    const shared = { title: playlist.name, items: playlist.items, logos: data.platformLogos, memoryKey: `playlist-${playlist.id}`, hasDefault: false }
    return (
      <div key={playlist.id} className={`home-playlist ${playlist.homeStyle}`}>
        {playlist.homeStyle === 'spotlight' ? (
          <SpotlightSection
            id={`home-playlist-${playlist.id}`}
            {...shared}
            first={false}
            onFocusItem={(item) => setSpot({ playlist: playlist.id, item })}
            focused={spot?.playlist === playlist.id ? spot.item : null}
          />
        ) : playlist.homeStyle === 'wide' ? (
          <CollectionGrid {...shared} />
        ) : playlist.homeStyle === 'posters' ? (
          <PosterGrid {...shared} />
        ) : (
          <CardRow className="playlist-row" {...shared} />
        )}
      </div>
    )
  })
}
