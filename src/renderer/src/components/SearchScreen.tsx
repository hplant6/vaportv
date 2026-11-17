import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppItem, LibraryTab, RecentItem, VoiceState } from '../../../shared/types'
import { clearWinner, parseQuery, search } from '../../../shared/search'
import { useTabArrangement } from '../availableTabs'
import { focus, openSettings, TRAP_CLOSE_EVENT } from '../input/focus'
import { play } from '../input/sounds'
import { startLaunch } from '../launch'
import { AppTile } from './AppTile'
import { MUSIC_HOLD_EVENT } from './MusicPreview'
import { CollectionGrid } from './CollectionGrid'
import { Spinner } from './LaunchOverlay'
import { OnScreenKeyboard } from './Keyboard'

// Search: every game in the tabs and every app, by name. A remote's Menu tapped opens it
// listening (voice search); the mic here listens again, and Type opens the on-screen
// keyboard. "Play X" or "Open X" starts the best match when it's a clear one. With Claude
// Code set up on the box, what's heard also goes to Claude (claudeSearch.ts), whose picks
// take the place of the name matches when they come: misheard titles, games described
// rather than named, kinds of game. Without it, or if it has nothing, the name matches stand.

/** Opens the search screen (detail: the element to come back to). */
export const SEARCH_EVENT = 'steamtv:search'

/** The library is read again when search opens after this long. */
const STALE_MS = 2 * 60 * 1000

const LOADERS: Record<string, () => Promise<LibraryTab>> = {
  steam: () => window.steamtv.getSteamTab(),
  switch: () => window.steamtv.getSwitchTab(),
  ps3: () => window.steamtv.getPs3Tab(),
  xbox: () => window.steamtv.getXboxTab(),
  xbox360: () => window.steamtv.getXbox360Tab(),
  ps2: () => window.steamtv.getPs2Tab(),
  psx: () => window.steamtv.getPsxTab(),
  psp: () => window.steamtv.getPspTab(),
  gamecube: () => window.steamtv.getGameCubeTab(),
  wii: () => window.steamtv.getWiiTab(),
  wiiu: () => window.steamtv.getWiiUTab(),
  dreamcast: () => window.steamtv.getDreamcastTab(),
  saturn: () => window.steamtv.getSaturnTab(),
  n64: () => window.steamtv.getN64Tab(),
  nes: () => window.steamtv.getNesTab(),
  snes: () => window.steamtv.getSnesTab(),
  genesis: () => window.steamtv.getGenesisTab(),
  sega32x: () => window.steamtv.getSega32xTab(),
  neogeo: () => window.steamtv.getNeoGeoTab(),
  arcade: () => window.steamtv.getArcadeTab()
}

let library: { games: RecentItem[]; at: number } | null = null

/** Every game in the tabs that show, once each, the recently played first (each tab lists those first). */
async function loadGames(tabs: string[]): Promise<RecentItem[]> {
  if (library && Date.now() - library.at < STALE_MS) return library.games
  const loaded = await Promise.all(tabs.filter((t) => LOADERS[t]).map((t) => LOADERS[t]().catch(() => null)))
  const seen = new Set<string>()
  const games: RecentItem[] = []
  for (const tab of loaded)
    for (const row of tab?.rows ?? [])
      for (const item of row.items)
        if (!seen.has(item.id)) {
          seen.add(item.id)
          games.push(item)
        }
  games.sort((a, b) => (b.lastPlayed ?? '').localeCompare(a.lastPlayed ?? ''))
  library = { games, at: Date.now() }
  return games
}

const STATUS: Record<VoiceState['phase'], string> = {
  starting: 'One moment…',
  preparing: 'Getting voice search ready…',
  listening: 'Listening…',
  thinking: 'One moment…',
  heard: '',
  error: ''
}

/** Mounted once in App; shows the search screen while it's open. */
export function SearchScreen({ apps, logos }: { apps: AppItem[]; logos: Record<string, string> }) {
  const [from, setFrom] = useState<HTMLElement | null | undefined>(undefined)
  const [voice, setVoice] = useState<VoiceState | null>(null)
  const open = from !== undefined

  useEffect(() => {
    const onOpen = (event: Event): void => {
      setFrom((event as CustomEvent<HTMLElement | null>).detail ?? null)
      setVoice(null)
    }
    window.addEventListener(SEARCH_EVENT, onOpen)
    // Voice search started from a remote opens the screen to show it.
    const offVoice = window.steamtv.onVoice((state, purpose) => {
      if (purpose !== 'search') return
      setFrom((f) => (f === undefined ? ((document.activeElement as HTMLElement | null) ?? null) : f))
      setVoice(state)
    })
    // A remote's Menu held is Settings, as the Menu key used to be on its own.
    const offHeld = window.steamtv.onMenuHeld(() => openSettings())
    return () => {
      window.removeEventListener(SEARCH_EVENT, onOpen)
      offVoice()
      offHeld()
    }
  }, [])

  const close = useCallback(() => {
    window.steamtv.stopVoice()
    setVoice(null)
    setFrom((el) => {
      if (el?.isConnected) requestAnimationFrame(() => focus(el))
      return undefined
    })
  }, [])

  return open ? <Search apps={apps} logos={logos} voice={voice} onClose={close} /> : null
}

