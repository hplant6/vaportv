import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import type { BackdropStyle } from '../../shared/types'
import type { HomeData } from '../../shared/types'
import { DriftBackground } from './background/DriftBackground'
import { StarTunnelBackground, type TunnelColors } from './background/StarTunnelBackground'
import { WavesBackground } from './background/WavesBackground'
import { RainBackground } from './background/RainBackground'
import { BACKDROP_CHANGED_EVENT, SeaBackground } from './background/SeaBackground'
import { BACK_EVENT, FAVORITE_EVENT, focus, focusDefault, SETTINGS_EVENT, TAB_EVENT } from './input/focus'
import { play } from './input/sounds'
import { HOME_CHANGED_EVENT } from './screens/Settings'
import { tabShown } from './availableTabs'
import { BackgroundMusic } from './components/BackgroundMusic'
import { LaunchOverlay } from './components/LaunchOverlay'
import { ArtworkDialog } from './components/ArtworkDialog'
import { UpdateDialog } from './components/UpdateDialog'
import { AppSetupDialog } from './components/AppSetupDialog'
import { Welcome } from './components/Welcome'
import { CoreDialog } from './components/CoreDialog'
import { Screensaver } from './components/Screensaver'
import { SleepPrompt } from './components/SleepPrompt'
import { TAB_ORDER, type Screen } from './components/NavBar'
import { toast, Toast } from './components/Toast'
import { VolumeOsd } from './components/VolumeOsd'
import { Apps } from './screens/Apps'
import { Home } from './screens/Home'
import { Settings } from './screens/Settings'
import { Library } from './screens/Library'

const STAGE_W = 1920
const STAGE_H = 1080
/** Recents also reload whenever the window regains focus, e.g. on returning from a game. */
const HOME_REFRESH = 5 * 60 * 1000
/** Shown only when the WebGL background can't run. */
const FALLBACK_BACKGROUND = 'fixtures/background.jpg'

