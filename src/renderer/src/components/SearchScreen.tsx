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
import { OnScreenKeyboard } from './Keyboard'

// Search: every game in the tabs and every app, by name. A remote's Menu tapped opens it
// listening (voice search); the mic here listens again, and Type opens the on-screen
// keyboard. "Play X" or "Open X" starts the best match when it's a clear one.

/** Opens the search screen (detail: the element to come back to). */
export const SEARCH_EVENT = 'steamtv:search'

const MAX_GAMES = 8
const MAX_APPS = 4
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
  amiga: () => window.steamtv.getAmigaTab(),
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
export function SearchScreen({ apps }: { apps: AppItem[] }) {
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

  return open ? <Search apps={apps} voice={voice} onClose={close} /> : null
}

function Search({ apps, voice, onClose }: { apps: AppItem[]; voice: VoiceState | null; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const arrangement = useTabArrangement()
  const [games, setGames] = useState<RecentItem[] | null>(null)
  const [query, setQuery] = useState('')
  const [typing, setTyping] = useState(false)
  // A spoken "play X" waits for the library, then starts X if it's a clear match.
  const startWhenFound = useRef(false)

  useEffect(() => {
    loadGames([...arrangement.bar, ...arrangement.more]).then((loaded) => {
      setGames(loaded)
      window.steamtv.setVoiceHints([...apps.map((a) => a.name), ...loaded.map((g) => g.title)])
    })
  }, [arrangement, apps])

  useEffect(() => {
    if (voice?.phase === 'listening') play('move')
    if (voice?.phase !== 'heard') return
    const asked = parseQuery(voice.text)
    startWhenFound.current = asked.start
    setQuery(asked.query)
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

  const appResults = query ? search(query, apps, (a) => a.name).slice(0, MAX_APPS) : []
  const gameResults = query && games ? search(query, games, (g) => g.title).slice(0, MAX_GAMES) : []

  // Asked to start something: the best match of all, if nothing else comes close.
  useEffect(() => {
    if (!startWhenFound.current || !games || !query) return
    startWhenFound.current = false
    const all = [
      ...appResults.map((r) => ({ score: r.score, start: () => startLaunch('app', r.thing.id, r.thing.name, `${r.thing.name} isn't set up yet`) })),
      ...gameResults.map((r) => ({ score: r.score, start: () => startLaunch('recent', r.thing.id, r.thing.title, `Can't launch ${r.thing.title}`) }))
    ].sort((a, b) => b.score - a.score)
    if (clearWinner(all)) {
      all[0].start()
      onClose()
    }
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
  const empty = query && games && !appResults.length && !gameResults.length

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
          <div className={`search-field${query ? '' : ' empty'}`}>{query || (listening ? status : 'Say or type a game or app')}</div>
          <button className="search-type display" tabIndex={-1} data-focusable="" data-select-sound="move" onClick={() => setTyping(true)}>
            Type
          </button>
        </div>
        <p className="search-status">{query && status ? status : voice?.phase === 'error' && !query ? status : ' '}</p>
        {/* Starting something from here closes search (the click reaches here after the card's own). */}
        <div className="search-results" onClick={onClose}>
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
          {gameResults.length > 0 && <CollectionGrid title="Games" items={gameResults.map((r) => r.thing)} memoryKey="search" hasDefault={false} />}
          {empty && <p className="empty-note">Nothing called “{query}”.</p>}
          {query && !games && <p className="empty-note">Looking through your games…</p>}
        </div>
      </div>
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
