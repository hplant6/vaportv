import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { BackdropStyle, BackdropTime, LayoutTab, RecentsTab, ScreensaverSources, ScreensaverStyle, MusicVolume, Settings as SettingsData, SteamCollection, SteamLayout } from '../../../shared/types'
import { MUSIC_CHANGED_EVENT } from '../components/BackgroundMusic'
import { BACKDROP_CHANGED_EVENT } from '../background/SeaBackground'
import { ControlsSettings } from '../components/ControlsSettings'
import { GooglePhotosSettings } from '../components/GooglePhotos'
import { SCREENSAVER_EVENT } from '../components/Screensaver'
import { SLEEP_SETTING_EVENT } from '../components/SleepPrompt'
import { Clock } from '../components/Clock'
import { DateWeather } from '../components/DateWeather'
import { NavBar, type Screen } from '../components/NavBar'
import { focus, focusContentDefault } from '../input/focus'
import { usePageScroll } from './usePageScroll'

function CollectionRow({
  collection,
  on,
  onToggle
}: {
  collection: SteamCollection
  on: boolean
  onToggle: () => void
}) {
  // Some dynamic collections use Steam filters vaporTV can't apply yet.
  const usable = collection.supported
  return (
    <button
      className={`setting-row${on ? ' on' : ''}${usable ? '' : ' unavailable'}`}
      tabIndex={-1}
      role="switch"
      aria-checked={on}
      aria-label={collection.name}
      {...(usable ? { 'data-focusable': '', 'data-select-sound': 'move' } : {})}
      onClick={usable ? onToggle : undefined}
    >
      <span className="toggle" aria-hidden="true">
        <span className="toggle-knob" />
      </span>
      <span className="setting-name display">{collection.name}</span>
      <span className="setting-detail">
        {!usable
          ? 'Steam filter · not supported yet'
          : `${collection.count} ${collection.dynamic ? 'installed ' : ''}game${collection.count === 1 ? '' : 's'}`}
      </span>
    </button>
  )
}

const LAYOUTS: { id: SteamLayout; name: string; detail: string }[] = [
  { id: 'rows', name: 'Rows', detail: 'Poster art · scroll sideways' },
  { id: 'grid', name: 'Grid', detail: 'Wide art · scroll down' }
]

function LayoutRow({
  layout,
  selected,
  isDefault = false,
  onSelect
}: {
  layout: (typeof LAYOUTS)[number]
  selected: boolean
  isDefault?: boolean
  onSelect: () => void
}) {
  return (
    <button
      className={`setting-row${selected ? ' on' : ''}`}
      tabIndex={-1}
      role="radio"
      aria-checked={selected}
      aria-label={`${layout.name} layout`}
      data-focusable=""
      data-select-sound="move"
      {...(isDefault ? { 'data-focus-default': '' } : {})}
      onClick={onSelect}
    >
      <span className="radio" aria-hidden="true" />
      <span className="setting-name display">{layout.name}</span>
      <span className="setting-detail">{layout.detail}</span>
    </button>
  )
}

function KeyRow({ hint, onSave }: { hint: string | null; onSave: (key: string) => void }) {
  const [editing, setEditing] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) input.current?.focus()
  }, [editing])

  if (editing) {
    return (
      <input
        ref={input}
        className="setting-row setting-input"
        data-focusable=""
        placeholder="Paste or type your SteamGridDB API key, then Enter"
        aria-label="SteamGridDB API key"
        spellCheck={false}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            onSave(event.currentTarget.value)
            setEditing(false)
          } else if (event.key === 'Escape') {
            setEditing(false)
          }
        }}
        onBlur={() => setEditing(false)}
      />
    )
  }
  return (
    <button
      className="setting-row"
      tabIndex={-1}
      aria-label="SteamGridDB API key"
      data-focusable=""
      data-select-sound="move"
      onClick={() => setEditing(true)}
    >
      <span className="setting-name display">API key</span>
      <span className="setting-detail">{hint ? `Set · ends in ${hint} · A to change` : 'Not set · A to add'}</span>
    </button>
  )
}