function useStageScale(): number {
  const measure = (): number => Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H)
  const [scale, setScale] = useState(measure)
  useEffect(() => {
    const onResize = (): void => setScale(measure())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return scale
}

export function App() {
  const scale = useStageScale()
  const [home, setHome] = useState<HomeData | null>(null)
  const [screen, setScreen] = useState<Screen>('home')
  const screenRef = useRef(screen)
  screenRef.current = screen
  const [webgl, setWebgl] = useState(true)
  const disableWebgl = useCallback(() => setWebgl(false), [])
  // Null until the setting loads, so the sea doesn't flash up before another backdrop.
  const [backdrop, setBackdrop] = useState<BackdropStyle | null>(null)
  const [driftPreset, setDriftPreset] = useState('molten')
  const [driftDirection, setDriftDirection] = useState<'vertical' | 'horizontal'>('vertical')
  const [tunnelColors, setTunnelColors] = useState<TunnelColors>('nebula')
  // If another backdrop can't run, the sea stands in.
  const backdropUnavailable = useCallback(() => setBackdrop('sea'), [])

  useEffect(() => {
    const load = (): void => {
      window.steamtv.getBackdrop().then(({ style, drift, driftDirection, tunnelColors }) => {
        setTunnelColors(tunnelColors)
        setBackdrop(style)
        setDriftPreset(drift)
        setDriftDirection(driftDirection)
      })
    }
    load()
    window.addEventListener(BACKDROP_CHANGED_EVENT, load)
    return () => window.removeEventListener(BACKDROP_CHANGED_EVENT, load)
  }, [])

  useEffect(() => {
    const load = (): void => {
      window.steamtv.getHome().then(setHome)
    }
    load()
    const timer = setInterval(load, HOME_REFRESH)
    window.addEventListener('focus', load)
    window.addEventListener(HOME_CHANGED_EVENT, load)
    const offArt = window.steamtv.onArtUpdated(load)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', load)
      window.removeEventListener(HOME_CHANGED_EVENT, load)
      offArt()
    }
  }, [])

  // Y on an app tile (Apps tab or Home) adds it to Favorite Apps or takes it off.
  useEffect(() => {
    const onFavorite = (event: Event): void => {
      const tile = (event as CustomEvent<HTMLElement>).detail
      const id = tile.dataset.appId
      if (!id) return
      const name = tile.getAttribute('aria-label') ?? 'App'
      // Taken off Home, its tile goes: the cursor moves to a neighbour.
      const neighbour = (tile.nextElementSibling ?? tile.previousElementSibling) as HTMLElement | null
      const neighbourId = neighbour?.dataset.appId
      window.steamtv.toggleFavoriteApp(id).then((on) => {
        play(on ? 'favorite' : 'move')
        toast(on ? `Added ${name} to Favorite Apps` : `Removed ${name} from Favorite Apps`)
        window.steamtv.getHome().then((data) => {
          setHome(data)
          requestAnimationFrame(() => {
            if (tile.isConnected) return
            const next = neighbourId && document.querySelector<HTMLElement>(`.app-tile[data-app-id="${neighbourId}"]`)
            if (next) focus(next)
            else focusDefault()
          })
        })
      })
    }
    window.addEventListener(FAVORITE_EVENT, onFavorite)
    return () => window.removeEventListener(FAVORITE_EVENT, onFavorite)
  }, [])

  // Back from any other screen returns Home.
  useEffect(() => {
    const onBack = (): void => {
      // Inside a pane that has its own way back (Settings' categories), B goes there first.
      const backTo = document.activeElement?.closest<HTMLElement>('[data-back-focus]')?.dataset.backFocus
      const target = backTo ? document.querySelector<HTMLElement>(backTo) : null
      if (target) focus(target)
      else setScreen('home')
    }
    window.addEventListener(BACK_EVENT, onBack)
    return () => window.removeEventListener(BACK_EVENT, onBack)
  }, [])

  // L1/R1 step to the previous or next tab, in the bar's order. Past the rightmost tab
  // they stop on the power button (at the right end) before wrapping round to Settings.
  useEffect(() => {
    const onTab = (event: Event): void => {
      const step = (event as CustomEvent<number>).detail
      const current = screenRef.current
      // Only the tabs on show, so L1/R1 skips empty ones.
      const order = TAB_ORDER.filter((s) => tabShown(s) || s === current)
      const power = document.getElementById('power-button')
      const onPower = !!power && document.activeElement === power
      const i = onPower ? (step > 0 ? -1 : order.length) : order.indexOf(current)
      const next = i + step
      if (power && !onPower && (next < 0 || next >= order.length)) {
        focus(power)
        return
      }
      const target = order[(next + order.length) % order.length]
      if (onPower) {
        // Off the power button: the screen's own default focus takes over.
        power.blur()
        if (target === current) focusDefault()
      }
      setScreen(target)
    }
    window.addEventListener(TAB_EVENT, onTab)
    return () => window.removeEventListener(TAB_EVENT, onTab)
  }, [])

  // A remote's Menu key: Settings, and from Settings back Home.
  useEffect(() => {
    const onSettings = (): void => {
      // Off whatever has the cursor (the nav bar stays put): the screen's default takes over.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      setScreen((current) => (current === 'settings' ? 'home' : 'settings'))
    }
    window.addEventListener(SETTINGS_EVENT, onSettings)
    return () => window.removeEventListener(SETTINGS_EVENT, onSettings)
  }, [])

  // Cards are keyed by id, so a refresh keeps focus where it was unless the
  // focused card went away.
  useEffect(() => {
    if (home && !document.activeElement?.matches('[data-focusable]')) focusDefault()
  }, [home, screen])

  // Set inline so the URL resolves against the page, not the bundled stylesheet.
  const fallback: CSSProperties = { backgroundImage: `url("${FALLBACK_BACKGROUND}")` }

  return (
    <div className={`stage${backdrop === 'rain' && webgl ? ' backdrop-rain' : ''}`} style={{ transform: `scale(${scale})` }}>
      {!webgl ? (
        <div className="stage-bg" style={fallback} />
      ) : backdrop === 'rain' ? (
        <RainBackground onUnavailable={backdropUnavailable} />
      ) : backdrop === 'waves' ? (
        <WavesBackground onUnavailable={backdropUnavailable} />
      ) : backdrop === 'tunnel' ? (
        <StarTunnelBackground colors={tunnelColors} onUnavailable={backdropUnavailable} />
      ) : backdrop === 'drift' ? (
        <DriftBackground preset={driftPreset} direction={driftDirection} onUnavailable={backdropUnavailable} />
      ) : (
        backdrop === 'sea' && <SeaBackground onUnavailable={disableWebgl} />
      )}
      <div className="stage-scrim" />
      {screen === 'home' && home && <Home data={home} onNavigate={setScreen} />}
      {screen === 'steam' && home && (
        <Library
          screen="steam"
          load={window.steamtv.getSteamTab}
          empty="No collections chosen. Pick which ones show here in Settings."
          logos={home.platformLogos}
          onNavigate={setScreen}
        />
      )}
      {screen === 'apps' && home && <Apps apps={home.allApps} onNavigate={setScreen} />}
      {screen === 'switch' && home && (
        <Library
          screen="switch"
          load={window.steamtv.getSwitchTab}
          onFavorite={window.steamtv.toggleFavorite}
          empty="No Switch games found. vaporTV looks in your EmuDeck roms/switch folder."
          logos={home.platformLogos}
          onNavigate={setScreen}
        />
      )}
      {screen === 'ps3' && home && (
        <Library
          screen="ps3"
          load={window.steamtv.getPs3Tab}
          empty="No PS3 games found. They're read from RPCS3's game folders."
          onFavorite={window.steamtv.toggleFavorite}
          logos={home.platformLogos}
          onNavigate={setScreen}
        />
      )}
      {screen === 'xbox360' && home && (
        <Library
          screen="xbox360"
          load={window.steamtv.getXbox360Tab}
          empty="No Xbox 360 games found. vaporTV looks in your EmuDeck roms/xbox360/roms folder."
          onFavorite={window.steamtv.toggleFavorite}
          logos={home.platformLogos}
          onNavigate={setScreen}
        />
      )}
      {screen === 'gamecube' && home && (
        <Library
          screen="gamecube"
          load={window.steamtv.getGameCubeTab}
          empty="No GameCube games found. vaporTV looks in your EmuDeck roms/gc folder."
          onFavorite={window.steamtv.toggleFavorite}
          logos={home.platformLogos}
          onNavigate={setScreen}
        />
      )}
      {screen === 'dreamcast' && home && (
        <Library
          screen="dreamcast"
          load={window.steamtv.getDreamcastTab}
          empty="No Dreamcast games found. vaporTV looks in your EmuDeck roms/dreamcast folder."
          onFavorite={window.steamtv.toggleFavorite}
          logos={home.platformLogos}
          onNavigate={setScreen}
        />
      )}
      {screen === 'arcade' && home && (
        <Library
          screen="arcade"
          load={window.steamtv.getArcadeTab}
          empty="No arcade games to show. vaporTV looks in your EmuDeck roms folders (atomiswave, naomi, naomi2, cps, neogeo and arcade), and shows the carousels turned on in Settings → Consoles."
          onFavorite={window.steamtv.toggleFavorite}
          logos={home.platformLogos}
          onNavigate={setScreen}
        />
      )}
      {screen === 'settings' && <Settings onNavigate={setScreen} />}
      <LaunchOverlay />
      <SleepPrompt />
      <ArtworkDialog />
      <CoreDialog />
      <UpdateDialog />
      <AppSetupDialog apps={home?.allApps ?? []} />
      <Welcome />
      <Screensaver />
      <BackgroundMusic />
      <VolumeOsd />
      <Toast />
    </div>
  )
}
