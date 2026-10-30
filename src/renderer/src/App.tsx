import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import type { BackdropStyle, CustomBackdrop } from '../../shared/types'
import { CustomBackground } from './background/CustomBackground'
import type { HomeData } from '../../shared/types'
import { DriftBackground } from './background/DriftBackground'
import { StarTunnelBackground, type TunnelColors } from './background/StarTunnelBackground'
import { ForestBackground } from './background/ForestBackground'
import { CityRainBackground } from './background/CityRainBackground'
import { AuroraBackground } from './background/AuroraBackground'
import { WavesBackground } from './background/WavesBackground'
import { RainBackground } from './background/RainBackground'
import { BACKDROP_CHANGED_EVENT, SeaBackground } from './background/SeaBackground'
import { BACK_EVENT, FAVORITE_EVENT, focus, focusDefault, SETTINGS_EVENT, TAB_EVENT } from './input/focus'
import { play } from './input/sounds'
import { HOME_CHANGED_EVENT } from './screens/Settings'
import { tabOrder } from './availableTabs'
import { BackgroundMusic } from './components/BackgroundMusic'
import { LaunchOverlay } from './components/LaunchOverlay'
import { ArtworkDialog } from './components/ArtworkDialog'
import { RepairDialog } from './components/RepairDialog'
import { UpdateDialog } from './components/UpdateDialog'
import { Intro } from './components/Intro'
import { AppSetupDialog } from './components/AppSetupDialog'
import { Welcome } from './components/Welcome'
import { FilesApp } from './components/FilesApp'
import { SearchScreen } from './components/SearchScreen'
import { BugReportDialog } from './components/BugReportDialog'
import { GuideReader } from './components/GuideReader'
import { ControlsGuide } from './components/ControlsGuide'
import { GameDialog } from './components/GameDialog'
import { Screensaver } from './components/Screensaver'
import { SleepPrompt } from './components/SleepPrompt'
import { type Screen } from './components/NavBar'
import { toast, Toast } from './components/Toast'
import { VolumeOsd } from './components/VolumeOsd'
import { Apps } from './screens/Apps'
import { Home } from './screens/Home'
import { Settings } from './screens/Settings'
import { Library } from './screens/Library'
import { STAGE_W, stageHeight } from './stage'

/** Recents also reload whenever the window regains focus, e.g. on returning from a game. */
const HOME_REFRESH = 5 * 60 * 1000
/** Shown only when the WebGL background can't run. */
const FALLBACK_BACKGROUND = 'fixtures/background.jpg'

/**
 * The stage (see stage.ts) scaled to fit the window, and centred: a screen wider than
 * 16:9 gets even bars at the sides. A taller one (the Steam Deck's) gets a taller stage.
 */