/** Rows / Grid for one screen's Recents. */
function RecentsChoice({
  tab,
  value,
  onChoose
}: {
  tab: RecentsTab
  value: SteamLayout
  onChoose: (tab: RecentsTab, layout: SteamLayout) => void
}) {
  return (
    <>
      <p className="settings-help">{tab === 'home' ? 'How Home shows Recents.' : 'Recently played:'}</p>
      <div className="setting-list" data-focus-memory={`settings-recents-${tab}`}>
        {LAYOUTS.map((layout) => (
          <LayoutRow key={layout.id} layout={layout} selected={value === layout.id} onSelect={() => onChoose(tab, layout.id)} />
        ))}
      </div>
    </>
  )
}

/** Rows / Grid for one tab. */
function LayoutChoice({
  tab,
  value,
  isDefault = false,
  onChoose
}: {
  tab: LayoutTab
  value: SteamLayout
  isDefault?: boolean
  onChoose: (tab: LayoutTab, layout: SteamLayout) => void
}) {
  return (
    <div className="setting-list" data-focus-memory={`settings-layout-${tab}`}>
      {LAYOUTS.map((layout, i) => (
        <LayoutRow
          key={layout.id}
          layout={layout}
          selected={value === layout.id}
          isDefault={isDefault && i === 0}
          onSelect={() => onChoose(tab, layout.id)}
        />
      ))}
    </div>
  )
}

const VOLUMES: { id: MusicVolume; name: string }[] = [
  { id: 'low', name: 'Low' },
  { id: 'medium', name: 'Medium' },
  { id: 'high', name: 'High' }
]

/** Fired after a setting that changes Home, so it reloads. */
export const HOME_CHANGED_EVENT = 'steamtv:home-changed'

const FAVORITES_LAYOUTS: { id: SteamLayout; name: string; detail: string }[] = [
  { id: 'rows', name: 'Carousel', detail: 'One row · scroll sideways' },
  { id: 'grid', name: 'Grid', detail: 'Two rows · scroll down' }
]

type Category = 'home' | 'steam' | 'consoles' | 'backdrop' | 'music' | 'screensaver' | 'controller' | 'artwork'

const CATEGORIES: { id: Category; name: string }[] = [
  { id: 'home', name: 'Home' },
  { id: 'steam', name: 'Steam' },
  { id: 'consoles', name: 'Consoles' },
  { id: 'backdrop', name: 'Backdrop' },
  { id: 'music', name: 'Music' },
  { id: 'screensaver', name: 'Screensaver' },
  { id: 'controller', name: 'Controller' },
  { id: 'artwork', name: 'Artwork' }
]

/** Space between the top of the settings pane and the bottom of the screen. */
const PANE_HEIGHT = 885

/**
 * One category's settings. It scrolls on its own, so the categories stay put; B in
 * here goes back to its category (`backTo`), and B there goes Home.
 */
function SettingsPane({ backTo, children }: { backTo: string; children: ReactNode }) {
  const scroll = usePageScroll(PANE_HEIGHT)
  return (
    <div className="settings-pane" data-back-focus={backTo} data-nav-scope="">
      <div className="settings-pane-content" {...scroll}>
        {children}
      </div>
    </div>
  )
}

const SCREENSAVER_STYLES: { id: ScreensaverStyle; name: string; detail: string }[] = [
  { id: 'slideshow', name: 'Slideshow', detail: 'Game art and photos' },
  { id: 'backdrop', name: 'Living backdrop', detail: 'The backdrop with a big clock' },
  { id: 'clock', name: 'Clock & weather', detail: 'On black' }
]

const SCREENSAVER_SOURCES: { id: keyof ScreensaverSources; name: string; detail: string }[] = [
  { id: 'gameArt', name: 'Game art', detail: 'Banners from your Steam and console games' },
  { id: 'screenshots', name: 'Steam screenshots', detail: 'Ones you take in games' },
  { id: 'photos', name: 'Your photos', detail: 'Your screensaver folder' }
]

