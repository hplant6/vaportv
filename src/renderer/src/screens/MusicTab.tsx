import { useEffect, useMemo, useRef, useState } from 'react'
import type { MusicAlbum, MusicIndexStatus, MusicPlace, MusicTags } from '../../../shared/types'
import { MUSIC_EVENT, openMusicAt } from '../components/MusicApp'
import { NavBar, type Screen } from '../components/NavBar'
import { SideBar, sideListId, type SideList } from '../components/SideBar'
import { focus, focusContentDefault, trap, TRAP_CLOSE_EVENT } from '../input/focus'
import { playerState, playQueue, toggleShuffle } from '../music/player'
import { remember, remembered, SideGrid, useSideBarOpen } from './sideLayout'

// The Music tab: the console tabs' left bar and grid, filled from the music index
// (musicIndex.ts: every song's tags, across ~/Music, drives and shares). The bar turns Henry's
// turntable; Genre (a drop-down under Sort) narrows Recently played, Albums and Artists, and
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
type Card = { kind: 'album'; album: MusicAlbum } | { kind: 'artist'; artist: Artist } | { kind: 'place'; place: MusicPlace }

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
    { id: 'albums', name: 'Albums', items: asAlbums([...shown].sort(order)), empty: inGenre || noneYet },
    { id: 'artists', name: 'Artists', items: artists.map((a) => ({ kind: 'artist', artist: a })), empty: inGenre || noneYet },
    {
      id: 'folders',
      name: 'Folders',
      items: places.map((p) => ({ kind: 'place', place: p })),
      empty: 'No music folders yet.',
      section: 'Browse'
    }
  ]
  const current = all.find((l) => l.id === selected) ?? all[0]
  const select = (id: string): void => {
    if (id === selected) return
    setSelected(id)
    remember((saved) => {
      saved.lists[SCREEN] = id
    })
  }
  const title = `${open ? '' : 'Music · '}${current.name}${genreOn && current.id !== 'folders' ? ` · ${genreName}` : ''} (${current.items.length.toLocaleString()})`

  /** Plays songs from the index, and opens Now playing over the tab. */
  const playSongs = (songs: MusicTags[], from: HTMLElement | null, at = 0, shuffle = false): void => {
    if (!songs.length) return
    if (shuffle !== playerState().shuffle) toggleShuffle()
    playQueue(songs, shuffle ? Math.floor(Math.random() * songs.length) : at)
    window.dispatchEvent(new CustomEvent(MUSIC_EVENT, { detail: from }))
  }
  const playAlbum = (a: MusicAlbum, from: HTMLElement | null, at = 0, shuffle = false): void => {
    setPlayed(markAlbumPlayed(a.id))
    window.steamtv.music.albumSongs(a.id).then((songs) => playSongs(songs, from, at, shuffle))
  }

  const openCard = (card: Card, el: HTMLElement): void => {
    if (card.kind === 'album') setAlbum({ album: card.album, from: el })
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
            {reading && <p className="music-tab-reading">{reading}</p>}
            {!loaded ? (
              <p className="empty-note">Looking for your music…</p>
            ) : current.items.length === 0 ? (
              <p className="empty-note">{current.empty}</p>
            ) : (
              <CardGrid cards={current.items} memory={`music:${current.id}:${sort}`} onOpen={openCard} />
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
function CardGrid({ cards, memory, onOpen }: { cards: Card[]; memory: string; onOpen: (card: Card, el: HTMLElement) => void }) {
  return (
    <div className="album-grid" data-focus-memory={memory}>
      {cards.map((card, index) => {
        const [key, title, sub, cover] =
          card.kind === 'album'
            ? [card.album.id, card.album.title, [card.album.artist, card.album.year].filter(Boolean).join(' · '), card.album.cover]
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
            onClick={(event) => onOpen(card, event.currentTarget)}
          >
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

/** An album over the tab: its cover and names, Play all and Shuffle, then its songs (A plays from one). */
function AlbumPage({ album, onPlay, onBack }: { album: MusicAlbum; onPlay: (at: number, shuffle: boolean, el: HTMLElement) => void; onBack: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [songs, setSongs] = useState<MusicTags[] | null>(null)
  useBack(root, onBack)
  useEffect(() => {
    window.steamtv.music
      .albumSongs(album.id)
      .then(setSongs)
      .catch(() => setSongs([]))
    const play = root.current?.querySelector<HTMLElement>('[data-focusable]')
    if (play) focus(play)
  }, [album.id])
  const discs = new Set(songs?.map((s) => s.disc ?? 1)).size > 1
  const facts = [album.year, album.genre, `${album.songs} ${album.songs === 1 ? 'song' : 'songs'}`, album.duration > 0 && albumLength(album.duration)].filter(Boolean).join(' · ')
  return (
    <div className="media-show music-page" ref={root} data-focus-trap="">
      {album.cover && <img className="media-show-backdrop music-page-backdrop" src={album.cover} alt="" />}
      <div className="music-page-album">
        {album.cover ? (
          <img className="music-page-cover" src={album.cover} alt="" />
        ) : (
          <span className="music-page-cover music-no-cover display" aria-hidden="true">
            ♪
          </span>
        )}
        <div className="music-page-text">
          <h1 className="media-show-title display">{album.title}</h1>
          {album.artist && <p className="music-page-artist">{album.artist}</p>}
          <p className="music-page-facts">{facts}</p>
          <div className="music-actions">
            <button className="files-action display" tabIndex={-1} data-focusable="" data-select-sound="move" onClick={(e) => onPlay(0, false, e.currentTarget)}>
              Play all
            </button>
            <button className="files-action display" tabIndex={-1} data-focusable="" data-select-sound="move" onClick={(e) => onPlay(0, true, e.currentTarget)}>
              Shuffle
            </button>
          </div>
        </div>
      </div>
      <div className="music-page-songs" ref={list} data-nav-scope="">
        {!songs && <p className="settings-help">Loading…</p>}
        {songs?.map((s, i) => (
          <button
            key={s.path}
            className="setting-row files-row music-row"
            tabIndex={-1}
            data-focusable=""
            data-select-sound="move"
            onFocus={(event) => {
              const box = list.current
              const row = event.currentTarget
              if (box) box.scrollTop = row.offsetTop - (box.clientHeight - row.offsetHeight) / 2
            }}
            onClick={(e) => onPlay(i, false, e.currentTarget)}
          >
            <span className="music-track-no">{discs && s.track ? `${s.disc ?? 1}.${s.track}` : (s.track ?? i + 1)}</span>
            <span className="music-row-text">
              <span className="setting-name display">{s.title}</span>
              {s.artist && s.artist !== album.artist && <span className="music-row-sub">{s.artist}</span>}
            </span>
            {s.duration !== undefined && <span className="setting-detail">{clock(s.duration)}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
