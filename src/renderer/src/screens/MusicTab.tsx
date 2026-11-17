import { useEffect, useMemo, useRef, useState } from 'react'
import type { MusicAlbum, MusicIndexStatus, MusicPlace, MusicPlaylist, MusicTags } from '../../../shared/types'
import { MUSIC_EVENT, openMusicAt } from '../components/MusicApp'
import { NavBar, type Screen } from '../components/NavBar'
import { SideBar, sideListId, type SideList } from '../components/SideBar'
import { focus, focusContentDefault, GRAB_CANCEL_EVENT, GRAB_MOVE_EVENT, trap, TRAP_CLOSE_EVENT, type Direction } from '../input/focus'
import { playNow, toggleFavoriteAlbum, useMusicFavorites } from '../music/favorites'
import { newPlaylist, pickPlaylist, reloadPlaylists, useMusicPlaylists } from '../music/playlists'
import { MusicSources } from '../music/MusicSources'
import { setBackground, useBackgroundChoice } from '../music/background'
import { turnItUp, useBackgroundSong } from '../music/backgroundSong'
import { usePlayerNow } from '../music/usePlayerNow'
import { BG_ALBUM, BG_LIKED } from '../../../shared/backgroundMusic'
import { PLAYLIST_SONG_EVENT } from '../music/SongMenu'
import { OnScreenKeyboard } from '../components/Keyboard'
import { toast } from '../components/Toast'
import { remember, remembered, SideGrid, useSideBarOpen } from './sideLayout'

// The Music tab: the console tabs' left bar and grid, filled from the music index
// (musicIndex.ts: every song's tags, across ~/Music, drives and shares). The bar turns Henry's
// turntable; its lists are Recently played, Favorites (Liked songs, then albums), Playlists,
// Albums, Artists and Folders; Genre (a drop-down under Sort) narrows the albums and artists, and
// Folders (the places, opening the folder browser). A on an album opens its page (Play all,
// Shuffle, its songs), which plays straight from the index; playing opens Now playing. Voice
// search here (R3, a remote's Menu) asks Claude for music.

const SCREEN = 'music'

type MusicSort = 'played' | 'recent' | 'name' | 'artist' | 'year'
export const MUSIC_SORTS: { id: MusicSort; name: string }[] = [
  { id: 'played', name: 'Recently played' },
  { id: 'recent', name: 'Recently added' },
  { id: 'name', name: 'Alphabetical' },
  { id: 'artist', name: 'Artist' },
  { id: 'year', name: 'Release year' }
]

/** When each album was last played on this TV (album id → ms). Losing it just means Recently played starts again. */
const PLAYED_STORE = 'vaportv.musicPlayedAlbums'
const PLAYED_KEPT = 500
/** Genre's "all" choice. */
const ALL_GENRES = 'all'

function playedAlbums(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(PLAYED_STORE) ?? '{}') as Record<string, number>
  } catch {
    return {}
  }
}

function markAlbumPlayed(id: string): Record<string, number> {
  const all = { ...playedAlbums(), [id]: Date.now() }
  const kept = Object.fromEntries(Object.entries(all).sort((a, b) => b[1] - a[1]).slice(0, PLAYED_KEPT))
  try {
    localStorage.setItem(PLAYED_STORE, JSON.stringify(kept))
  } catch {
    // Not kept.
  }
  return kept
}

const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
const byTitle = (a: MusicAlbum, b: MusicAlbum): number => byName.compare(a.title, b.title) || byName.compare(a.artist ?? '', b.artist ?? '')

function sorter(sort: MusicSort, played: Record<string, number>): (a: MusicAlbum, b: MusicAlbum) => number {
  switch (sort) {
    case 'played':
      // Never played: after the played ones, newest in first.
      return (a, b) => (played[b.id] ?? 0) - (played[a.id] ?? 0) || b.added - a.added
    case 'recent':
      return (a, b) => b.added - a.added
    case 'name':
      return byTitle
    case 'artist':
      return (a, b) => byName.compare(a.artist ?? '', b.artist ?? '') || (a.year ?? 0) - (b.year ?? 0) || byTitle(a, b)
    case 'year':
      // No year: at the end.
      return (a, b) => (b.year ?? -Infinity) - (a.year ?? -Infinity) || byTitle(a, b)
  }
}

/** "City pop" and "City Pop" are one genre, shown as most albums spell it. */
const genreKey = (genre: string): string => genre.trim().toLowerCase()

interface Artist {
  name: string
  albums: MusicAlbum[]
}

/** An item in the grid: an album, an artist, or a place (Folders). */
type Card = { kind: 'album'; album: MusicAlbum } | { kind: 'artist'; artist: Artist } | { kind: 'place'; place: MusicPlace } | { kind: 'liked'; songs: MusicTags[] } | { kind: 'playlist'; playlist: MusicPlaylist } | { kind: 'add' }

interface MusicList extends SideList<Card> {}

