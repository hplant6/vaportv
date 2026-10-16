import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import type { BackdropStyle } from '../../shared/types'
import type { HomeData } from '../../shared/types'
import { RainBackground } from './background/RainBackground'
import { BACKDROP_CHANGED_EVENT, SeaBackground } from './background/SeaBackground'
import { BACK_EVENT, focus, focusDefault, TAB_EVENT } from './input/focus'
import { HOME_CHANGED_EVENT } from './screens/Settings'
import { tabShown } from './availableTabs'
import { BackgroundMusic } from './components/BackgroundMusic'
import { LaunchOverlay } from './components/LaunchOverlay'
import { Screensaver } from './components/Screensaver'
import { SleepPrompt } from './components/SleepPrompt'
import { TAB_ORDER, type Screen } from './components/NavBar'
import { Toast } from './components/Toast'
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
  const [webgl, setWebgl] = useState(true)
  const disableWebgl = useCallback(() => setWebgl(false), [])
  // Null until the setting loads, so the sea doesn't flash up before another backdrop.
  const [backdrop, setBackdrop] = useState<BackdropStyle | null>(null)
  // If another backdrop can't run, the sea stands in.
  const backdropUnavailable = useCallback(() => setBackdrop('sea'), [])

  useEffect(() => {
    const load = (): void => {
      window.steamtv.getBackdrop().then(({ style }) => setBackdrop(style))
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

  // L1/R1 step to the previous or next tab, wrapping around at the ends.
  useEffect(() => {
    const onTab = (event: Event): void => {
      const step = (event as CustomEvent<number>).detail
      setScreen((current) => {
        // Only the tabs on show, so L1/R1 skips empty ones.
        const order = TAB_ORDER.filter((s) => tabShown(s) || s === current)
        const i = order.indexOf(current)
        return order[(i + step + order.length) % order.length]
      })
    }
    window.addEventListener(TAB_EVENT, onTab)
    return () => window.removeEventListener(TAB_EVENT, onTab)
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
      {screen === 'apps' && home && <Apps apps={[...home.apps, ...home.moreApps]} onNavigate={setScreen} />}
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
      {screen === 'settings' && <Settings onNavigate={setScreen} />}
      <LaunchOverlay />
      <SleepPrompt />
      <Screensaver />
      <BackgroundMusic />
      <Toast />
    </div>
  )
}
