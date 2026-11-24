import { useCallback, useEffect, useRef, useState } from 'react'
import type { MusicEntry, MusicFolder, MusicPlace, MusicTags, VisualizerLook, CoverMotion, VisualizerPower, VoiceState } from '../../../shared/types'
import { DEFAULT_CONTROLS, type Controls } from '../../../shared/controls'
import { focus, OWN_DIRECTION_EVENT, PLAYER_SKIP_EVENT, PLAYER_TRACKS_EVENT, trap, TRAP_CLOSE_EVENT, TRAP_SIDE_BAR_EVENT, TRAP_TAB_EVENT, type Direction } from '../input/focus'
import { keepAwake } from '../input/idle'
import { play } from '../input/sounds'
import { cycleRepeat, current, next, playAt, playerState, playQueue, previous, seekBy, skipSeconds, stopMusic, subscribe, toggle, toggleShuffle, updateTags, type PlayerState } from '../music/player'
import { FloatingCover } from '../music/FloatingCover'
import { Visualizer } from '../music/Visualizer'
import { COVER_MOTIONS, VISUALIZER_POWERS } from '../music/choices'
import { isLiked, startRadio, toggleDisliked, toggleLiked, useClaudeReady, useMusicFavorites } from '../music/favorites'
import { newPlaylist } from '../music/playlists'
import { takeNowPlaying } from '../music/nowPlaying'
import { ButtonIcon, DpadIcon, useControllerFamily } from './ButtonIcon'
import { errorText } from './GooglePhotos'
import { OnScreenKeyboard } from './Keyboard'
import { ICONS, PlayerButton, ShortcutsPanel, stepAlong } from './PlayerControls'
import { SortMenu } from './SideBar'

// The Music app (its tile is in Apps): your own music from ~/Music, network shares (mounted
// under ~/Network) and drives. Places on the left; on the right a folder's folders as a grid of
// covers (as the console tabs show games), and its songs as an album: the cover, Play all and
// Shuffle, then the songs. A on a song plays the folder from it. Now playing is the
// cover floating over the backdrop, the song beside it, and the player's buttons along the foot (D-pad down
// to them, as in the video players). The music carries on when the screen closes.

/** AppTile fires this for the Music tile (detail: the tile, to come back to). */
export const MUSIC_EVENT = 'steamtv:music'

/** Tags asked for at a time, as the list fills in. */
const TAGS_AT_ONCE = 24
/** Folders' covers asked for at a time, as the grid fills in. */
const FOLDERS_AT_ONCE = 10
/** Now playing: the controls slip away this long after the last press (not while paused). */
const BAR_MS = 2000