export function MusicTab({ onNavigate }: { onNavigate: (screen: Screen) => void }) {
  const open = useSideBarOpen(SCREEN)
  const [albums, setAlbums] = useState<MusicAlbum[] | null>(null)
  const [places, setPlaces] = useState<MusicPlace[]>([])
  const [status, setStatus] = useState<MusicIndexStatus | null>(null)
  const [played, setPlayed] = useState(playedAlbums)
  const [selected, setSelected] = useState(() => remembered().lists[SCREEN] ?? 'recent-played')
  const [sort, setSort] = useState<MusicSort>(() => (remembered().sorts[SCREEN] as MusicSort | undefined) ?? 'played')
  // Genre: kept with the bar's other choices, as "genre:<key>".
  const [genre, setGenre] = useState(() => remembered().filters[SCREEN]?.find((f) => f.startsWith('genre:'))?.slice('genre:'.length) ?? ALL_GENRES)
  const [album, setAlbum] = useState<{ album: MusicAlbum; from: HTMLElement | null } | null>(null)
  const [artist, setArtist] = useState<{ artist: Artist; from: HTMLElement | null } | null>(null)
  const [likedOpen, setLikedOpen] = useState<HTMLElement | null>(null)
  const [playlistOpen, setPlaylistOpen] = useState<{ id: string; from: HTMLElement | null } | null>(null)
  const favorites = useMusicFavorites()
  const playlists = useMusicPlaylists()

  // The albums, and again as the index's scan reads more (not more than every few seconds).
  useEffect(() => {
    let live = true
    let timer: ReturnType<typeof setTimeout> | null = null
    const load = (): void => {
      window.steamtv.music
        .albums()
        .then((got) => live && setAlbums(got))
        .catch(() => live && setAlbums([]))
    }
    // Opening the tab starts a scan if it's due (and lists the places for Folders).
    window.steamtv.music
      .places()
      .then((got) => live && setPlaces(got))
      .catch(() => undefined)
    load()
    window.steamtv.music.indexStatus().then((s) => live && setStatus(s))
    const off = window.steamtv.music.onIndex((s) => {
      setStatus(s)
      if (!timer) timer = setTimeout(() => ((timer = null), load()), s.scanning ? 4000 : 0)
    })
    // Playlists may have changed elsewhere (Claude made one, a station was saved).
    void reloadPlaylists()
    // A remote's Menu searches music while the tab's up.
    window.steamtv.music.setOpen(true)
    return () => {
      live = false
      off()
      if (timer) clearTimeout(timer)
      window.steamtv.music.setOpen(false)
    }
  }, [])

  // Voice search here: the Music screen opens to show what's heard and Claude's answer.
  useEffect(
    () =>
      window.steamtv.onVoice((state, purpose) => {
        if (purpose === 'music' && state.phase === 'starting' && !document.querySelector('.music-app')) {
          window.dispatchEvent(new CustomEvent(MUSIC_EVENT, { detail: document.activeElement }))
        }
      }),
    []
  )

  const loaded = albums !== null
  useEffect(() => {
    if (loaded) focusContentDefault()
  }, [loaded])

  const order = useMemo(() => sorter(sort, played), [sort, played])
  // Genres, the biggest first ("City pop" and "City Pop" as one); the albums in the one chosen.
  const genres = useMemo(() => {
    const byGenre = new Map<string, { names: Map<string, number>; count: number }>()
    for (const a of albums ?? []) {
      if (!a.genre) continue
      const g = byGenre.get(genreKey(a.genre)) ?? { names: new Map<string, number>(), count: 0 }
      g.names.set(a.genre, (g.names.get(a.genre) ?? 0) + 1)
      g.count++
      byGenre.set(genreKey(a.genre), g)
    }
    return [...byGenre.entries()]
      .map(([key, g]) => ({ key, name: [...g.names].sort((x, y) => y[1] - x[1])[0][0], count: g.count }))
      .sort((a, b) => b.count - a.count || byName.compare(a.name, b.name))
  }, [albums])
  const genreOn = genre !== ALL_GENRES && genres.some((g) => g.key === genre)
  const genreName = genres.find((g) => g.key === genre)?.name
  const shown = useMemo(() => (genreOn ? (albums ?? []).filter((a) => a.genre && genreKey(a.genre) === genre) : (albums ?? [])), [albums, genre, genreOn])
  const artists = useMemo(() => {
    const byArtist = new Map<string, Artist>()
    for (const a of shown) {
      const name = a.artist ?? 'Unknown artist'
      const key = name.toLowerCase()
      const found = byArtist.get(key)
      if (found) found.albums.push(a)
      else byArtist.set(key, { name, albums: [a] })
    }
    return [...byArtist.values()].sort((a, b) => byName.compare(a.name, b.name))
  }, [shown])

  const scanning = status?.scanning ?? false
  const reading = scanning && status && status.toRead > 0 ? `Reading your music: ${status.read.toLocaleString()} of ${status.toRead.toLocaleString()} new songs…` : ''
  const noneYet = scanning ? 'Reading your music for the first time… albums appear as it goes.' : 'No music found yet: put songs in ~/Music, plug in a drive, or add a network share.'
  const asAlbums = (list: MusicAlbum[]): Card[] => list.map((a) => ({ kind: 'album', album: a }))
  const inGenre = genreOn ? `No ${genreName} here yet.` : ''
  const all: MusicList[] = [
    {
      id: 'recent-played',
      name: 'Recently played',
      items: asAlbums(shown.filter((a) => played[a.id]).sort((a, b) => played[b.id] - played[a.id])),
      empty: inGenre || (albums?.length ? 'Albums you play show up here.' : noneYet)
    },
    {
      id: 'favorites',
      name: 'Favorites',
      // Liked songs first (one tile), then the favorite albums, newest first (in the genre chosen).
      items: [
        ...(favorites.songs.length ? [{ kind: 'liked' as const, songs: favorites.songs }] : []),
        ...asAlbums(favorites.albums.filter((a) => !genreOn || (a.genre && genreKey(a.genre) === genre)))
      ],
      empty: 'Press Y on an album to make it a favorite, or on a song (or in Now playing) to like it.'
    },
    {
      id: 'playlists',
      name: 'Playlists',
      items: playlists.map((p) => ({ kind: 'playlist' as const, playlist: p })),
      empty: 'Save a radio station (its list in Now playing), add songs from their menus, or ask Claude: “make me a playlist of rainy-day jazz”.'
    },
    {
      id: 'albums',
      name: 'Albums',
      // Only the included albums so far: a card at the end to add your own.
      items: [...asAlbums([...shown].sort(order)), ...((albums ?? []).every((a) => a.included) ? [{ kind: 'add' as const }] : [])],
      empty: inGenre || noneYet
    },
    { id: 'artists', name: 'Artists', items: artists.map((a) => ({ kind: 'artist', artist: a })), empty: inGenre || noneYet },
    {
      id: 'folders',
      name: 'Folders',
      items: places.map((p) => ({ kind: 'place', place: p })),
      empty: 'No music folders yet.',
      section: 'Browse'
    },
    // Music sources: the same screen as Settings → Music's.
    { id: 'sources', name: '＋ Add music', items: [], empty: '', noCount: true }
  ]
  const current = all.find((l) => l.id === selected) ?? all[0]
  const select = (id: string): void => {
    if (id === selected) return
    setSelected(id)
    remember((saved) => {
      saved.lists[SCREEN] = id
    })
  }
  const title = current.id === 'sources' ? 'Add music' : `${open ? '' : 'Music · '}${current.name}${genreOn && current.id !== 'folders' ? ` · ${genreName}` : ''} (${current.items.length.toLocaleString()})`

  const playAlbum = (a: MusicAlbum, from: HTMLElement | null, at = 0, shuffle = false): void => {
    setPlayed(markAlbumPlayed(a.id))
    window.steamtv.music.albumSongs(a.id).then((songs) => playNow(songs, from, at, shuffle))
  }

  const openCard = (card: Card, el: HTMLElement): void => {
    if (card.kind === 'add') {
      select('sources')
      setTimeout(() => {
        const first = document.querySelector<HTMLElement>('.side-grid .music-sources [data-focusable]')
        if (first) focus(first)
      })
    } else if (card.kind === 'liked') setLikedOpen(el)
    else if (card.kind === 'playlist') setPlaylistOpen({ id: card.playlist.id, from: el })
    else if (card.kind === 'album') setAlbum({ album: card.album, from: el })
    else if (card.kind === 'artist') setArtist({ artist: card.artist, from: el })
    else {
      openMusicAt(card.place)
      window.dispatchEvent(new CustomEvent(MUSIC_EVENT, { detail: el }))
    }
  }

  return (
    <div className={`page side-layout music-tab${open ? '' : ' closed'}`}>
      <NavBar active="music" onNavigate={onNavigate} />
      <SideBar
        tab={SCREEN}
        title="Music"
        lists={all}
        selected={current.id}
        open={open}
        sort={sort}
        sorts={MUSIC_SORTS}
        onSort={(next) => {
          setSort(next as MusicSort)
          remember((saved) => {
            saved.sorts[SCREEN] = next
          })
        }}
        menus={[
          {
            id: 'genre',
            label: 'Genre',
            value: genreOn ? genre : ALL_GENRES,
            options: [{ id: ALL_GENRES, name: 'All' }, ...genres.map((g) => ({ id: g.key, name: `${g.name} (${g.count})` }))],
            onPick: (next) => {
              setGenre(next)
              remember((saved) => {
                saved.filters[SCREEN] = next === ALL_GENRES ? [] : [`genre:${next}`]
              })
            }
          }
        ]}
        onSelect={select}
      />
      <div className="page-viewport">
        <SideGrid key={current.id} backTo={open ? `#${sideListId(current.id)}` : undefined}>
          <section className="collection-grid">
            <h2 className="section-label display">{title}</h2>
            <BackgroundStrip />
            {reading && <p className="music-tab-reading">{reading}</p>}
            {current.id === 'sources' ? (
              <MusicSources />
            ) : !loaded ? (
              <p className="empty-note">Looking for your music…</p>
            ) : current.items.length === 0 ? (
              <p className="empty-note">{current.empty}</p>
            ) : (
              <CardGrid cards={current.items} memory={`music:${current.id}:${sort}`} favorites={favorites.albumIds} onOpen={openCard} />
            )}
          </section>
        </SideGrid>
      </div>
      {artist && (
        <ArtistPage
          artist={artist.artist}
          order={order}
          onOpen={(a, el) => setAlbum({ album: a, from: el })}
          onBack={() => {
            const from = artist.from
            setArtist(null)
            if (from?.isConnected) setTimeout(() => focus(from))
          }}
        />
      )}
      {likedOpen && (
        <SongsPage
          title="Liked songs"
          facts={`${favorites.songs.length} ${favorites.songs.length === 1 ? 'song' : 'songs'} · newest first`}
          cover={<Mosaic songs={favorites.songs} className="music-page-cover" />}
          songs={favorites.songs}
          liked={favorites.liked}
          showArtist
          extra={<BackgroundButton choice={BG_LIKED} name="Liked songs" />}
          onPlay={(at, shuffle, el) => playNow(favorites.songs, el, at, shuffle)}
          onBack={() => {
            const from = likedOpen
            setLikedOpen(null)
            if (from?.isConnected) setTimeout(() => focus(from))
          }}
        />
      )}
      {playlistOpen && (
        <PlaylistPage
          id={playlistOpen.id}
          onBack={() => {
            const from = playlistOpen.from
            setPlaylistOpen(null)
            if (from?.isConnected) setTimeout(() => focus(from))
          }}
        />
      )}
      {album && (
        <AlbumPage
          album={album.album}
          onPlay={(at, shuffle, el) => playAlbum(album.album, el, at, shuffle)}
          onBack={() => {
            const from = album.from
            setAlbum(null)
            if (from?.isConnected) setTimeout(() => focus(from))
          }}
        />
      )}
    </div>
  )
}