function Search({
  apps,
  logos,
  voice,
  onClose
}: {
  apps: AppItem[]
  logos: Record<string, string>
  voice: VoiceState | null
  onClose: () => void
}) {
  const root = useRef<HTMLDivElement>(null)
  const arrangement = useTabArrangement()
  const [games, setGames] = useState<RecentItem[] | null>(null)
  const [query, setQuery] = useState('')
  const [typing, setTyping] = useState(false)
  // A spoken "play X" waits for the library, then starts X if it's a clear match.
  const startWhenFound = useRef(false)
  // Spoken (not typed): Claude's turn once the library's in, unless the name match already settled it.
  const askClaude = useRef(false)
  /** Claude's picks for a spoken query, in place of the name matches while that query stands. */
  const [smart, setSmart] = useState<{ query: string; apps: AppItem[]; games: RecentItem[] } | null>(null)
  const [asking, setAsking] = useState(false)
  const asked = useRef(0)

  useEffect(() => {
    loadGames([...arrangement.bar, ...arrangement.more]).then((loaded) => {
      setGames(loaded)
      window.steamtv.setVoiceHints([...apps.map((a) => a.name), ...loaded.map((g) => g.title)])
    })
  }, [arrangement, apps])

  useEffect(() => {
    if (voice?.phase === 'listening') play('move')
    if (voice?.phase !== 'heard') return
    const heard = parseQuery(voice.text)
    startWhenFound.current = heard.start
    askClaude.current = true
    asked.current++
    setSmart(null)
    setAsking(false)
    setQuery(heard.query)
  }, [voice])

  // The music and ambience pause while search is open: the mic would hear them over you.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(MUSIC_HOLD_EVENT, { detail: true }))
    return () => void window.dispatchEvent(new CustomEvent(MUSIC_HOLD_EVENT, { detail: false }))
  }, [])

  // B closes search, but not while the keyboard is up (B there closes just the keyboard).
  useEffect(() => {
    if (typing) return
    const onBack = (): void => onClose()
    window.addEventListener(TRAP_CLOSE_EVENT, onBack)
    return () => window.removeEventListener(TRAP_CLOSE_EVENT, onBack)
  }, [onClose, typing])

  const nameApps = query ? search(query, apps, (a) => a.name) : []
  const nameGames = query && games ? search(query, games, (g) => g.title) : []
  const useSmart = smart !== null && smart.query === query
  const appResults = useSmart ? smart.apps.map((thing) => ({ thing, score: 100 })) : nameApps
  const gameResults = useSmart ? smart.games.map((thing) => ({ thing, score: 100 })) : nameGames

  const startApp = (app: AppItem): void => startLaunch('app', app.id, app.name, `${app.name} isn't set up yet`)
  const startGame = (game: RecentItem): void => startLaunch('recent', game.id, game.title, `Can't launch ${game.title}`)

  // Once the library's in: asked to start something, the best name match if nothing else comes
  // close. Spoken and not settled that way: Claude's turn (when it's set up on the box).
  useEffect(() => {
    if (!games || !query) return
    const start = startWhenFound.current
    startWhenFound.current = false
    if (start) {
      const all = [...nameApps.map((r) => ({ score: r.score, start: () => startApp(r.thing) })), ...nameGames.map((r) => ({ score: r.score, start: () => startGame(r.thing) }))].sort(
        (a, b) => b.score - a.score
      )
      if (clearWinner(all)) {
        askClaude.current = false
        all[0].start()
        onClose()
        return
      }
    }
    if (!askClaude.current) return
    askClaude.current = false
    const ask = ++asked.current
    const spoken = query
    // One line each, apps then games, in a steady order (so Claude's prompt cache serves the next search).
    const library = [...apps.map((a) => `${a.name} (app)`), ...games.map((g) => `${g.title} (${g.platform})`)]
    setAsking(true)
    void window.steamtv
      .smartSearch(spoken, library)
      .catch(() => null)
      .then((found) => {
        if (ask !== asked.current) return
        setAsking(false)
        if (!found?.picks.length) return
        const pickedApps = found.picks.filter((n) => n < apps.length).map((n) => apps[n])
        const pickedGames = found.picks.filter((n) => n >= apps.length).map((n) => games[n - apps.length])
        if (start && found.start) {
          const first = found.picks[0]
          if (first < apps.length) startApp(apps[first])
          else startGame(games[first - apps.length])
          onClose()
          return
        }
        setSmart({ query: spoken, apps: pickedApps, games: pickedGames })
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [games, query])

  // The cursor goes to the best result when results change, or the mic when there are none.
  const resultKey = [...appResults.map((r) => r.thing.id), ...gameResults.map((r) => r.thing.id)].join('|')
  useEffect(() => {
    if (typing) return
    const first = root.current?.querySelector<HTMLElement>('.search-results [data-focusable]') ?? root.current?.querySelector<HTMLElement>('.search-mic')
    if (first) focus(first)
  }, [resultKey, typing])

  const listening = voice && (voice.phase === 'starting' || voice.phase === 'preparing' || voice.phase === 'listening' || voice.phase === 'thinking')
  const status = voice?.phase === 'error' ? voice.message : voice ? STATUS[voice.phase] : ''
  // While Claude looks, nothing found by name isn't "nothing" yet.
  const empty = query && games && !asking && !appResults.length && !gameResults.length
  const found = appResults.length + gameResults.length
  // Working it out (what was said, the library, or Claude): the loading animation, mid-screen.
  const loading = voice?.phase === 'thinking' || (!!query && (!games || asking))
  const statusLine = query && status ? status : voice?.phase === 'error' && !query ? status : found ? `${found} ${found === 1 ? 'result' : 'results'}` : ' '

  // The cursor doesn't scroll anything itself: the results follow it, its row in the middle.
  const results = useRef<HTMLDivElement>(null)
  const follow = (event: React.FocusEvent<HTMLDivElement>): void => {
    const box = results.current
    if (!box) return
    let top = 0
    for (let el: HTMLElement | null = event.target as HTMLElement; el && el !== box; el = el.offsetParent as HTMLElement | null) top += el.offsetTop
    box.scrollTop = top - (box.clientHeight - (event.target as HTMLElement).offsetHeight) / 2
  }

  return (
    // The keyboard keeps the cursor while it's up, so this lets go of it meanwhile.
    <div className="search-app" ref={root} {...(typing ? {} : { 'data-focus-trap': '' })}>
      <div className="settings-scrim" aria-hidden="true" />
      <div className="search-content">
        <div className="search-bar">
          <button
            className={`search-mic${listening ? ` ${voice!.phase}` : ''}`}
            tabIndex={-1}
            data-focusable=""
            aria-label="Speak"
            onClick={() => {
              if (!listening) window.steamtv.startVoice()
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
            </svg>
          </button>
          <div className={`search-field${query ? '' : ' empty'}`}>
            {/* Its own line, so a long one ends in "…" (a flex box's bare text won't). */}
            <span className="search-field-text">{query || (listening ? status : 'Say or type a game or app')}</span>
          </div>
          <button className="search-type display" tabIndex={-1} data-focusable="" data-select-sound="move" onClick={() => setTyping(true)}>
            Type
          </button>
        </div>
        <p className="search-status">{statusLine}</p>
        {/* Starting something from here closes search (the click reaches here after the card's own). */}
        <div className="search-results" ref={results} onClick={onClose} onFocus={follow}>
          {appResults.length > 0 && (
            <section>
              <h2 className="section-label display">Apps</h2>
              <div className="search-apps">
                {appResults.map((r) => (
                  <AppTile key={r.thing.id} app={r.thing} isDefault={false} />
                ))}
              </div>
            </section>
          )}
          {gameResults.length > 0 && <CollectionGrid title="Games" items={gameResults.map((r) => r.thing)} logos={logos} memoryKey="search" hasDefault={false} />}
          {empty && <p className="empty-note">Nothing called “{query}”.</p>}
        </div>
      </div>
      {loading && (
        <div className="search-loading" aria-label="Searching">
          <Spinner />
        </div>
      )}
      {typing && (
        <OnScreenKeyboard
          title="Search"
          initial={query}
          showField={false}
          onChange={setQuery}
          onDone={(text) => {
            setTyping(false)
            setQuery(text.trim())
          }}
          onCancel={() => setTyping(false)}
        />
      )}
    </div>
  )
}