/** An on/off row, like the Steam collection toggles. */
function ToggleRow({ label, detail, on, onToggle }: { label: string; detail?: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      className={`setting-row${on ? ' on' : ''}`}
      tabIndex={-1}
      role="switch"
      aria-checked={on}
      aria-label={label}
      data-focusable=""
      data-select-sound="move"
      onClick={onToggle}
    >
      <span className="toggle" aria-hidden="true">
        <span className="toggle-knob" />
      </span>
      <span className="setting-name display">{label}</span>
      {detail && <span className="setting-detail">{detail}</span>}
    </button>
  )
}

const SCREENSAVER_DELAYS: { minutes: number; name: string }[] = [
  { minutes: 0, name: 'Off' },
  { minutes: 5, name: 'After 5 minutes' },
  { minutes: 10, name: 'After 10 minutes' },
  { minutes: 15, name: 'After 15 minutes' },
  { minutes: 30, name: 'After 30 minutes' }
]

const BACKDROPS: { id: BackdropStyle; name: string; detail: string }[] = [
  { id: 'sea', name: 'Sea', detail: 'Follows the time of day' },
  { id: 'rain', name: 'Rain', detail: 'A puddle in the rain, close up' }
]

const BACKDROP_TIMES: { id: BackdropTime; name: string; detail?: string }[] = [
  { id: 'auto', name: 'Auto', detail: 'Follows the clock' },
  { id: 'dawn', name: 'Dawn' },
  { id: 'day', name: 'Day' },
  { id: 'sunset', name: 'Sunset' },
  { id: 'night', name: 'Night' }
]

/** One single-choice row (a radio), styled like the layout options. */
function ChoiceRow({ label, detail, selected, onSelect }: { label: string; detail?: string; selected: boolean; onSelect: () => void }) {
  return (
    <button
      className={`setting-row${selected ? ' on' : ''}`}
      tabIndex={-1}
      role="radio"
      aria-checked={selected}
      aria-label={label}
      data-focusable=""
      data-select-sound="move"
      onClick={onSelect}
    >
      <span className="radio" aria-hidden="true" />
      <span className="setting-name display">{label}</span>
      {detail && <span className="setting-detail">{detail}</span>}
    </button>
  )
}