function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const s = Math.floor(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function centre(box: HTMLElement | null, row: HTMLElement): void {
  if (box) box.scrollTop = row.offsetTop - (box.clientHeight - row.offsetHeight) / 2
}

/** "1 h 12 min" or "48 min": an album's length. */
function albumLength(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`
}

/** "Aphex Twin - Syro" → "Syro" by "Aphex Twin" (as the main side splits a folder's name). */
function splitName(name: string): { artist?: string; title: string } {
  const at = name.search(/\s+[-–]\s+/)
  const rest = at > 0 ? name.slice(at).replace(/^\s+[-–]\s+/, '').trim() : ''
  return rest ? { artist: name.slice(0, at).trim(), title: rest } : { title: name }
}

function usePlayer(): PlayerState {
  const [state, setState] = useState(playerState)
  useEffect(() => subscribe(setState), [])
  return state
}

/** Mounted once in App; shows the screen while it's open. */
export function MusicApp() {
  // Where it was opened from; whether Back from Now playing closes it (opened on Now playing from
  // elsewhere: openNowPlaying); and a count of asks to show Now playing while it's already open.
  const [open, setOpen] = useState<{ from: HTMLElement | null; closeOnBack: boolean; playing: number } | null>(null)
  useEffect(() => {
    const onOpen = (event: Event): void => {
      const from = (event as CustomEvent<HTMLElement | null>).detail
      const nowPlaying = takeNowPlaying()
      // Already open (a station started in its browser): it shows Now playing, and Back still goes to its browser.
      setOpen((was) => (was ? { ...was, playing: was.playing + (nowPlaying ? 1 : 0) } : { from, closeOnBack: nowPlaying, playing: 0 }))
    }
    window.addEventListener(MUSIC_EVENT, onOpen)
    return () => window.removeEventListener(MUSIC_EVENT, onOpen)
  }, [])
  const close = useCallback(() => {
    setOpen((was) => {
      const tile = was?.from
      if (tile?.isConnected) requestAnimationFrame(() => focus(tile))
      return null
    })
  }, [])
  return open ? <Music onClose={close} closeOnBack={open.closeOnBack} playing={open.playing} /> : null
}

function Music({ onClose, closeOnBack, playing }: { onClose: () => void; closeOnBack: boolean; playing: number }) {
  const player = usePlayer()
  // Opening with music on: straight to Now playing.
  const [view, setView] = useState<'browse' | 'playing'>(() => {
    const browse = browseNext
    browseNext = false
    return playerState().at >= 0 && (closeOnBack || !browse) ? 'playing' : 'browse'
  })
  useEffect(() => {
    if (playing) setView('playing')
  }, [playing])
  // Voice search here (the mic, R3, a remote's Menu): what's heard goes to the browser, from Now playing too.
  const [voice, setVoice] = useState<VoiceState | null>(null)
  useEffect(() => {
    window.steamtv.music.setOpen(true)
    const off = window.steamtv.onVoice((state, purpose) => {
      if (purpose !== 'music') return
      setVoice(state)
      if (state.phase === 'starting' || state.phase === 'heard') setView('browse')
    })
    return () => {
      off()
      window.steamtv.music.setOpen(false)
      window.steamtv.stopVoice()
    }
  }, [])
  return view === 'playing' && player.at >= 0 ? (
    // Opened on it from elsewhere (an album's page), Back goes back there; else to the browser.
    <NowPlaying player={player} onBack={closeOnBack ? onClose : () => setView('browse')} />
  ) : (
    <Browser player={player} voice={voice} onHeard={() => setVoice(null)} onClose={onClose} onPlaying={() => setView('playing')} />
  )
}

/** Remembered while vaporTV runs: where you were. */
let lastTrail: MusicEntry[] = []
/** Set by openMusicAt: open on browsing (not Now playing), at that place. */
let browseNext = false

/** The Music tab's Folders: the next opening shows this place's folders, even with music playing. */
export function openMusicAt(place: MusicPlace): void {
  lastTrail = [{ name: place.name, path: place.path, kind: 'folder' }]
  browseNext = true
}

/** How a folder's folders are ordered, as a streaming app's library sorts: the ones you played
 *  last, newest in, by title, by artist, or by release year (newest first). */
type Sort = 'played' | 'recent' | 'name' | 'artist' | 'year'
const SORTS: { id: Sort; name: string }[] = [
  { id: 'played', name: 'Recently played' },
  { id: 'recent', name: 'Recently added' },
  { id: 'name', name: 'Alphabetical' },
  { id: 'artist', name: 'Artist' },
  { id: 'year', name: 'Release year' }
]
/** The order chosen, on this TV (losing it just means Recently played). */
const SORT_STORE = 'vaportv.musicSort'

function savedSort(): Sort {
  try {
    const saved = localStorage.getItem(SORT_STORE)
    return SORTS.some((s) => s.id === saved) ? (saved as Sort) : 'played'
  } catch {
    return 'played'
  }
}

/** When each folder was last played from (and its parents: an artist's folder counts when one
 *  of their albums plays), on this TV. Losing it just means Recently played falls back to
 *  Recently added. */
const PLAYED_STORE = 'vaportv.musicPlayed'
/** Kept to the folders played most recently. */
const PLAYED_KEPT = 500

function playedTimes(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(PLAYED_STORE) ?? '{}') as Record<string, number>
  } catch {
    return {}
  }
}

function markPlayed(paths: string[]): Record<string, number> {
  const now = Date.now()
  const all = { ...playedTimes(), ...Object.fromEntries(paths.map((p) => [p, now])) }
  const kept = Object.fromEntries(Object.entries(all).sort((a, b) => b[1] - a[1]).slice(0, PLAYED_KEPT))
  try {
    localStorage.setItem(PLAYED_STORE, JSON.stringify(kept))
  } catch {
    // Not kept; the order just won't know about this one.
  }
  return kept
}

const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** Whether the places column is hidden (L2), on this TV. */
const BAR_STORE = 'vaportv.musicBarHidden'

function savedBarOpen(): boolean {
  try {
    return localStorage.getItem(BAR_STORE) !== '1'
  } catch {
    return true
  }
}

/** What the mic shows while it works. */
const VOICE_STATUS: Record<VoiceState['phase'], string> = {
  starting: 'Starting the microphone…',
  preparing: 'Getting voice search ready…',
  listening: 'Listening…',
  thinking: 'Working out what you said…',
  heard: '',
  error: ''
}

/** A song's name as a title until its tags are read. */
const fileTitle = (e: MusicEntry): string => e.name.replace(/\.[^.]+$/, '')

/** Songs queued by name (a request through Claude): their tags read after, the playing one first, then the rest a few at a time. */
async function fillQueueTags(paths: string[]): Promise<void> {
  const playing = current()?.path
  const order = playing ? [playing, ...paths.filter((p) => p !== playing)] : paths
  for (let i = 0; i < order.length; i += TAGS_AT_ONCE) {
    // Another queue since: stop.
    if (!playerState().queue.some((t) => t.path === order[i])) return
    updateTags(await window.steamtv.music.tags(order.slice(i, i + TAGS_AT_ONCE)).catch(() => [] as MusicTags[]))
  }
}

function Browser({
  player,
  voice,
  onHeard,
  onClose,
  onPlaying
}: {
  player: PlayerState
  voice: VoiceState | null
  /** What was heard is handled: not again when the browser opens next. */
  onHeard: () => void
  onClose: () => void
  onPlaying: () => void
}) {
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [places, setPlaces] = useState<MusicPlace[] | null>(null)
  const [trail, setTrail] = useState<MusicEntry[]>(lastTrail)
  const [entries, setEntries] = useState<MusicEntry[] | null>(null)
  const [tags, setTags] = useState<Record<string, MusicTags>>({})
  const [cards, setCards] = useState<Record<string, MusicFolder>>({})
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<Sort>(savedSort)
  const [played, setPlayed] = useState(playedTimes)
  const [genre, setGenre] = useState<string | null>(null)
  const [choosingGenre, setChoosingGenre] = useState(false)
  const [barOpen, setBarOpen] = useState(savedBarOpen)
  // Search: what's typed or heard, the names that match it, and Claude's albums for a spoken request.
  const [query, setQuery] = useState('')
  const [typing, setTyping] = useState(false)
  const [found, setFound] = useState<MusicEntry[] | null>(null)
  const [picked, setPicked] = useState<MusicEntry[] | null>(null)
  const [asking, setAsking] = useState(false)
  const [note, setNote] = useState('')
  const asked = useRef(0)
  const returnTo = useRef<string | null>(null)
  const here = trail[trail.length - 1] ?? null
  const searching = !!query || !!picked

  // Browsing: the folder's folders and songs. Searching: Claude's albums, else the names that match.
  const shown = searching ? (picked ?? found ?? []) : (entries ?? [])
  const unsorted = shown.filter((e) => e.kind === 'folder')
  const tracks = shown.filter((e) => e.kind === 'track')
  const titleOf = (e: MusicEntry): string => cards[e.path]?.title ?? splitName(e.name).title
  const artistOf = (e: MusicEntry): string => cards[e.path]?.artist ?? splitName(e.name).artist ?? e.name
  const byTitle = (a: MusicEntry, b: MusicEntry): number => byName.compare(titleOf(a), titleOf(b)) || byName.compare(a.name, b.name)
  const byAdded = (a: MusicEntry, b: MusicEntry): number => (b.modified ?? 0) - (a.modified ?? 0)
  const order: Record<Sort, (a: MusicEntry, b: MusicEntry) => number> = {
    // Never played: after the played ones, newest in first.
    played: (a, b) => (played[b.path] ?? 0) - (played[a.path] ?? 0) || byAdded(a, b),
    recent: byAdded,
    name: byTitle,
    artist: (a, b) => byName.compare(artistOf(a), artistOf(b)) || (cards[a.path]?.year ?? 0) - (cards[b.path]?.year ?? 0) || byTitle(a, b),
    // No year in its tags: at the end, by title.
    year: (a, b) => (cards[b.path]?.year ?? -Infinity) - (cards[a.path]?.year ?? -Infinity) || byTitle(a, b)
  }
  const genres = [...new Set(unsorted.map((e) => cards[e.path]?.genre).filter((g): g is string => !!g))].sort(byName.compare)
  // Claude's albums keep its order (best first); the rest are sorted.
  const sorted = picked ? unsorted : [...unsorted].sort(order[sort])
  const folders = genre ? sorted.filter((e) => cards[e.path]?.genre === genre) : sorted

  useEffect(() => {
    lastTrail = trail
  }, [trail])

  useEffect(() => {
    window.steamtv.music
      .places()
      .then((found) => {
        setPlaces(found)
        if (!lastTrail.length && found[0]) setTrail([{ name: found[0].name, path: found[0].path, kind: 'folder' }])
      })
      .catch((err: unknown) => setError(errorText(err)))
  }, [])

  /** Folders' covers and songs' tags, a screenful at a time, while `live()`. */
  const fill = async (list: MusicEntry[], live: () => boolean): Promise<void> => {
    const dirs = list.filter((e) => e.kind === 'folder').map((e) => e.path)
    const songs = list.filter((e) => e.kind === 'track').map((e) => e.path)
    const fillCards = async (): Promise<void> => {
      for (let i = 0; i < dirs.length && live(); i += FOLDERS_AT_ONCE) {
        const got = await window.steamtv.music.folders(dirs.slice(i, i + FOLDERS_AT_ONCE)).catch(() => [] as MusicFolder[])
        if (live()) setCards((was) => ({ ...was, ...Object.fromEntries(got.map((c) => [c.path, c])) }))
      }
    }
    const fillTags = async (): Promise<void> => {
      for (let i = 0; i < songs.length && live(); i += TAGS_AT_ONCE) {
        const got = await window.steamtv.music.tags(songs.slice(i, i + TAGS_AT_ONCE)).catch(() => [] as MusicTags[])
        if (live()) setTags((was) => ({ ...was, ...Object.fromEntries(got.map((t) => [t.path, t])) }))
      }
    }
    await Promise.all([fillTags(), fillCards()])
  }

  // The folder, then its folders' covers and its songs' tags.
  useEffect(() => {
    if (!here) return
    let live = true
    setEntries(null)
    setError(null)
    setGenre(null)
    window.steamtv.music
      .browse(here.path)
      .then(async (got) => {
        if (!live) return
        setEntries(got)
        await fill(got, () => live)
      })
      .catch((err: unknown) => live && setError(errorText(err)))
    return () => {
      live = false
    }
  }, [here])

  // Typed or heard: the names that match, everywhere, a moment after the last change.
  useEffect(() => {
    setFound(null)
    if (!query) return
    let live = true
    const timer = setTimeout(() => {
      window.steamtv.music
        .search(query)
        .then(async (got) => {
          if (!live) return
          setFound(got)
          await fill(got, () => live)
        })
        .catch((err: unknown) => live && setNote(errorText(err)))
    }, 250)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [query])

  // Claude's albums: their covers.
  useEffect(() => {
    if (!picked) return
    let live = true
    void fill(picked, () => live)
    return () => {
      live = false
    }
  }, [picked])

  const clearSearch = (): void => {
    asked.current++
    setQuery('')
    setPicked(null)
    setAsking(false)
    setNote('')
    setGenre(null)
  }

  /** Songs named in a list, queued now and their tags read as they play. */
  const playSongs = (songs: MusicEntry[], shuffle: boolean, at = 0): void => {
    if (!songs.length) return
    const queue = songs.map((e) => tags[e.path] ?? { path: e.path, title: fileTitle(e) })
    if (shuffle !== playerState().shuffle) toggleShuffle()
    playQueue(queue, shuffle ? Math.floor(Math.random() * queue.length) : at)
    void fillQueueTags(queue.filter((t) => !tags[t.path]).map((t) => t.path))
    onPlaying()
  }

  // What was heard: its names searched at once, and the request to Claude, which may say to play.
  const lastHeard = useRef<VoiceState | null>(null)
  useEffect(() => {
    if (voice?.phase !== 'heard' || lastHeard.current === voice) return
    lastHeard.current = voice
    onHeard()
    const heard = voice.text.trim()
    if (!heard) return
    const ask = ++asked.current
    setPicked(null)
    setGenre(null)
    setQuery(heard)
    setAsking(true)
    setNote('Asking Claude…')
    window.steamtv.music
      .ask(heard)
      .then((answer) => {
        if (ask !== asked.current) return
        setAsking(false)
        // No Claude Code here (or no answer): the names that match stand.
        if (!answer) return setNote('')
        // "Make me a playlist of…": saved to Playlists and played.
        if (answer.action === 'playlist' && answer.songs.length) {
          const name = answer.name ?? heard
          setNote(`Claude made “${name}”: ${answer.songs.length} songs, saved to Playlists`)
          void newPlaylist(name, answer.songs.map((e) => e.path), { request: heard })
          return playSongs(answer.songs, false)
        }
        const n = answer.albums.length
        if (!n) return setNote(`Claude didn't find anything for that`)
        if (answer.action !== 'show' && answer.songs.length) {
          setPicked(answer.albums)
          setNote(`Claude picked ${n} ${n === 1 ? 'album' : 'albums'}`)
          return playSongs(answer.songs, answer.action === 'shuffle')
        }
        setPicked(answer.albums)
        setNote(`Claude picked ${n} ${n === 1 ? 'album' : 'albums'}`)
      })
      .catch(() => ask === asked.current && (setAsking(false), setNote('')))
  }, [voice])

  // Back out of a folder: the cursor on its card. Into one, or opening the app (back from Now
  // playing too): the song playing, else the album's Play all or the first card. Not when the
  // cursor's in the places, choosing one, or on the search bar.
  useEffect(() => {
    if (searching ? !(found || picked) : !entries) return
    const back = returnTo.current && list.current?.querySelector<HTMLElement>(`[data-path="${CSS.escape(returnTo.current)}"]`)
    returnTo.current = null
    if (back) return focus(back)
    if (document.activeElement?.closest('.music-search, .music-sorts')) return
    if (list.current?.contains(document.activeElement) || !root.current?.contains(document.activeElement)) {
      const first =
        list.current?.querySelector<HTMLElement>('.music-row.playing') ??
        list.current?.querySelector<HTMLElement>('.music-album [data-focusable], .music-card, .music-row') ??
        list.current?.querySelector<HTMLElement>('[data-focusable]')
      if (first) focus(first)
      else root.current?.querySelector<HTMLElement>('.files-place.active')?.focus()
    }
  }, [entries, found, picked])

  const chooseSort = (next: Sort): void => {
    setSort(next)
    try {
      localStorage.setItem(SORT_STORE, next)
    } catch {
      // Not kept; it's Recently played next time.
    }
    if (list.current) list.current.scrollTop = 0
  }

  const songsHere = (): MusicTags[] => tracks.map((t) => tags[t.path] ?? { path: t.path, title: fileTitle(t) })

  const start = (at: number, shuffle = false): void => {
    if (!tracks.length) return
    if (shuffle !== playerState().shuffle) toggleShuffle()
    if (!searching) setPlayed(markPlayed(trail.slice(1).map((t) => t.path)))
    playQueue(songsHere(), shuffle ? Math.floor(Math.random() * tracks.length) : at)
    onPlaying()
  }

  /** A folder from the search: its place, then the folders down to it, as if walked to. */
  const openFound = (e: MusicEntry): void => {
    const place = places?.find((p) => e.path === p.path || e.path.startsWith(p.path + '/'))
    clearSearch()
    if (!place) return setTrail((was) => [...was, e])
    const steps: MusicEntry[] = [{ name: place.name, path: place.path, kind: 'folder' }]
    let path = place.path
    for (const part of e.path.slice(place.path.length + 1).split('/').filter(Boolean)) {
      path = `${path}/${part}`
      steps.push({ name: part, path, kind: 'folder' })
    }
    setTrail(steps)
  }

  // B: a menu over it closes itself; then the search clears, then up a folder, then from the
  // top of a place to its name on the left (when the column's showing), then it closes (the
  // music carries on).
  useEffect(() => {
    const onBack = (): void => {
      if (trap() !== root.current) return
      if (searching) {
        clearSearch()
        const mic = root.current?.querySelector<HTMLElement>('.music-mic')
        if (mic) focus(mic)
        return
      }
      if (trail.length > 1) {
        returnTo.current = here!.path
        return setTrail((t) => t.slice(0, -1))
      }
      const place = root.current?.querySelector<HTMLElement>('.files-place.active')
      if (barOpen && list.current?.contains(document.activeElement) && place) return focus(place)
      onClose()
    }
    window.addEventListener(TRAP_CLOSE_EVENT, onBack)
    return () => window.removeEventListener(TRAP_CLOSE_EVENT, onBack)
  })

  // L2: the places column hides (the grid widens) or comes back, remembered.
  useEffect(() => {
    const onToggle = (): void => {
      const inBar = !!document.activeElement?.closest('.files-sidebar')
      setBarOpen((was) => {
        try {
          localStorage.setItem(BAR_STORE, was ? '1' : '0')
        } catch {
          // Not kept; it's showing next time.
        }
        return !was
      })
      play('move')
      if (inBar) {
        const first = list.current?.querySelector<HTMLElement>('.music-card, .music-row') ?? list.current?.querySelector<HTMLElement>('[data-focusable]')
        if (first) focus(first)
      }
    }
    window.addEventListener(TRAP_SIDE_BAR_EVENT, onToggle)
    return () => window.removeEventListener(TRAP_SIDE_BAR_EVENT, onToggle)
  }, [])

  const playingPath = current()?.path
  // A folder of songs is an album: its first song's tags name it, and the cover is the one most of its songs share.
  const first = tracks[0] && tags[tracks[0].path]
  const named = here ? splitName(here.name) : { title: '' }
  const album = {
    title: first?.album ?? (trail.length > 1 ? named.title : (here?.name ?? '')),
    artist: first?.artist ?? (trail.length > 1 ? named.artist : undefined),
    cover: tracks.map((t) => tags[t.path]?.cover).find(Boolean)
  }
  const totalSeconds = tracks.reduce((sum, t) => sum + (tags[t.path]?.duration ?? 0), 0)
  const sameArtist = (t: MusicTags | undefined): boolean => !searching && (!t?.artist || t.artist === album.artist)
  const where = searching ? 'Search' : here ? trail.map((t) => t.name).join(' / ') : ''
  const counts = (searching ? found || picked : entries)
    ? [folders.length && `${folders.length} ${folders.length === 1 ? 'folder' : 'folders'}`, tracks.length && `${tracks.length} ${tracks.length === 1 ? 'song' : 'songs'}`]
        .filter(Boolean)
        .join(' · ')
    : ''

  const listening = !!voice && (voice.phase === 'starting' || voice.phase === 'preparing' || voice.phase === 'listening' || voice.phase === 'thinking')
  const voiceNote = voice?.phase === 'error' ? voice.message : voice && listening ? VOICE_STATUS[voice.phase] : ''
  const status = listening ? voiceNote : note || (voice?.phase === 'error' ? voiceNote : '')
  const loadingSearch = searching && !picked && !found
  const toTop = (): void => {
    if (list.current) list.current.scrollTop = 0
  }

  return (
    <div className={`files-app music-app${barOpen ? '' : ' bar-hidden'}`} ref={root} data-side-bar="" {...(typing ? {} : { 'data-focus-trap': '' })}>
      <div className="settings-scrim" aria-hidden="true" />
      <div className="settings-sidebar files-sidebar" aria-hidden={!barOpen}>
        <h2 className="settings-title display">Music</h2>
        <div className="settings-categories files-places" data-nav-scope="">
          {player.at >= 0 && (
            <button className="settings-category files-place music-now display" tabIndex={-1} {...(barOpen ? { 'data-focusable': '' } : {})} data-select-sound="move" data-nav-right=".music-scroll [data-focusable]" onClick={onPlaying}>
              <span className="music-now-bars" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span className="files-place-name">Now playing</span>
            </button>
          )}
          {places?.map((p) => (
            <button
              key={p.path}
              className={`settings-category files-place display${trail[0]?.path === p.path && !searching ? ' active' : ''}`}
              tabIndex={-1}
              {...(barOpen ? { 'data-focusable': '' } : {})}
              data-select-sound="move"
              data-nav-right=".music-scroll [data-focusable]"
              onFocus={() => {
                if (searching) clearSearch()
                if (trail[0]?.path !== p.path || trail.length > 1) setTrail([{ name: p.name, path: p.path, kind: 'folder' }])
              }}
              onClick={() => {
                const firstInPane = list.current?.querySelector<HTMLElement>('.music-card, .music-row, .music-album [data-focusable]')
                if (firstInPane) focus(firstInPane)
              }}
            >
              <span className="files-place-name">{p.name}</span>
            </button>
          ))}
          {places && places.length === 0 && <p className="settings-help">No music folders yet: put songs in ~/Music, or plug in a drive.</p>}
        </div>
      </div>

      <div className="files-pane">
        <div className="settings-group files-group music-group">
          {(searching || tracks.length === 0) && <h3 className="settings-heading display">{searching ? 'Search' : (here?.name ?? 'Music')}</h3>}
          <p className="settings-help files-path">{counts ? `${where} · ${counts}` : where}</p>
          <div className="files-list browse-list music-scroll" ref={list} data-nav-scope="" {...(barOpen ? { 'data-nav-left-out': '.files-place.active, .music-now' } : {})}>
            {/* Search (say or type: an artist, album or song, or ask for a kind of music), then the filters. */}
            <div className="music-search">
              <button
                className={`search-mic music-mic${listening ? ` ${voice!.phase}` : ''}`}
                tabIndex={-1}
                data-focusable=""
                data-select-sound="move"
                aria-label="Speak"
                onFocus={toTop}
                onClick={() => {
                  if (!listening) window.steamtv.startVoice('music')
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
                </svg>
              </button>
              <div className={`search-field music-field${query ? '' : ' empty'}`}>
                <span className="search-field-text">{query || (listening ? voiceNote : 'Say or type an artist, album or song — or ask for a kind of music')}</span>
              </div>
              <button className="search-type music-type display" tabIndex={-1} data-focusable="" data-select-sound="move" onFocus={toTop} onClick={() => setTyping(true)}>
                Type
              </button>
              {searching && (
                <button className="search-type music-type display" tabIndex={-1} data-focusable="" data-select-sound="move" onFocus={toTop} onClick={clearSearch}>
                  Clear
                </button>
              )}
            </div>
            {status && <p className={`settings-help music-search-status${asking ? ' asking' : ''}`}>{status}</p>}

            {(unsorted.length > 1 || genre) && (
              <div className="music-sorts" role="group" aria-label="Filters">
                <div className="music-genre">
                  <button
                    id="music-genre"
                    className={`side-bar-sort-button music-genre-button display${choosingGenre ? ' open' : ''}${genre ? ' on' : ''}`}
                    tabIndex={-1}
                    data-focusable=""
                    data-select-sound="move"
                    aria-haspopup="menu"
                    aria-expanded={choosingGenre}
                    onFocus={toTop}
                    onClick={() => setChoosingGenre(true)}
                  >
                    Genre: {genre ?? 'All'}
                    <span className="side-bar-sort-arrow" aria-hidden="true" />
                  </button>
                  {choosingGenre && (
                    <GenreMenu
                      genre={genre}
                      genres={genres}
                      onPick={(next) => {
                        setChoosingGenre(false)
                        setGenre(next)
                        toTop()
                      }}
                      onClose={() => setChoosingGenre(false)}
                    />
                  )}
                </div>
                {!picked &&
                  SORTS.map((o) => (
                    <button
                      key={o.id}
                      className={`files-action music-sort display${sort === o.id ? ' on' : ''}`}
                      tabIndex={-1}
                      role="radio"
                      aria-checked={sort === o.id}
                      data-focusable=""
                      data-select-sound="move"
                      onFocus={toTop}
                      onClick={() => chooseSort(o.id)}
                    >
                      {o.name}
                    </button>
                  ))}
              </div>
            )}

            {error && !searching && <p className="settings-help">{error}</p>}
            {((!entries && !error && !searching) || loadingSearch) && <p className="settings-help">{searching ? 'Searching…' : 'Loading…'}</p>}
            {!searching && entries && entries.length === 0 && !error && <p className="settings-help">No songs or folders here.</p>}
            {searching && !loadingSearch && !asking && shown.length === 0 && <p className="settings-help">Nothing called “{query}”.</p>}
            {genre && folders.length === 0 && unsorted.length > 0 && <p className="settings-help">No {genre} here.</p>}

            {!searching && tracks.length > 0 && (
              <div className="music-album">
                {album.cover ? (
                  <img className="music-album-cover" src={album.cover} alt="" />
                ) : (
                  <span className="music-album-cover music-no-cover display" aria-hidden="true">
                    ♪
                  </span>
                )}
                <div className="music-album-text">
                  <h3 className="music-album-title display">{album.title}</h3>
                  {album.artist && <p className="music-album-artist">{album.artist}</p>}
                  <p className="music-album-facts">
                    {tracks.length} {tracks.length === 1 ? 'song' : 'songs'}
                    {totalSeconds > 0 && ` · ${albumLength(totalSeconds)}`}
                  </p>
                  <div className="music-actions">
                    <button className="files-action display" tabIndex={-1} data-focusable="" data-select-sound="move" onFocus={toTop} onClick={() => start(0)}>
                      Play all
                    </button>
                    <button className="files-action display" tabIndex={-1} data-focusable="" data-select-sound="move" onFocus={toTop} onClick={() => start(0, true)}>
                      Shuffle
                    </button>
                  </div>
                </div>
              </div>
            )}

            {searching && folders.length > 0 && (
              <>
                <h4 className="music-section display">{picked ? 'Albums' : 'Folders'}</h4>
                {picked && (
                  <div className="music-actions music-picked-actions">
                    <button className="files-action display" tabIndex={-1} data-focusable="" data-select-sound="move" onFocus={toTop} onClick={() => void playAlbums(folders, false)}>
                      Play all
                    </button>
                    <button className="files-action display" tabIndex={-1} data-focusable="" data-select-sound="move" onFocus={toTop} onClick={() => void playAlbums(folders, true)}>
                      Shuffle
                    </button>
                  </div>
                )}
              </>
            )}

            {(searching ? folders.length > 0 : folders.length > 0) && (
              <>
                {!searching && tracks.length > 0 && <h4 className="music-section display">Folders</h4>}
                <div className="music-grid">
                  {folders.map((e) => {
                    const card = cards[e.path]
                    const title = card?.title ?? e.name
                    return (
                      <button
                        key={e.path}
                        className="recent-card music-card"
                        tabIndex={-1}
                        data-focusable=""
                        data-select-sound="move"
                        data-path={e.path}
                        aria-label={card?.artist ? `${title}, ${card.artist}` : title}
                        onFocus={(event) => centre(list.current, event.currentTarget)}
                        onClick={() => (searching ? openFound(e) : setTrail((was) => [...was, e]))}
                      >
                        <div className="recent-art">
                          {card?.cover ? (
                            <img src={card.cover} alt="" loading="lazy" />
                          ) : (
                            <span className={`recent-no-art display${card ? '' : ' loading'}`}>
                              <span className="no-art-band">{title}</span>
                            </span>
                          )}
                        </div>
                        <div className="recent-footer">
                          <div className="recent-text">
                            <div className="recent-title">{title}</div>
                            <div className="recent-date">{card?.artist ?? ''}</div>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {tracks.length > 0 && (
              <>
                {searching && <h4 className="music-section display">Songs</h4>}
                <div className="music-tracks">
                  {tracks.map((e, i) => {
                    const t = tags[e.path]
                    return (
                      <button
                        key={e.path}
                        className={`setting-row files-row music-row${e.path === playingPath ? ' playing' : ''}`}
                        tabIndex={-1}
                        data-focusable=""
                        data-select-sound="move"
                        data-path={e.path}
                        data-song-path={e.path}
                        data-title={t?.title ?? fileTitle(e)}
                        onFocus={(event) => centre(list.current, event.currentTarget)}
                        onClick={() => start(i)}
                      >
                        <span className="music-track-no">
                          {e.path === playingPath ? (
                            <span className="music-now-bars" aria-hidden="true">
                              <i />
                              <i />
                              <i />
                            </span>
                          ) : searching ? (
                            i + 1
                          ) : (
                            (t?.track ?? i + 1)
                          )}
                        </span>
                        <span className="music-row-text">
                          <span className="setting-name display">{t?.title ?? fileTitle(e)}</span>
                          {!sameArtist(t) && t?.artist && <span className="music-row-sub">{searching && t.album ? `${t.artist} · ${t.album}` : t.artist}</span>}
                        </span>
                        {t?.duration !== undefined && <span className="setting-detail">{clock(t.duration)}</span>}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {typing && (
        <OnScreenKeyboard
          title="Search music"
          initial={query}
          showField={false}
          onChange={(text) => {
            asked.current++
            setPicked(null)
            setAsking(false)
            setNote('')
            setQuery(text.trim())
          }}
          onDone={(text) => {
            setTyping(false)
            setQuery(text.trim())
          }}
          onCancel={() => setTyping(false)}
        />
      )}
    </div>
  )

  /** Claude's albums (as filtered), played: their songs, album by album. */
  async function playAlbums(albums: MusicEntry[], shuffle: boolean): Promise<void> {
    const songs: MusicEntry[] = []
    for (const a of albums) {
      const inside = await window.steamtv.music.browse(a.path).catch(() => [] as MusicEntry[])
      songs.push(...inside.filter((e) => e.kind === 'track'))
    }
    playSongs(songs, shuffle)
  }
}

/**
 * Genre's drop-down, as the console tabs' Sort: All, then the genres the albums here are
 * tagged with, opening on the one in use. Up and down and A inside it; B closes it. Either
 * way the cursor goes back to Genre.
 */
function GenreMenu({ genre, genres, onPick, onClose }: { genre: string | null; genres: string[]; onPick: (genre: string | null) => void; onClose: () => void }) {
  const menu = useRef<HTMLDivElement>(null)
  const back = (): void => {
    const button = document.getElementById('music-genre')
    if (button) focus(button)
  }

  useEffect(() => {
    const now = menu.current?.querySelector<HTMLElement>('[aria-checked="true"]')
    if (now) focus(now)
    const close = (): void => {
      if (trap() !== menu.current) return
      onClose()
      back()
    }
    window.addEventListener(TRAP_CLOSE_EVENT, close)
    return () => window.removeEventListener(TRAP_CLOSE_EVENT, close)
  }, [])

  const options: { id: string | null; name: string }[] = [{ id: null, name: 'All' }, ...genres.map((g) => ({ id: g, name: g }))]
  return (
    <div className="side-bar-sort-menu music-genre-menu" role="menu" ref={menu} data-focus-trap="" data-nav-scope="">
      {options.map((o) => (
        <button
          key={o.id ?? ''}
          className="side-bar-sort-option display"
          role="menuitemradio"
          aria-checked={o.id === genre}
          tabIndex={-1}
          data-focusable=""
          data-select-sound="move"
          onFocus={(event) => event.currentTarget.scrollIntoView({ block: 'nearest' })}
          onClick={() => {
            onPick(o.id)
            back()
          }}
        >
          {o.name}
        </button>
      ))}
      {genres.length === 0 && <p className="settings-help music-genre-none">No genres in these albums' tags yet.</p>}
    </div>
  )
}

/** Now playing: the cover floating over the backdrop, the song beside it, and the player's buttons. */
function NowPlaying({ player, onBack }: { player: PlayerState; onBack: () => void }) {
  const self = useRef<HTMLButtonElement>(null)
  const buttonsRow = useRef<HTMLDivElement>(null)
  const playButton = useRef<HTMLButtonElement>(null)
  const [barShown, setBarShown] = useState(true)
  // Whether the controls are showing, for the press that brings them back to do only that.
  const shownRef = useRef(true)
  const playingRef = useRef(player.playing)
  playingRef.current = player.playing
  const barTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const onButtonsRef = useRef(false)
  const [keysShown, setKeysShown] = useState(false)
  // The player's settings (the gear): the visualizer, how much the cover moves, the shortcuts.
  const [settingsOpen, setSettingsOpenState] = useState(false)
  const settingsOpenRef = useRef(false)
  const settingsButton = useRef<HTMLButtonElement>(null)
  const setSettingsOpen = (open: boolean): void => {
    settingsOpenRef.current = open
    setSettingsOpenState(open)
  }
  const [controls, setControls] = useState<Controls>(DEFAULT_CONTROLS)
  const family = useControllerFamily()
  const song = current()
  // The heart (liked or not) and radio (with Claude Code on the box).
  const favs = useMusicFavorites()
  const liked = isLiked(song?.path)
  // A station's songs, over Now playing (the radio button again).
  const [stationOpen, setStationOpen] = useState(false)
  useEffect(() => {
    if (!player.station) setStationOpen(false)
  }, [player.station])
  const claudeReady = useClaudeReady()
  const like = useCallback((): void => {
    const now = current()
    if (now) void toggleLiked(now.path, now.title)
  }, [])

  // The Favorite button (Y by default) likes or unlikes the song playing.
  useEffect(() => {
    const onFavorite = (): void => (showBar(), like())
    window.addEventListener(PLAYER_TRACKS_EVENT, onFavorite)
    return () => window.removeEventListener(PLAYER_TRACKS_EVENT, onFavorite)
  }, [like])

  const setOnButtons = (on: boolean): void => {
    onButtonsRef.current = on
  }
  const toTop = useCallback((): void => {
    onButtonsRef.current = false
    if (self.current) focus(self.current)
  }, [])
  const showBar = useCallback(() => {
    setBarShown(true)
    shownRef.current = true
    clearTimeout(barTimer.current)
    barTimer.current = setTimeout(() => {
      // Not with the settings open: the cursor's in them.
      if (settingsOpenRef.current) return
      setBarShown(false)
      setKeysShown(false)
      // Paused, they stay; playing, they go, and the cursor goes quietly back to the seek bar.
      if (!playingRef.current) return
      shownRef.current = false
      if (onButtonsRef.current) toTop()
    }, BAR_MS)
  }, [toTop])
  useEffect(() => () => clearTimeout(barTimer.current), [])
  // Playing again (however it was started), the controls go after the usual wait.
  useEffect(() => {
    if (player.playing) showBar()
  }, [player.playing, showBar])

  useEffect(() => {
    window.steamtv.getSettings().then((s) => setControls(s.controls))
    if (self.current) focus(self.current)
    showBar()
  }, [showBar])

  // The screensaver stays off while it plays.
  useEffect(() => {
    const holder = {}
    keepAwake(holder, player.playing)
    return () => keepAwake(holder, false)
  }, [player.playing])

  // B: the shortcuts panel, then back to browsing (the music carries on).
  useEffect(() => {
    const onClose = (): void => {
      if (settingsOpenRef.current) {
        // A drop-down open in them closes itself (and the cursor goes back to its button).
        if (document.querySelector('.player-settings .side-bar-sort-menu')) return
        setSettingsOpen(false)
        showBar()
        if (settingsButton.current) focus(settingsButton.current)
        return
      }
      if (stationOpen) {
        setStationOpen(false)
        return toTop()
      }
      if (keysShown) setKeysShown(false)
      else onBack()
    }
    window.addEventListener(TRAP_CLOSE_EVENT, onClose)
    return () => window.removeEventListener(TRAP_CLOSE_EVENT, onClose)
  }, [keysShown, onBack, stationOpen, showBar])

  // On the seek bar: left and right skip 10 seconds, down to the buttons. On the buttons: along them, up back.
  // L1 / R1: the song before or after. The triggers: 10 seconds back or on, as in the video players.
  useEffect(() => {
    const onDirection = (event: Event): void => {
      const direction = (event as CustomEvent<Direction>).detail
      // With the controls hidden, a press just brings them back.
      const hidden = !shownRef.current && playingRef.current
      showBar()
      if (hidden) return
      if (onButtonsRef.current) {
        if (direction === 'up') return toTop()
        if (direction === 'down') return
        const nextButton = stepAlong(buttonsRow.current, direction)
        if (nextButton) {
          play('move')
          focus(nextButton)
        }
        return
      }
      if (direction === 'down') {
        setOnButtons(true)
        play('move')
        if (playButton.current) focus(playButton.current)
        return
      }
      if (direction === 'left') seekBy(-skipSeconds)
      if (direction === 'right') seekBy(skipSeconds)
    }
    const onTab = (event: Event): void => {
      showBar()
      if ((event as CustomEvent<number>).detail < 0) previous()
      else void next()
    }
    const onSkip = (event: Event): void => {
      showBar()
      seekBy((event as CustomEvent<number>).detail)
    }
    window.addEventListener(OWN_DIRECTION_EVENT, onDirection)
    window.addEventListener(TRAP_TAB_EVENT, onTab)
    window.addEventListener(PLAYER_SKIP_EVENT, onSkip)
    return () => {
      window.removeEventListener(OWN_DIRECTION_EVENT, onDirection)
      window.removeEventListener(TRAP_TAB_EVENT, onTab)
      window.removeEventListener(PLAYER_SKIP_EVENT, onSkip)
    }
  }, [showBar, toTop])

  // Which visualizer (Settings → Music), read as the screen opens.
  const [visualizer, setVisualizer] = useState<VisualizerLook>('off')
  const [coverMotion, setCoverMotion] = useState<CoverMotion>('lots')
  const [visualizerPower, setVisualizerPower] = useState<VisualizerPower>('fast')
  useEffect(() => {
    let live = true
    window.steamtv.getSettings().then((s) => {
      if (!live) return
      setVisualizer(s.musicVisualizer ?? 'orb')
      setCoverMotion(s.musicCoverMotion ?? 'lots')
      setVisualizerPower(s.musicVisualizerPower ?? 'fast')
    })
    return () => {
      live = false
    }
  }, [])

  const length = player.duration || song?.duration || 0
  const progress = length ? Math.min(100, (player.time / length) * 100) : 0
  const queueText = player.order.length > 1 ? `${player.at + 1} of ${player.order.length}` : ''
  return (
    // The station's list takes the D-pad while it's open.
    <div className="media-player music-playing" data-focus-trap="" {...(stationOpen || settingsOpen ? {} : { 'data-own-directions': '' })}>
      <div className="music-playing-scrim" aria-hidden="true" />
      <div className={`files-viewer music-viewer${barShown || !player.playing ? ' bar-shown' : ''}`}>
        <div className="music-now-stage">
          {/* The cover in the middle of the visualizer, which runs the full width behind it. */}
          <div className="music-now-centre">
            <Visualizer look={visualizer} playing={player.playing} power={visualizerPower} />
            <FloatingCover cover={song?.cover} playing={player.playing} motion={coverMotion} />
          </div>
          {/* The song, small, across the top: its title, then artist · album · where in the queue. */}
          <div className="music-song">
            <p className="music-song-title display">{song?.title ?? ''}</p>
            <p className="music-song-line">
              {[
                song?.artist && <span key="artist" className="music-song-artist">{song.artist}</span>,
                song?.album && <span key="album" className="music-song-album">{song.album}</span>,
                queueText && <span key="queue" className="music-song-queue">{queueText}</span>
              ]
                .filter(Boolean)
                .flatMap((part, i) => (i ? [<span key={`dot${i}`} className="music-song-album"> · </span>, part] : [part]))}
            </p>
          </div>
        </div>
        <div className="files-viewer-bar media-controls-bar">
          <button ref={self} className="files-viewer-line media-seek" tabIndex={-1} data-focusable="" data-select-sound="move" onClick={() => (showBar(), toggle())}>
            <span className="files-viewer-time">{clock(player.time)}</span>
            <span className="files-progress media-progress">
              <span className="files-progress-fill" style={{ width: `${progress}%` }} />
              <span className="media-playhead" style={{ left: `${progress}%` }} />
            </span>
            <span className="files-viewer-time">{clock(length)}</span>
          </button>
          {/* Three columns: the ends the same width, so Play, in the middle of the middle, is centred. */}
          <div className="media-buttons" ref={buttonsRow}>
            <div className="media-buttons-side">
              <PlayerButton
                label="Stop"
                onClick={() => {
                  stopMusic()
                  onBack()
                }}
              >
                {ICONS.stop}
              </PlayerButton>
              <PlayerButton label={player.shuffle ? 'Shuffle: on' : 'Shuffle: off'} pressed={player.shuffle} onClick={() => (showBar(), toggleShuffle())}>
                {ICONS.shuffle}
              </PlayerButton>
              <PlayerButton label={player.repeat === 'off' ? 'Repeat: off' : player.repeat === 'all' ? 'Repeat: all' : 'Repeat: this song'} pressed={player.repeat !== 'off'} onClick={() => (showBar(), cycleRepeat())}>
                {player.repeat === 'one' ? ICONS.repeatOne : ICONS.repeat}
              </PlayerButton>
            </div>
            <div className="media-buttons-middle">
              <PlayerButton label="Previous" onClick={() => (showBar(), previous())}>
                {ICONS.previous}
              </PlayerButton>
              <PlayerButton label={`Back ${skipSeconds} seconds`} onClick={() => (showBar(), seekBy(-skipSeconds))}>
                {ICONS.back(skipSeconds)}
              </PlayerButton>
              <PlayerButton label={player.playing ? 'Pause' : 'Play'} big buttonRef={playButton} onClick={() => (showBar(), toggle())}>
                {player.playing ? ICONS.pause : ICONS.play}
              </PlayerButton>
              <PlayerButton label={`On ${skipSeconds} seconds`} onClick={() => (showBar(), seekBy(skipSeconds))}>
                {ICONS.on(skipSeconds)}
              </PlayerButton>
              <PlayerButton label="Next" disabled={player.at + 1 >= player.order.length && player.repeat !== 'all'} onClick={() => (showBar(), void next())}>
                {ICONS.next}
              </PlayerButton>
            </div>
            <div className="media-buttons-side end">
              <PlayerButton label={liked ? 'Liked: unlike this song' : 'Like this song'} pressed={liked} onClick={() => (showBar(), like())}>
                <path d="M12 19.5s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 6.6a4.2 4.2 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z" className={liked ? 'fill' : undefined} />
              </PlayerButton>
              {song && (
                <PlayerButton label={`Thumbs down: skip ${song.title}, never on radio again`} onClick={() => (showBar(), void toggleDisliked(song.path, song.title))}>
                  <path d="M9.5 15.5v3.2a2 2 0 0 0 2 2l3.5-7.2V4.5H7.2a2 2 0 0 0-2 1.7l-1 6.3a2 2 0 0 0 2 2.3h3.3zM15 4.5h3.5v9H15" />
                </PlayerButton>
              )}
              {claudeReady && song && (
                <PlayerButton
                  label={player.station ? `${player.station.seed.title} radio: its songs` : `Radio: songs like ${song.title} (Claude picks them)`}
                  pressed={!!player.station}
                  onClick={() => {
                    showBar()
                    if (player.station) setStationOpen(true)
                    else void startRadio(song, null)
                  }}
                >
                  <path d="M4.5 9.5h15v9.5h-15zM7.5 9.5l9.5-4.5M8 14.25h4M15.5 14.25m-1.75 0a1.75 1.75 0 1 0 3.5 0a1.75 1.75 0 1 0-3.5 0" />
                </PlayerButton>
              )}
              <PlayerButton
                label="Settings"
                pressed={settingsOpen}
                buttonRef={settingsButton}
                onClick={() => {
                  showBar()
                  setKeysShown(false)
                  setSettingsOpen(!settingsOpenRef.current)
                }}
              >
                <path d="M12 8.6a3.4 3.4 0 1 0 0 6.8a3.4 3.4 0 1 0 0-6.8zM12 3.5l1.6 2.4 2.8-.6.6 2.8 2.4 1.6-1.4 2.3 1.4 2.3-2.4 1.6-.6 2.8-2.8-.6L12 20.5l-1.6-2.4-2.8.6-.6-2.8-2.4-1.6 1.4-2.3-1.4-2.3 2.4-1.6.6-2.8 2.8.6z" />
              </PlayerButton>
            </div>
          </div>
        </div>
        {player.loading && <p className="media-subs-loading">Loading…</p>}
      </div>
      {stationOpen && player.station && <StationPanel player={player} disliked={favs.disliked} liked={favs.liked} />}
      {settingsOpen && (
        <PlayerSettings
          power={visualizerPower}
          motion={coverMotion}
          onPower={(power) => {
            setVisualizerPower(power)
            void window.steamtv.setMusicVisualizerPower(power)
          }}
          onMotion={(m) => {
            setCoverMotion(m)
            void window.steamtv.setMusicCoverMotion(m)
          }}
          onShortcuts={() => {
            setSettingsOpen(false)
            setKeysShown(true)
            showBar()
            if (settingsButton.current) focus(settingsButton.current)
          }}
        />
      )}
      {keysShown && (
        <ShortcutsPanel>
          <span className="files-hint">
            <ButtonIcon button={controls.select} family={family} /> Play / pause
          </span>
          <span className="files-hint">
            <DpadIcon leftRight /> {skipSeconds} seconds back / on (on the seek bar)
          </span>
          <span className="files-hint">
            <ButtonIcon button={controls.previousTab} family={family} />
            <ButtonIcon button={controls.nextTab} family={family} /> Previous / next song
          </span>
          <span className="files-hint">
            <DpadIcon /> Down to these buttons, up to the seek bar
          </span>
          <span className="files-hint">
            <ButtonIcon button={controls.favorite} family={family} /> Like this song (Liked songs)
          </span>
          <span className="files-hint">
            <ButtonIcon button={controls.back} family={family} /> Back to your music (it keeps playing)
          </span>
        </ShortcutsPanel>
      )}
    </div>
  )
}

/**
 * The player's settings, over Now playing (the gear), in the app's drop-down style (as Sort and
 * Genre): Visualizer (Fast machine, Slow machine or Off) and Album movement (A lot, A little or
 * None), each opening on its choice; then the controller shortcuts. B closes a drop-down, then
 * the panel.
 */
function PlayerSettings({
  power,
  motion,
  onPower,
  onMotion,
  onShortcuts
}: {
  power: VisualizerPower
  motion: CoverMotion
  onPower: (power: VisualizerPower) => void
  onMotion: (motion: CoverMotion) => void
  onShortcuts: () => void
}) {
  const panel = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState<'power' | 'motion' | null>(null)
  useEffect(() => {
    const first = panel.current?.querySelector<HTMLElement>('[data-focusable]')
    if (first) focus(first)
  }, [])
  const menus = [
    { id: 'power' as const, label: 'Visualizer', value: power, options: VISUALIZER_POWERS, pick: (v: string) => onPower(v as VisualizerPower) },
    { id: 'motion' as const, label: 'Album movement', value: motion, options: COVER_MOTIONS, pick: (v: string) => onMotion(v as CoverMotion) }
  ]
  return (
    <div className="media-keys player-settings" role="dialog" aria-label="Player settings" ref={panel} data-focus-trap="" data-nav-scope="">
      <h3 className="settings-heading display">Settings</h3>
      {menus.map((m) => (
        <div className="side-bar-sort" key={m.id}>
          <button
            id={`player-settings-${m.id}`}
            className={`side-bar-sort-button display${open === m.id ? ' open' : ''}`}
            tabIndex={-1}
            data-focusable=""
            data-select-sound="move"
            aria-haspopup="menu"
            aria-expanded={open === m.id}
            onClick={() => setOpen(m.id)}
          >
            <span className="side-bar-sort-label">
              {m.label}: {m.options.find((o) => o.id === m.value)?.name}
            </span>
            <span className="side-bar-sort-arrow" aria-hidden="true" />
          </button>
          {open === m.id && (
            <SortMenu
              sort={m.value}
              sorts={m.options}
              buttonId={`player-settings-${m.id}`}
              onPick={(next) => {
                setOpen(null)
                if (next !== m.value) m.pick(next)
              }}
              onClose={() => setOpen(null)}
            />
          )}
        </div>
      ))}
      <button className="side-bar-sort-button display" tabIndex={-1} data-focusable="" data-select-sound="move" onClick={onShortcuts}>
        <span className="side-bar-sort-label">Controller shortcuts</span>
      </button>
    </div>
  )
}

/**
 * A radio station's songs, over Now playing (the radio button while one plays): in the order
 * they play, the one playing marked and the cursor on it. A plays one; right to its thumbs
 * down (it leaves the station, never on radio again); B closes the list.
 */
function StationPanel({ player, liked, disliked }: { player: PlayerState; liked: Set<string>; disliked: Set<string> }) {
  const list = useRef<HTMLDivElement>(null)
  const songs = player.order.map((i) => player.queue[i])
  useEffect(() => {
    const now = list.current?.querySelector<HTMLElement>('.station-row.playing .station-song') ?? list.current?.querySelector<HTMLElement>('.station-song')
    if (now) focus(now)
  }, [])
  const centreRow = (event: React.FocusEvent<HTMLElement>): void => {
    const box = list.current
    const row = event.currentTarget.closest<HTMLElement>('.station-row')
    if (box && row) box.scrollTop = row.offsetTop - (box.clientHeight - row.offsetHeight) / 2
  }
  return (
    <div className="station-panel" data-focus-trap="">
      <div className="station-head">
        <div className="station-head-text">
          <h2 className="station-title display">{player.station?.seed.title} radio</h2>
          <p className="station-facts">{songs.length} songs · Claude picked them · right for 👎 on a song you don't want</p>
        </div>
        <button
          className="files-action display station-save"
          tabIndex={-1}
          data-focusable=""
          data-select-sound="move"
          onClick={() => {
            const seed = player.station!.seed
            void newPlaylist(`${seed.title} radio`, songs.map((s) => s.path), { seed: seed.path })
          }}
        >
          Save as playlist
        </button>
      </div>
      <div className="station-list" ref={list} data-nav-scope="">
        {songs.map((s, position) => (
          <div key={s.path} className={`station-row${position === player.at ? ' playing' : ''}${position < player.at ? ' played' : ''}`}>
            <button
              className="station-song"
              tabIndex={-1}
              data-focusable=""
              data-select-sound="move"
              data-song-path={s.path}
              data-title={s.title}
              onFocus={centreRow}
              onClick={() => playAt(position)}
            >
              <span className="music-track-no">
                {position === player.at ? (
                  <span className="music-now-bars" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                ) : (
                  position + 1
                )}
              </span>
              {s.cover ? <img className="station-cover" src={s.cover} alt="" /> : <span className="station-cover music-no-cover">♪</span>}
              <span className="music-row-text">
                <span className="setting-name display">{s.title}</span>
                <span className="music-row-sub">{[s.artist, s.album].filter(Boolean).join(' · ')}</span>
              </span>
              {liked.has(s.path) && <span className="music-liked">♥</span>}
            </button>
            <button
              className={`station-down${disliked.has(s.path) ? ' on' : ''}`}
              tabIndex={-1}
              data-focusable=""
              data-select-sound="move"
              aria-label={`Thumbs down: ${s.title}`}
              onFocus={centreRow}
              onClick={() => void toggleDisliked(s.path, s.title)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9.5 15.5v3.2a2 2 0 0 0 2 2l3.5-7.2V4.5H7.2a2 2 0 0 0-2 1.7l-1 6.3a2 2 0 0 0 2 2.3h3.3zM15 4.5h3.5v9H15" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