/** Square covers, as many across as fit; their names under them. */
function CardGrid({ cards, memory, favorites, onOpen }: { cards: Card[]; memory: string; favorites?: Set<string>; onOpen: (card: Card, el: HTMLElement) => void }) {
  return (
    <div className="album-grid" data-focus-memory={memory}>
      {cards.map((card, index) => {
        if (card.kind === 'add') {
          return (
            <button key="add" className="recent-card album-card add-music-card" tabIndex={-1} data-focusable="" data-select-sound="move" data-index={index} aria-label="Add your music" onClick={(event) => onOpen(card, event.currentTarget)}>
              <div className="recent-art">
                <span className="recent-no-art display">
                  <span className="add-music-plus" aria-hidden="true">
                    ＋
                  </span>
                </span>
              </div>
              <div className="recent-footer">
                <div className="recent-text">
                  <div className="recent-title">Add your music</div>
                  <div className="recent-date">From a drive, a share, or this TV</div>
                </div>
              </div>
            </button>
          )
        }
        if (card.kind === 'liked' || card.kind === 'playlist') {
          const songs = card.kind === 'liked' ? card.songs : card.playlist.songs
          const name = card.kind === 'liked' ? 'Liked songs' : card.playlist.name
          return (
            <button
              key={card.kind === 'liked' ? 'liked' : card.playlist.id}
              className={`recent-card album-card liked-card${card.kind === 'playlist' ? ' playlist-card' : ''}`}
              tabIndex={-1}
              data-focusable=""
              data-select-sound="move"
              data-index={index}
              {...(index === 0 ? { 'data-focus-default': '' } : {})}
              aria-label={`${name}, ${songs.length} songs`}
              onClick={(event) => onOpen(card, event.currentTarget)}
            >
              <div className="recent-art">
                <Mosaic songs={songs} />
                {card.kind === 'liked' && (
                  <span className="liked-heart" aria-hidden="true">
                    ♥
                  </span>
                )}
              </div>
              <div className="recent-footer">
                <div className="recent-text">
                  <div className="recent-title">{name}</div>
                  <div className="recent-date">
                    {songs.length} {songs.length === 1 ? 'song' : 'songs'}
                  </div>
                </div>
              </div>
            </button>
          )
        }
        const [key, title, sub, cover] =
          card.kind === 'album'
            ? [card.album.id, card.album.title, [card.album.artist, card.album.included ? 'Included with vaporTV' : card.album.year].filter(Boolean).join(' · '), card.album.cover]
            : card.kind === 'artist'
              ? [`artist:${card.artist.name}`, card.artist.name, `${card.artist.albums.length} ${card.artist.albums.length === 1 ? 'album' : 'albums'}`, card.artist.albums.find((a) => a.cover)?.cover]
              : [`place:${card.place.path}`, card.place.name, card.place.kind === 'network' ? 'Network share' : card.place.kind === 'drive' ? 'Drive' : 'Folder', undefined]
        return (
          <button
            key={key}
            className={`recent-card album-card${card.kind === 'artist' ? ' artist-card' : ''}`}
            tabIndex={-1}
            data-focusable=""
            data-select-sound="move"
            data-index={index}
            {...(index === 0 ? { 'data-focus-default': '' } : {})}
            aria-label={sub ? `${title}, ${sub}` : title}
            // The Favorite button on an album (music/favorites.ts).
            {...(card.kind === 'album' ? { 'data-album-id': card.album.id, 'data-title': card.album.title } : {})}
            onClick={(event) => onOpen(card, event.currentTarget)}
          >
            {card.kind === 'album' && favorites?.has(card.album.id) && (
              <span className="favorite-star" aria-label="Favourite">
                ★
              </span>
            )}
            <div className="recent-art">
              {cover ? (
                <img src={cover} alt="" loading="lazy" />
              ) : (
                <span className="recent-no-art display">
                  <span className="no-art-band">{card.kind === 'place' ? '♪' : title}</span>
                </span>
              )}
            </div>
            <div className="recent-footer">
              <div className="recent-text">
                <div className="recent-title">{title}</div>
                <div className="recent-date">{sub}</div>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

/** B over a page opened on the tab: back, when it's the page on top. */
function useBack(root: React.RefObject<HTMLDivElement | null>, onBack: () => void): void {
  const back = useRef(onBack)
  back.current = onBack
  useEffect(() => {
    const close = (): void => {
      if (trap() === root.current) back.current()
    }
    window.addEventListener(TRAP_CLOSE_EVENT, close)
    return () => window.removeEventListener(TRAP_CLOSE_EVENT, close)
  }, [root])
}

/** An artist's albums over the tab, in the tab's order. */
function ArtistPage({ artist, order, onOpen, onBack }: { artist: Artist; order: (a: MusicAlbum, b: MusicAlbum) => number; onOpen: (a: MusicAlbum, el: HTMLElement) => void; onBack: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  useBack(root, onBack)
  useEffect(() => {
    const first = root.current?.querySelector<HTMLElement>('[data-focusable]')
    if (first) focus(first)
  }, [])
  const cover = artist.albums.find((a) => a.cover)?.cover
  const favoriteIds = useMusicFavorites().albumIds
  return (
    <div className="media-show music-page" ref={root} data-focus-trap="">
      {cover && <img className="media-show-backdrop music-page-backdrop" src={cover} alt="" />}
      <div className="page-viewport">
        <div className="page-scroll">
          <div className="media-show-content">
            <h1 className="media-show-title display">{artist.name}</h1>
            <p className="music-page-facts">
              {artist.albums.length} {artist.albums.length === 1 ? 'album' : 'albums'}
            </p>
            <CardGrid
              cards={[...artist.albums].sort(order).map((a) => ({ kind: 'album', album: a }))}
              favorites={favoriteIds}
              memory={`music-artist:${artist.name}`}
              onOpen={(card, el) => card.kind === 'album' && onOpen(card.album, el)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** "1 h 12 min" or "48 min". */
function albumLength(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`
}

/** An album over the tab: its songs from the index, on a SongsPage, with Favorite beside Play all. */
function AlbumPage({ album, onPlay, onBack }: { album: MusicAlbum; onPlay: (at: number, shuffle: boolean, el: HTMLElement) => void; onBack: () => void }) {
  const [songs, setSongs] = useState<MusicTags[] | null>(null)
  const favorites = useMusicFavorites()
  useEffect(() => {
    window.steamtv.music
      .albumSongs(album.id)
      .then(setSongs)
      .catch(() => setSongs([]))
  }, [album.id])
  const facts = [album.included && 'Included with vaporTV', album.year, album.genre, `${album.songs} ${album.songs === 1 ? 'song' : 'songs'}`, album.duration > 0 && albumLength(album.duration)].filter(Boolean).join(' · ')
  const favorite = favorites.albumIds.has(album.id)
  return (
    <SongsPage
      title={album.title}
      artist={album.artist}
      facts={facts}
      backdrop={album.cover}
      cover={
        album.cover ? (
          <img className="music-page-cover" src={album.cover} alt="" />
        ) : (
          <span className="music-page-cover music-no-cover display" aria-hidden="true">
            ♪
          </span>
        )
      }
      songs={songs}
      liked={favorites.liked}
      albumArtist={album.artist}
      extra={
        <button
          className={`files-action display${favorite ? ' on' : ''}`}
          tabIndex={-1}
          data-focusable=""
          data-select-sound="move"
          onClick={() => void toggleFavoriteAlbum(album.id, album.title)}
        >
          {favorite ? '★ Favorite' : '☆ Favorite'}
        </button>
      }
      extra2={
        <>
          <button
            className="files-action display"
            tabIndex={-1}
            data-focusable=""
            data-select-sound="move"
            onClick={(e) => songs && pickPlaylist({ paths: songs.map((s) => s.path), name: album.title, from: e.currentTarget })}
          >
            ＋ Playlist
          </button>
          <BackgroundButton choice={BG_ALBUM + album.id} name={album.title} />
        </>
      }
      onPlay={onPlay}
      onBack={onBack}
    />
  )
}

/** A 2×2 of the first four different covers among songs (one cover alone fills it). */
function Mosaic({ songs, className }: { songs: MusicTags[]; className?: string }) {
  const covers = [...new Set(songs.map((s) => s.cover).filter((c): c is string => !!c))].slice(0, 4)
  if (covers.length === 0)
    return (
      <span className={`${className ?? ''} music-mosaic music-no-cover display`} aria-hidden="true">
        ♥
      </span>
    )
  return (
    <span className={`${className ?? ''} music-mosaic${covers.length >= 4 ? ' four' : ''}`} aria-hidden="true">
      {(covers.length >= 4 ? covers : covers.slice(0, 1)).map((c) => (
        <img key={c} src={c} alt="" loading="lazy" />
      ))}
    </span>
  )
}

/**
 * Songs over the tab (an album, Liked songs): a cover and names, Play all and Shuffle (and
 * `extra`), then the songs. A plays from one; the Favorite button likes one (a heart shows);
 * the game-options button opens its menu (Like, Start radio).
 */
function SongsPage({
  title,
  artist,
  facts,
  cover,
  backdrop,
  songs,
  liked,
  albumArtist,
  showArtist,
  extra,
  extra2,
  playlistId,
  grabbed,
  onPlay,
  onBack
}: {
  title: string
  artist?: string
  facts: string
  cover: React.ReactNode
  backdrop?: string
  songs: MusicTags[] | null
  liked: Set<string>
  /** Songs by someone else show who. */
  albumArtist?: string
  /** Each song's artist and album under it (Liked songs). */
  showArtist?: boolean
  extra?: React.ReactNode
  extra2?: React.ReactNode
  /** A playlist's page: its songs' menus offer Move and Remove. */
  playlistId?: string
  /** The song picked up to move (A puts it down). */
  grabbed?: string | null
  onPlay: (at: number, shuffle: boolean, el: HTMLElement) => void
  onBack: () => void
}) {
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  useBack(root, onBack)
  useEffect(() => {
    const play = root.current?.querySelector<HTMLElement>('[data-focusable]')
    if (play) focus(play)
  }, [])
  const discs = new Set(songs?.map((s) => s.disc ?? 1)).size > 1
  return (
    <div className="media-show music-page" ref={root} data-focus-trap="">
      {backdrop && <img className="media-show-backdrop music-page-backdrop" src={backdrop} alt="" />}
      <div className="music-page-album">
        {cover}
        <div className="music-page-text">
          <h1 className="media-show-title display">{title}</h1>
          {artist && <p className="music-page-artist">{artist}</p>}
          <p className="music-page-facts">{facts}</p>
          <div className="music-actions">
            <button className="files-action display" tabIndex={-1} data-focusable="" data-select-sound="move" onClick={(e) => onPlay(0, false, e.currentTarget)}>
              Play all
            </button>
            <button className="files-action display" tabIndex={-1} data-focusable="" data-select-sound="move" onClick={(e) => onPlay(0, true, e.currentTarget)}>
              Shuffle
            </button>
            {extra}
            {extra2}
          </div>
        </div>
      </div>
      <div className="music-page-songs" ref={list} data-nav-scope="">
        {!songs && <p className="settings-help">Loading…</p>}
        {songs?.length === 0 && <p className="settings-help">No songs here.</p>}
        {songs?.map((s, i) => (
          <button
            key={s.path}
            className={`setting-row files-row music-row${grabbed === s.path ? ' grabbed' : ''}`}
            tabIndex={-1}
            {...(playlistId ? { 'data-playlist-id': playlistId } : {})}
            {...(grabbed === s.path ? { 'data-grabbed': '' } : {})}
            data-focusable=""
            data-select-sound="move"
            data-song-path={s.path}
            data-title={s.title}
            {...(s.artist ? { 'data-artist': s.artist } : {})}
            {...(s.album ? { 'data-album': s.album } : {})}
            onFocus={(event) => {
              const box = list.current
              const row = event.currentTarget
              if (box) box.scrollTop = row.offsetTop - (box.clientHeight - row.offsetHeight) / 2
            }}
            onClick={(e) => onPlay(i, false, e.currentTarget)}
            aria-label={grabbed === s.path ? `${s.title}: up or down to move, A to put down, B to cancel` : undefined}
          >
            <span className="music-track-no">{showArtist ? i + 1 : discs && s.track ? `${s.disc ?? 1}.${s.track}` : (s.track ?? i + 1)}</span>
            <span className="music-row-text">
              <span className="setting-name display">{s.title}</span>
              {s.credit ? (
                // Included music: its licence's credit, as it asks.
                <span className="music-row-sub">{s.credit}</span>
              ) : showArtist && (s.artist || s.album) ? (
                <span className="music-row-sub">{[s.artist, s.album].filter(Boolean).join(' · ')}</span>
              ) : (
                s.artist && s.artist !== albumArtist && <span className="music-row-sub">{s.artist}</span>
              )}
            </span>
            {liked.has(s.path) && (
              <span className="music-liked" aria-label="Liked">
                ♥
              </span>
            )}
            {s.duration !== undefined && <span className="setting-detail">{clock(s.duration)}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * One of your playlists: its songs (the song menu's Move and Remove work here), Play all and
 * Shuffle, then Rename (say it or type it), Keep it fresh (a station's or Claude's: made again
 * once a day), Show on Home, and Delete (pressed twice).
 */
function PlaylistPage({ id, onBack }: { id: string; onBack: () => void }) {
  const playlists = useMusicPlaylists()
  const favorites = useMusicFavorites()
  const p = playlists.find((x) => x.id === id)
  const [order, setOrder] = useState<MusicTags[] | null>(null)
  const [grab, setGrab] = useState<{ path: string; from: number; before: MusicTags[] } | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const songs = order ?? p?.songs ?? null

  // Keep it fresh: made again when it's due, as it opens.
  useEffect(() => {
    if (!p?.fresh) return
    void window.steamtv.music.freshenPlaylist(id).then((changed) => {
      if (changed) {
        toast(`${p.name}: fresh songs from Claude`)
        void reloadPlaylists()
      }
    })
  }, [id])
  useEffect(() => setOrder(null), [p])

  // The song menu's Remove and Move.
  useEffect(() => {
    const onSong = (event: Event): void => {
      const { path, action } = (event as CustomEvent<{ path: string; action: 'move' | 'remove' }>).detail
      const list = songs ?? []
      if (action === 'remove') {
        const s = list.find((x) => x.path === path)
        void window.steamtv.music.removeFromPlaylist(id, path).then(() => {
          toast(`Removed ${s?.title ?? 'the song'} from ${p?.name ?? 'the playlist'}`)
          void reloadPlaylists()
        })
      } else {
        const from = list.findIndex((x) => x.path === path)
        if (from >= 0) setGrab({ path, from, before: list })
      }
    }
    window.addEventListener(PLAYLIST_SONG_EVENT, onSong)
    return () => window.removeEventListener(PLAYLIST_SONG_EVENT, onSong)
  }, [songs, id, p])

  // Picked up: up and down move it; A puts it down (saved); B puts it back.
  useEffect(() => {
    if (!grab) return
    const onMove = (event: Event): void => {
      const direction = (event as CustomEvent<Direction>).detail
      if (direction !== 'up' && direction !== 'down') return
      setOrder((was) => {
        const list = [...(was ?? songs ?? [])]
        const at = list.findIndex((x) => x.path === grab.path)
        const to = at + (direction === 'up' ? -1 : 1)
        if (at < 0 || to < 0 || to >= list.length) return was
        ;[list[at], list[to]] = [list[to], list[at]]
        return list
      })
    }
    const onCancel = (): void => {
      setOrder(grab.before)
      setGrab(null)
    }
    window.addEventListener(GRAB_MOVE_EVENT, onMove)
    window.addEventListener(GRAB_CANCEL_EVENT, onCancel)
    return () => {
      window.removeEventListener(GRAB_MOVE_EVENT, onMove)
      window.removeEventListener(GRAB_CANCEL_EVENT, onCancel)
    }
  }, [grab, songs])
  // The cursor stays on the song being moved, the list following it.
  useEffect(() => {
    if (!grab) return
    const row = document.querySelector<HTMLElement>(`.music-page-songs [data-song-path="${CSS.escape(grab.path)}"]`)
    if (row) {
      focus(row)
      row.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    }
  }, [grab, order])

  const putDown = (): void => {
    if (!grab || !songs) return
    const to = songs.findIndex((x) => x.path === grab.path)
    setGrab(null)
    if (to !== grab.from) void window.steamtv.music.moveInPlaylist(id, grab.from, to).then(() => reloadPlaylists())
  }

  if (!p) return null
  const ago = Math.round((Date.now() - p.updated) / 3_600_000)
  const facts = [p.file && 'From a playlist file in your music', `${p.songs.length} ${p.songs.length === 1 ? 'song' : 'songs'}`, p.fresh && `kept fresh by Claude (updated ${ago < 1 ? 'just now' : ago < 24 ? `${ago} h ago` : `${Math.round(ago / 24)} d ago`})`].filter(Boolean).join(' · ')
  const button = (label: string, onClick: () => void, on = false) => (
    <button className={`files-action display${on ? ' on' : ''}`} tabIndex={-1} data-focusable="" data-select-sound="move" onClick={onClick}>
      {label}
    </button>
  )
  return (
    <>
      <SongsPage
        title={p.name}
        facts={facts}
        cover={<Mosaic songs={p.songs} className="music-page-cover" />}
        songs={songs}
        liked={favorites.liked}
        showArtist
        // A playlist file is read-only: its songs' menus don't offer Move or Remove.
        playlistId={p.file ? undefined : p.id}
        grabbed={grab?.path ?? null}
        extra={
          p.file ? (
            <>
              {button('Make a copy', () => void newPlaylist(p.name, p.songs.map((s) => s.path)))}
              <BackgroundButton choice={`playlist:${p.id}`} name={p.name} />
            </>
          ) : (
          <>
            {button('Rename', () => setRenaming(true))}
            {p.canFresh && button(p.fresh ? '✓ Keep it fresh' : 'Keep it fresh', () => void window.steamtv.music.changePlaylist(p.id, { fresh: !p.fresh }).then(() => reloadPlaylists()), p.fresh)}
            {button(p.home ? '✓ On Home' : 'Show on Home', () => void window.steamtv.music.changePlaylist(p.id, { home: !p.home }).then(() => reloadPlaylists()), p.home)}
            <BackgroundButton choice={`playlist:${p.id}`} name={p.name} />
            {button(deleting ? 'Press again to delete' : 'Delete', () => {
              if (!deleting) return setDeleting(true)
              void window.steamtv.music.deletePlaylist(p.id).then(() => {
                toast(`Deleted ${p.name}`)
                onBack()
                void reloadPlaylists()
              })
            })}
          </>
          )
        }
        onPlay={(at, shuffle, el) => {
          if (grab) return putDown()
          playNow(songs ?? [], el, at, shuffle)
        }}
        onBack={() => {
          if (renaming || grab) return
          onBack()
        }}
      />
      {renaming && (
        <RenameDialog
          name={p.name}
          onDone={(name) => {
            setRenaming(false)
            if (name && name !== p.name) void window.steamtv.music.changePlaylist(p.id, { name }).then(() => reloadPlaylists())
          }}
        />
      )}
    </>
  )
}

/** Rename: say the new name (dictation), or type it on the on-screen keyboard. B leaves it as it was. */
function RenameDialog({ name, onDone }: { name: string; onDone: (name: string | null) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [typing, setTyping] = useState(false)
  const [status, setStatus] = useState('')
  useEffect(() => {
    const first = box.current?.querySelector<HTMLElement>('[data-focusable]')
    if (first) focus(first)
    const onBack = (): void => {
      if (trap() === box.current) {
        window.steamtv.stopVoice()
        onDone(null)
      }
    }
    const off = window.steamtv.onVoice((state, purpose) => {
      if (purpose !== 'dictation') return
      if (state.phase === 'heard') {
        const said = state.text.trim().replace(/[.!?]+$/, '')
        if (said) onDone(said)
        else setStatus("Didn't catch that")
      } else if (state.phase === 'error') setStatus(state.message)
      else setStatus(state.phase === 'listening' ? 'Listening… say the new name' : 'Getting ready…')
    })
    window.addEventListener(TRAP_CLOSE_EVENT, onBack)
    return () => {
      off()
      window.removeEventListener(TRAP_CLOSE_EVENT, onBack)
    }
  }, [])
  return (
    <div className="dialog-backdrop music-picker-backdrop">
      {typing ? (
        <OnScreenKeyboard title="Rename playlist" initial={name} onDone={(text) => onDone(text.trim() || null)} onCancel={() => setTyping(false)} />
      ) : (
        <div className="side-bar-sort-menu music-picker" ref={box} role="menu" data-focus-trap="" data-nav-scope="">
          <p className="music-song-menu-title">Rename “{name}”</p>
          <button className="side-bar-sort-option display" role="menuitem" tabIndex={-1} data-focusable="" data-select-sound="move" onClick={() => window.steamtv.startVoice('dictation')}>
            🎤 Say the new name
          </button>
          <button className="side-bar-sort-option display" role="menuitem" tabIndex={-1} data-focusable="" data-select-sound="move" onClick={() => setTyping(true)}>
            ⌨ Type it
          </button>
          {status && <p className="music-song-menu-title">{status}</p>}
        </div>
      )}
    </div>
  )
}

/** Set as background music: this album, playlist or Liked songs plays quietly under the menus (Settings → Music & sounds shows the same). */
function BackgroundButton({ choice, name }: { choice: string; name: string }) {
  const now = useBackgroundChoice()
  const on = now === choice
  return (
    <button className={`files-action display${on ? ' on' : ''}`} tabIndex={-1} data-focusable="" data-select-sound="move" onClick={() => !on && void setBackground(choice, name)}>
      {on ? '✓ Background music' : 'Set as background music'}
    </button>
  )
}

/**
 * Background music's song while nothing else plays: "In the background: Title, Artist" with
 * Turn it up, which carries it on in the Music player at full volume (Now playing opens).
 */
function BackgroundStrip() {
  const { song } = useBackgroundSong()
  const listening = usePlayerNow()
  if (!song || listening) return null
  return (
    <div className="music-bg-strip">
      <span className="music-now-bars" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="music-bg-text">
        In the background: <strong>{song.title}</strong>
        {song.artist ? ` · ${song.artist}` : ''}
      </span>
      <button className="files-action display" tabIndex={-1} data-focusable="" data-select-sound="move" onClick={(e) => void turnItUp(e.currentTarget)}>
        Turn it up
      </button>
    </div>
  )
}