export function Settings({ onNavigate }: { onNavigate: (screen: Screen) => void }) {
  const [settings, setSettings] = useState<SettingsData | null>(null)
  const [category, setCategory] = useState<Category>('home')

  useEffect(() => {
    window.steamtv.getSettings().then(setSettings)
  }, [])

  // Only on first load; toggling a row also updates `settings`.
  const loaded = settings !== null
  useEffect(() => {
    if (loaded) focusContentDefault()
  }, [loaded])

  const toggle = (id: string): void => {
    if (!settings) return
    const selected = new Set(settings.steamCollections)
    if (selected.has(id)) selected.delete(id)
    else selected.add(id)
    // Keep the Settings list's order, so the Steam tab's rows follow it.
    const steamCollections = settings.collections.map((c) => c.id).filter((c) => selected.has(c))
    setSettings({ ...settings, steamCollections })
    window.steamtv.setSteamCollections(steamCollections)
  }

  const saveKey = (key: string): void => {
    if (!settings) return
    const trimmed = key.trim()
    setSettings({ ...settings, steamGridDbKeyHint: trimmed ? trimmed.slice(-4) : null })
    window.steamtv.setSteamGridDbKey(trimmed)
  }

  const chooseMusic = (file: string | null): void => {
    if (!settings || settings.music === file) return
    setSettings({ ...settings, music: file })
    window.steamtv.setMusic(file).then(() => window.dispatchEvent(new Event(MUSIC_CHANGED_EVENT)))
  }

  const chooseVolume = (volume: MusicVolume): void => {
    if (!settings || settings.musicVolume === volume) return
    setSettings({ ...settings, musicVolume: volume })
    window.steamtv.setMusicVolume(volume).then(() => window.dispatchEvent(new Event(MUSIC_CHANGED_EVENT)))
  }

  const toggleSleepOnControllerOff = (): void => {
    if (!settings) return
    const on = !settings.sleepOnControllerOff
    setSettings({ ...settings, sleepOnControllerOff: on })
    window.steamtv.setSleepOnControllerOff(on).then(() => window.dispatchEvent(new Event(SLEEP_SETTING_EVENT)))
  }

  const toggleSleepWarning = (): void => {
    if (!settings) return
    const on = !settings.sleepWarning
    setSettings({ ...settings, sleepWarning: on })
    window.steamtv.setSleepWarning(on).then(() => window.dispatchEvent(new Event(SLEEP_SETTING_EVENT)))
  }

  const chooseScreensaverStyle = (style: ScreensaverStyle): void => {
    if (!settings || settings.screensaverStyle === style) return
    setSettings({ ...settings, screensaverStyle: style })
    window.steamtv.setScreensaverStyle(style)
  }

  const toggleScreensaverSource = (id: keyof ScreensaverSources): void => {
    if (!settings) return
    const sources = { ...settings.screensaverSources, [id]: !settings.screensaverSources[id] }
    setSettings({ ...settings, screensaverSources: sources })
    window.steamtv.setScreensaverSources(sources)
  }

  const chooseScreensaverDelay = (minutes: number): void => {
    if (!settings || settings.screensaverDelay === minutes) return
    setSettings({ ...settings, screensaverDelay: minutes })
    window.steamtv.setScreensaverDelay(minutes).then(() => window.dispatchEvent(new Event(SCREENSAVER_EVENT)))
  }

  const chooseBackdrop = (style: BackdropStyle): void => {
    if (!settings || settings.backdrop === style) return
    setSettings({ ...settings, backdrop: style })
    window.steamtv.setBackdrop(style).then(() => window.dispatchEvent(new Event(BACKDROP_CHANGED_EVENT)))
  }

  const chooseBackdropTime = (time: BackdropTime): void => {
    if (!settings || settings.backdropTime === time) return
    setSettings({ ...settings, backdropTime: time })
    window.steamtv.setBackdropTime(time).then(() => window.dispatchEvent(new Event(BACKDROP_CHANGED_EVENT)))
  }

  const chooseRecentsLayout = (tab: RecentsTab, layout: SteamLayout): void => {
    if (!settings || settings.recentsLayouts[tab] === layout) return
    setSettings({ ...settings, recentsLayouts: { ...settings.recentsLayouts, [tab]: layout } })
    window.steamtv.setRecentsLayout(tab, layout).then(() => window.dispatchEvent(new Event(HOME_CHANGED_EVENT)))
  }

  const chooseFavoritesLayout = (layout: SteamLayout): void => {
    if (!settings || settings.favoritesLayout === layout) return
    setSettings({ ...settings, favoritesLayout: layout })
    window.steamtv.setFavoritesLayout(layout).then(() => window.dispatchEvent(new Event(HOME_CHANGED_EVENT)))
  }

  const chooseLayout = (tab: LayoutTab, layout: SteamLayout): void => {
    const field = `${tab}Layout` as const
    if (!settings || settings[field] === layout) return
    setSettings({ ...settings, [field]: layout })
    window.steamtv.setTabLayout(tab, layout)
  }

  const panes: Record<Category, ReactNode> = {
    home: (
      <>
        <div className="settings-group">
          <h3 className="settings-heading display">Home recents layout</h3>
          {settings && <RecentsChoice tab="home" value={settings.recentsLayouts.home} onChoose={chooseRecentsLayout} />}
        </div>

        <div className="settings-group">
          <h3 className="settings-heading display">Favorite apps layout</h3>
          <div className="setting-list" data-focus-memory="settings-favorites">
            {settings &&
              FAVORITES_LAYOUTS.map((l) => (
                <ChoiceRow
                  key={l.id}
                  label={l.name}
                  detail={l.detail}
                  selected={settings.favoritesLayout === l.id}
                  onSelect={() => chooseFavoritesLayout(l.id)}
                />
              ))}
          </div>
        </div>
      </>
    ),
    steam: (
      <>
        <div className="settings-group">
          <h3 className="settings-heading display">Steam tab layout</h3>
          <p className="settings-help">How the Steam tab shows each collection.</p>
          {settings && (
            <>
              <LayoutChoice tab="steam" value={settings.steamLayout} onChoose={chooseLayout} />
              <RecentsChoice tab="steam" value={settings.recentsLayouts.steam} onChoose={chooseRecentsLayout} />
            </>
          )}
        </div>

        <div className="settings-group">
          <h3 className="settings-heading display">Steam tab collections</h3>
          <p className="settings-help">Choose which of your Steam collections appear on the Steam tab.</p>
          {settings && settings.collections.length === 0 && (
            <p className="settings-help">No Steam collections found on this computer.</p>
          )}
          <div className="setting-list" data-focus-memory="settings">
            {settings?.collections.map((collection) => (
              <CollectionRow
                key={collection.id}
                collection={collection}
                on={settings.steamCollections.includes(collection.id)}
                onToggle={() => toggle(collection.id)}
              />
            ))}
          </div>
        </div>
      </>
    ),
    consoles: (
      <>
        <div className="settings-group">
          <h3 className="settings-heading display">Switch tab layout</h3>
          <p className="settings-help">How the Switch tab shows your games.</p>
          {settings && <LayoutChoice tab="switch" value={settings.switchLayout} onChoose={chooseLayout} />}
          {settings && (
            <RecentsChoice tab="switch" value={settings.recentsLayouts.switch} onChoose={chooseRecentsLayout} />
          )}
        </div>

        <div className="settings-group">
          <h3 className="settings-heading display">PS3 tab layout</h3>
          <p className="settings-help">How the PS3 tab shows your games.</p>
          {settings && <LayoutChoice tab="ps3" value={settings.ps3Layout} onChoose={chooseLayout} />}
          {settings && (
            <RecentsChoice tab="ps3" value={settings.recentsLayouts.ps3} onChoose={chooseRecentsLayout} />
          )}
        </div>

        <div className="settings-group">
          <h3 className="settings-heading display">Xbox 360 tab layout</h3>
          <p className="settings-help">How the Xbox 360 tab shows your games.</p>
          {settings && <LayoutChoice tab="xbox360" value={settings.xbox360Layout} onChoose={chooseLayout} />}
          {settings && (
            <RecentsChoice tab="xbox360" value={settings.recentsLayouts.xbox360} onChoose={chooseRecentsLayout} />
          )}
        </div>

        <div className="settings-group">
          <h3 className="settings-heading display">GameCube tab layout</h3>
          <p className="settings-help">How the GameCube tab shows your games.</p>
          {settings && <LayoutChoice tab="gamecube" value={settings.gamecubeLayout} onChoose={chooseLayout} />}
          {settings && (
            <RecentsChoice tab="gamecube" value={settings.recentsLayouts.gamecube} onChoose={chooseRecentsLayout} />
          )}
        </div>

        <div className="settings-group">
          <h3 className="settings-heading display">Dreamcast tab layout</h3>
          <p className="settings-help">How the Dreamcast tab shows your games.</p>
          {settings && <LayoutChoice tab="dreamcast" value={settings.dreamcastLayout} onChoose={chooseLayout} />}
          {settings && (
            <RecentsChoice tab="dreamcast" value={settings.recentsLayouts.dreamcast} onChoose={chooseRecentsLayout} />
          )}
        </div>
      </>
    ),
    backdrop: (
      <>
        <div className="settings-group">
          <h3 className="settings-heading display">Backdrop</h3>
          <div className="setting-list" data-focus-memory="settings-backdrop-style">
            {settings &&
              BACKDROPS.map((b) => (
                <ChoiceRow
                  key={b.id}
                  label={b.name}
                  detail={b.detail}
                  selected={settings.backdrop === b.id}
                  onSelect={() => chooseBackdrop(b.id)}
                />
              ))}
          </div>
        </div>

        {settings?.backdrop === 'sea' && (
          <div className="settings-group">
            <h3 className="settings-heading display">Backdrop time of day</h3>
            <div className="setting-list" data-focus-memory="settings-backdrop">
              {settings &&
                BACKDROP_TIMES.map((t) => (
                  <ChoiceRow
                    key={t.id}
                    label={t.name}
                    detail={t.detail}
                    selected={settings.backdropTime === t.id}
                    onSelect={() => chooseBackdropTime(t.id)}
                  />
                ))}
            </div>
          </div>
        )}
      </>
    ),
    music: (
      <>
        <div className="settings-group">
          <h3 className="settings-heading display">Background music</h3>
          <p className="settings-help">
            Plays quietly while you browse and pauses during games. Add your own audio files to {settings?.musicFolder ?? '~/Music'}.
          </p>
          <div className="setting-list" data-focus-memory="settings-music">
            {settings && (
              <>
                <ChoiceRow label="None" selected={!settings.music} onSelect={() => chooseMusic(null)} />
                {settings.musicTracks.map((track) => (
                  <ChoiceRow
                    key={track.file}
                    label={track.name}
                    selected={settings.music === track.file}
                    onSelect={() => chooseMusic(track.file)}
                  />
                ))}
              </>
            )}
          </div>
        </div>

        <div className="settings-group">
          <h3 className="settings-heading display">Music volume</h3>
          <div className="setting-list" data-focus-memory="settings-volume">
            {settings &&
              VOLUMES.map((v) => (
                <ChoiceRow key={v.id} label={v.name} selected={settings.musicVolume === v.id} onSelect={() => chooseVolume(v.id)} />
              ))}
          </div>
        </div>
      </>
    ),
    screensaver: (
      <>
        <div className="settings-group">
          <h3 className="settings-heading display">Screensaver</h3>
          <p className="settings-help">
            Starts when nothing has been pressed for a while, only while vaporTV is on screen. Any button wakes it.
          </p>
          <div className="setting-list" data-focus-memory="settings-screensaver">
            {settings &&
              SCREENSAVER_DELAYS.map((d) => (
                <ChoiceRow
                  key={d.minutes}
                  label={d.name}
                  selected={settings.screensaverDelay === d.minutes}
                  onSelect={() => chooseScreensaverDelay(d.minutes)}
                />
              ))}
            <button
              className="setting-row"
              tabIndex={-1}
              aria-label="Preview screensaver"
              data-focusable=""
              data-select-sound="move"
              onClick={() => window.dispatchEvent(new CustomEvent(SCREENSAVER_EVENT, { detail: 'preview' }))}
            >
              <span className="setting-name display">Preview</span>
              <span className="setting-detail">Start it now</span>
            </button>
          </div>
        </div>

        <div className="settings-group">
          <h3 className="settings-heading display">Style</h3>
          <div className="setting-list" data-focus-memory="settings-screensaver-style">
            {settings &&
              SCREENSAVER_STYLES.map((st) => (
                <ChoiceRow
                  key={st.id}
                  label={st.name}
                  detail={st.detail}
                  selected={settings.screensaverStyle === st.id}
                  onSelect={() => chooseScreensaverStyle(st.id)}
                />
              ))}
          </div>
        </div>

        {settings?.screensaverStyle === 'slideshow' && (
          <div className="settings-group">
            <h3 className="settings-heading display">Slideshow pictures</h3>
            <p className="settings-help">Mixed together. With none on, or nothing to show, you get the clock instead.</p>
            <div className="setting-list" data-focus-memory="settings-screensaver-sources">
              {SCREENSAVER_SOURCES.map((src) => (
                <ToggleRow
                  key={src.id}
                  label={src.name}
                  detail={src.id === 'photos' ? settings.screensaverFolder : src.detail}
                  on={settings.screensaverSources[src.id]}
                  onToggle={() => toggleScreensaverSource(src.id)}
                />
              ))}
            </div>
          </div>
        )}

        <GooglePhotosSettings />
      </>
    ),
    controller: (
      <>
        <div className="settings-group">
          <h3 className="settings-heading display">Controller</h3>
          <p className="settings-help">
            With a controller that uses a wireless USB receiver, switching it off puts the box to sleep and switching it on
            wakes it. Only while vaporTV is on screen, never during a game.
          </p>
          <div className="setting-list" data-focus-memory="settings-controller">
            {settings && (
              <button
                className={`setting-row${settings.sleepOnControllerOff ? ' on' : ''}`}
                tabIndex={-1}
                role="switch"
                aria-checked={settings.sleepOnControllerOff}
                aria-label="Sleep when the controller is switched off"
                data-focusable=""
                data-select-sound="move"
                onClick={toggleSleepOnControllerOff}
              >
                <span className="toggle" aria-hidden="true">
                  <span className="toggle-knob" />
                </span>
                <span className="setting-name display">Sleep when switched off</span>
              </button>
            )}
            {settings?.sleepOnControllerOff && (
              <button
                className={`setting-row${settings.sleepWarning ? ' on' : ''}`}
                tabIndex={-1}
                role="switch"
                aria-checked={settings.sleepWarning}
                aria-label="Warn before sleeping"
                data-focusable=""
                data-select-sound="move"
                onClick={toggleSleepWarning}
              >
                <span className="toggle" aria-hidden="true">
                  <span className="toggle-knob" />
                </span>
                <span className="setting-name display">Warn before sleeping</span>
                <span className="setting-detail">5s countdown · switch back on to cancel</span>
              </button>
            )}
          </div>
        </div>

        {settings && <ControlsSettings controls={settings.controls} onChange={(controls) => setSettings({ ...settings, controls })} />}
      </>
    ),
    artwork: (
      <>
        <div className="settings-group">
          <h3 className="settings-heading display">SteamGridDB</h3>
          <p className="settings-help">
            Cover art for emulated games comes from steamgriddb.com. Get a key there under Preferences → API.
          </p>
          <div className="setting-list" data-focus-memory="settings-key">
            {settings && <KeyRow hint={settings.steamGridDbKeyHint} onSave={saveKey} />}
          </div>
        </div>
      </>
    )
  }

  return (
    <div className="page">
      <DateWeather />
      <NavBar active="settings" onNavigate={onNavigate} />
      <Clock />

      <section className="settings">
        <h2 className="section-label display">Settings</h2>
        <div className="settings-columns">
          <div className="settings-categories" data-focus-memory="settings-categories" data-nav-scope="">
            {CATEGORIES.map((c, i) => (
              <button
                key={c.id}
                id={`settings-category-${c.id}`}
                className={`settings-category display${c.id === category ? ' active' : ''}`}
                tabIndex={-1}
                data-focusable=""
                data-select-sound="move"
                {...(i === 0 ? { 'data-focus-default': '' } : {})}
                data-nav-right=".settings-pane [data-focusable]"
                // The right side follows the cursor, as on Android TV; A steps into it.
                onFocus={() => setCategory(c.id)}
                onClick={() => {
                  const first = document.querySelector<HTMLElement>('.settings-pane [data-focusable]')
                  if (first) focus(first)
                }}
              >
                {c.name}
              </button>
            ))}
          </div>
          <SettingsPane key={category} backTo={`#settings-category-${category}`}>
            {panes[category]}
          </SettingsPane>
        </div>
      </section>
    </div>
  )
}