function useStageFit(): { scale: number; x: number; y: number; height: number } {
  const measure = (): { scale: number; x: number; y: number; height: number } => {
    const height = stageHeight()
    const scale = Math.min(window.innerWidth / STAGE_W, window.innerHeight / height)
    return { scale, height, x: Math.round((window.innerWidth - STAGE_W * scale) / 2), y: Math.round((window.innerHeight - height * scale) / 2) }
  }
  const [fit, setFit] = useState(measure)
  useEffect(() => {
    const onResize = (): void => setFit(measure())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return fit
}

export function App() {
  const fit = useStageFit()
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
  const [custom, setCustom] = useState<{ items: CustomBackdrop[]; start: string; shuffle: boolean } | null>(null)
  // If another backdrop can't run, the sea stands in.
  const backdropUnavailable = useCallback(() => setBackdrop('sea'), [])

  useEffect(() => {
    const load = (): void => {
      window.steamtv.getBackdrop().then(({ style, drift, driftDirection, tunnelColors, custom }) => {
        setTunnelColors(tunnelColors)
        setCustom(custom)
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
      // Failing, Home keeps what it showed (it tries again on the next refresh); logged, as "steamtv:" lines are.
      window.steamtv.getHome().then(setHome, (err: unknown) => console.error('steamtv: home:', err))
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
      // Only the tabs on show, in the bar's order then More's, so L1/R1 skips empty ones.
      const order = tabOrder() as Screen[]
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
    <div className={`stage${backdrop === 'rain' && webgl ? ' backdrop-rain' : ''}`} style={{ transform: `translate(${fit.x}px, ${fit.y}px) scale(${fit.scale})`, ['--stage-h' as string]: `${fit.height}px` }}>
      {backdrop === 'custom' && custom ? (
        // Your own picture or video needs no WebGL.
        <CustomBackground items={custom.items} start={custom.start} shuffle={custom.shuffle} />
      ) : !webgl ? (
        <div className="stage-bg" style={fallback} />
      ) : backdrop === 'rain' ? (
        <RainBackground onUnavailable={backdropUnavailable} />
      ) : backdrop === 'cityrain' ? (
        <CityRainBackground onUnavailable={backdropUnavailable} />
      ) : backdrop === 'forest' ? (
        <ForestBackground onUnavailable={backdropUnavailable} />
      ) : backdrop === 'aurora' ? (
        <AuroraBackground onUnavailable={backdropUnavailable} />
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
      {screen === 'xbox' && home && (
        <Library
          screen="xbox"
          load={window.steamtv.getXboxTab}
          empty="No Xbox games found. vaporTV looks in your EmuDeck roms/xbox folder."
          onFavorite={window.steamtv.toggleFavorite}
          logos={home.platformLogos}
          onNavigate={setScreen}
        />
      )}
      {screen === 'ps2' && home && (
        <Library
          screen="ps2"
          load={window.steamtv.getPs2Tab}
          empty="No PS2 games found. vaporTV looks in your EmuDeck roms/ps2 folder."
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
      {screen === 'wii' && home && (
        <Library
          screen="wii"
          load={window.steamtv.getWiiTab}
          empty="No Wii games found. vaporTV looks in your EmuDeck roms/wii folder."
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
      {screen === 'saturn' && home && (
        <Library
          screen="saturn"
          load={window.steamtv.getSaturnTab}
          empty="No Saturn games found. vaporTV looks in your EmuDeck roms/saturn folder."
          onFavorite={window.steamtv.toggleFavorite}
          logos={home.platformLogos}
          onNavigate={setScreen}
        />
      )}
      {screen === 'n64' && home && (
        <Library
          screen="n64"
          load={window.steamtv.getN64Tab}
          empty="No N64 games found. vaporTV looks in your EmuDeck roms/n64 folder."
          onFavorite={window.steamtv.toggleFavorite}
          logos={home.platformLogos}
          onNavigate={setScreen}
        />
      )}
      {screen === 'wiiu' && home && (
        <Library
          screen="wiiu"
          load={window.steamtv.getWiiUTab}
          empty="No Wii U games found. vaporTV looks in your EmuDeck roms/wiiu folder."
          onFavorite={window.steamtv.toggleFavorite}
          logos={home.platformLogos}
          onNavigate={setScreen}
        />
      )}
      {screen === 'psx' && home && (
        <Library
          screen="psx"
          load={window.steamtv.getPsxTab}
          empty="No PSX games found. vaporTV looks in your EmuDeck roms/psx folder."
          onFavorite={window.steamtv.toggleFavorite}
          logos={home.platformLogos}
          onNavigate={setScreen}
        />
      )}
      {screen === 'psp' && home && (
        <Library
          screen="psp"
          load={window.steamtv.getPspTab}
          empty="No PSP games found. vaporTV looks in your EmuDeck roms/psp folder."
          onFavorite={window.steamtv.toggleFavorite}
          logos={home.platformLogos}
          onNavigate={setScreen}
        />
      )}
      {screen === 'nes' && home && (
        <Library
          screen="nes"
          load={window.steamtv.getNesTab}
          empty="No NES games found. vaporTV looks in your EmuDeck roms/nes folder."
          onFavorite={window.steamtv.toggleFavorite}
          logos={home.platformLogos}
          onNavigate={setScreen}
        />
      )}
      {screen === 'snes' && home && (
        <Library
          screen="snes"
          load={window.steamtv.getSnesTab}
          empty="No SNES games found. vaporTV looks in your EmuDeck roms/snes folder."
          onFavorite={window.steamtv.toggleFavorite}
          logos={home.platformLogos}
          onNavigate={setScreen}
        />
      )}
      {screen === 'genesis' && home && (
        <Library
          screen="genesis"
          load={window.steamtv.getGenesisTab}
          empty="No Genesis games found. vaporTV looks in your EmuDeck roms/genesis folder."
          onFavorite={window.steamtv.toggleFavorite}
          logos={home.platformLogos}
          onNavigate={setScreen}
        />
      )}
      {screen === 'sega32x' && home && (
        <Library
          screen="sega32x"
          load={window.steamtv.getSega32xTab}
          empty="No 32X games found. vaporTV looks in your EmuDeck roms/sega32x folder."
          onFavorite={window.steamtv.toggleFavorite}
          logos={home.platformLogos}
          onNavigate={setScreen}
        />
      )}
      {screen === 'amiga' && home && (
        <Library
          screen="amiga"
          load={window.steamtv.getAmigaTab}
          empty="No Amiga games found. vaporTV looks in your EmuDeck roms/amiga folder."
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
      <FilesApp />
      <SearchScreen apps={home?.allApps ?? []} />
      <LaunchOverlay />
      <SleepPrompt />
      <ArtworkDialog />
      <GameDialog />
      <UpdateDialog />
      <RepairDialog />
      <BugReportDialog />
      <GuideReader />
      <AppSetupDialog apps={home?.allApps ?? []} />
      <Welcome />
      <Screensaver />
      <BackgroundMusic />
      <Intro />
      <VolumeOsd />
      <Toast />
      <ControlsGuide />
    </div>
  )
}
