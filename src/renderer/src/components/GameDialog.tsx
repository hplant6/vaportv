import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import type { AppDetails, GameOptions, SteamGameDetails } from '../../../shared/types'
import calendar from '../assets/calendar.svg'
import clock from '../assets/clock.svg'
import drive from '../assets/drive.svg'
import trophy from '../assets/trophy.svg'
import program from '../assets/window.svg'
import { FAVORITE_EVENT, focus, GAME_MENU_CLOSE_EVENT, GAME_MENU_EVENT, OPTIONS_EVENT, TRAP_CLOSE_EVENT } from '../input/focus'
import { OnScreenKeyboard } from './Keyboard'
import { formatPlaytime } from './RecentCard'
import { toast } from './Toast'

// Start on a game or app: its cover and name, what's known of it (playtime, last play, size,
// and a Steam game's achievements), beside its settings. A console game's: changing its name,
// picking the emulator it opens in, replacing its art (the Artwork window X opens), or
// deleting it from the drive (a second press confirms). A Steam game's hand it to Steam: its
// page there, or checking its files. An app's: showing it on Home, and updating its program.
// B or Start closes it.

const STEAM_GAME = /^steam:/
/** Recents cards that are apps: one vaporTV opened itself, or a Steam shortcut (an app's, or a game's that isn't ours). */
const APP_CARD = /^(app|shortcut):/
/** Delete waits this long for its second press. */
const CONFIRM_MS = 4000

type Step = 'menu' | 'emulator' | 'rename'

const message = (err: unknown): string =>
  (err instanceof Error ? err.message : String(err)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

function size(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`
}

/** "Today", "Yesterday", "Oct 21", or "Mar 3, 2025" from another year. */
function day(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Math.round((today.getTime() - date.getTime()) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(y === today.getFullYear() ? {} : { year: 'numeric' }) })
}

type Fact = [icon: string, label: string, value: string]

/** The facts every game has: how long and when it was last played. */
const playFacts = (playtime?: number, lastPlayed?: string): Fact[] => [
  [clock, 'Playtime', playtime ? formatPlaytime(playtime) : 'Unplayed'],
  [calendar, 'Last played', lastPlayed ? day(lastPlayed) : 'Never']
]

/** A setting: its name, and what it's set to or does. */
const row = (label: string, detail: ReactNode, onClick: () => void, extra = '') => (
  <button className={`setting-row${extra}`} tabIndex={-1} data-focusable="" data-select-sound="move" onClick={onClick}>
    <span className="setting-name display">{label}</span>
    {detail && <span className="setting-detail">{detail}</span>}
  </button>
)

/** The modal around a game: its cover, name and facts, beside its settings box. */
function GamePanel({
  panel,
  title,
  cover,
  wide = false,
  facts,
  heading,
  error,
  children
}: {
  panel: RefObject<HTMLDivElement | null>
  title?: string
  cover?: string
  /** An app's tile: shown whole over a blur of itself, in the poster's place. */
  wide?: boolean
  facts?: Fact[]
  heading: string
  error?: string | null
  children?: ReactNode
}) {
  return (
    <div className="dialog-backdrop">
      <div className="dialog-panel game-panel" ref={panel} data-focus-trap="">
        <div className={`game-cover${wide ? ' wide' : ''}`}>
          {cover && wide && <img className="game-cover-blur" src={cover} alt="" />}
          {cover ? <img src={cover} alt="" /> : <span className="display">{title}</span>}
        </div>
        <div className="game-side">
          <h2 className="game-title">{title ?? 'Game'}</h2>
          {facts && (
            <ul className="game-facts">
              {facts.map(([icon, label, value]) => (
                <li key={label}>
                  <img src={icon} alt="" />
                  <span className="display">{label}:</span>
                  {value}
                </li>
              ))}
            </ul>
          )}
          {error && <p className="dialog-message">{error}</p>}
          {children && (
            <div className="game-settings">
              <h3 className="game-settings-title display">{heading}</h3>
              {children}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** B and Start close it (B on a step goes back to the menu first, through `back`). Off while the keyboard has B. */
function useCloseKeys(onClose: () => void, back?: () => void, off = false): void {
  useEffect(() => {
    if (off) return
    const close = back ?? onClose
    window.addEventListener(TRAP_CLOSE_EVENT, close)
    window.addEventListener(GAME_MENU_CLOSE_EVENT, onClose)
    return () => {
      window.removeEventListener(TRAP_CLOSE_EVENT, close)
      window.removeEventListener(GAME_MENU_CLOSE_EVENT, onClose)
    }
  }, [onClose, back, off])
}

export function GameDialog() {
  const [item, setItem] = useState<{ id: string; card: HTMLElement } | null>(null)

  useEffect(() => {
    const open = (event: Event): void => {
      const card = (event as CustomEvent<HTMLElement>).detail
      const id = card.dataset.itemId ?? card.dataset.appId
      if (id) setItem({ id, card })
    }
    window.addEventListener(GAME_MENU_EVENT, open)
    return () => window.removeEventListener(GAME_MENU_EVENT, open)
  }, [])

  if (!item) return null
  const close = (): void => {
    setItem(null)
    if (item.card.isConnected) focus(item.card)
  }
  if (STEAM_GAME.test(item.id)) return <SteamGame id={item.id} onClose={close} />
  if (item.card.dataset.appId || APP_CARD.test(item.id)) return <App id={item.id} onClose={close} />
  return <Game id={item.id} card={item.card} onClose={close} />
}

function App({ id, onClose }: { id: string; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  const [details, setDetails] = useState<AppDetails | null>(null)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    window.steamtv.game
      .app(id)
      .then((found) => {
        if (found) return setDetails(found)
        // A Steam shortcut that isn't one of the apps: a game added to Steam, Steam's to look after.
        toast('Steam looks after its own shortcuts')
        onClose()
      })
      .catch((err: unknown) => toast(message(err)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useCloseKeys(onClose)

  // Once, when it's loaded: an update reloading it leaves the cursor where it is.
  const loaded = details !== null
  useEffect(() => {
    const el = panel.current?.querySelector<HTMLElement>('[data-focusable]')
    if (el) focus(el)
  }, [loaded])

  // As Y on its tile does: App adds or removes it, says so and redraws Home.
  const toggleHome = (): void => {
    if (!details) return
    const tile = document.createElement('span')
    tile.dataset.appId = details.id
    tile.setAttribute('aria-label', details.name)
    onClose()
    window.dispatchEvent(new CustomEvent(FAVORITE_EVENT, { detail: tile }))
  }

  const update = (): void => {
    if (!details || updating) return
    setUpdating(true)
    window.steamtv.game
      .updateApp(details.id)
      .then((changed) => {
        toast(changed ? `${details.name} is updated` : `${details.name} is up to date`)
        return window.steamtv.game.app(id).then((found) => found && setDetails(found))
      })
      .catch((err: unknown) => toast(message(err)))
      .finally(() => setUpdating(false))
  }

  const facts: Fact[] | undefined = details
    ? [
        [program, 'Opens in', details.opensIn],
        [calendar, 'Last opened', details.lastPlayed ? day(details.lastPlayed) : 'Never'],
        [clock, 'Time open', details.playtime ? formatPlaytime(details.playtime) : 'None yet'],
        ...(details.size ? [[drive, 'Size', details.size] as Fact] : [])
      ]
    : undefined

  return (
    <GamePanel panel={panel} title={details?.name} cover={details?.tile} wide facts={facts} heading="App settings">
      {details && (
        <>
          <button
            className={`setting-row${details.onHome ? ' on' : ''}`}
            tabIndex={-1}
            role="switch"
            aria-checked={details.onHome}
            data-focusable=""
            data-select-sound="move"
            onClick={toggleHome}
          >
            <span className="toggle" aria-hidden="true">
              <span className="toggle-knob" />
            </span>
            <span className="setting-name display">Show on Home</span>
            <span className="setting-detail">{details.onHome ? 'In Favorite Apps' : 'Only in Apps'}</span>
          </button>
          {details.updatable &&
            row('Update', updating ? 'Updating…' : details.version ? `Version ${details.version}` : 'From Flathub', update)}
        </>
      )}
    </GamePanel>
  )
}

function SteamGame({ id, onClose }: { id: string; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  const [details, setDetails] = useState<SteamGameDetails | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.steamtv.game
      .steam(id)
      .then((found) => (found ? setDetails(found) : setError('Steam doesn’t have this game installed.')))
      .catch((err: unknown) => setError(message(err)))
  }, [id])

  useCloseKeys(onClose)

  useEffect(() => {
    const el = panel.current?.querySelector<HTMLElement>('[data-focusable]')
    if (el) focus(el)
  }, [details])

  const hand = (what: 'page' | 'verify'): void => {
    if (!details) return
    window.steamtv.game.openInSteam(id, what).catch((err: unknown) => toast(message(err)))
    if (what === 'verify') toast(`Steam is checking ${details.title}’s files`)
    onClose()
  }

  const facts: Fact[] | undefined = details
    ? [
        ...playFacts(details.playtime, details.lastPlayed),
        ...(details.achievements ? [[trophy, 'Achievements', `${details.achievements.achieved} of ${details.achievements.total}`] as Fact] : []),
        ...(details.bytes ? [[drive, 'Size', size(details.bytes)] as Fact] : [])
      ]
    : undefined

  return (
    <GamePanel panel={panel} title={details?.title} cover={details?.cover} facts={facts} heading="Game settings" error={error}>
      {details && (
        <>
          {row('Open in Steam', 'Its page in your library', () => hand('page'))}
          {row('Verify files', 'Steam checks and repairs the install', () => hand('verify'))}
        </>
      )}
    </GamePanel>
  )
}

function Game({ id, card, onClose }: { id: string; card: HTMLElement; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  const [options, setOptions] = useState<GameOptions | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<Step>('menu')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.steamtv.game
      .options(id)
      .then(setOptions)
      .catch((err: unknown) => setError(message(err)))
  }, [id])

  // B goes back a step, then closes; Start closes from any step. The keyboard handles its own B.
  const backToMenu = useCallback(() => setStep('menu'), [])
  useCloseKeys(onClose, step === 'emulator' ? backToMenu : undefined, step === 'rename')

  // The cursor starts on the first row, or on the emulator in use.
  useEffect(() => {
    if (!options || step === 'rename') return
    const el =
      (step === 'emulator' && panel.current?.querySelector<HTMLElement>('[aria-checked="true"]')) ||
      panel.current?.querySelector<HTMLElement>('[data-focusable]')
    if (el) focus(el)
  }, [options, step])

  useEffect(() => {
    if (!confirming) return
    const timer = setTimeout(() => setConfirming(false), CONFIRM_MS)
    return () => clearTimeout(timer)
  }, [confirming])

  const fail = (err: unknown): void => {
    setBusy(false)
    toast(message(err))
  }

  const rename = (name: string | null): void => {
    if (!options) return
    const next = name?.trim() && name.trim() !== options.originalTitle ? name.trim() : null
    window.steamtv.game
      .rename(id, next)
      .then(() => {
        toast(next ? `Renamed to ${next}` : `Back to ${options.originalTitle}`)
        onClose()
      })
      .catch(fail)
  }

  const chooseEmulator = (emulator: string, name: string): void => {
    if (!options) return
    if (emulator === options.emulator) return setStep('menu')
    window.steamtv.game
      .setEmulator(id, emulator)
      .then(() => {
        toast(`${options.title} will open in ${name}`)
        onClose()
      })
      .catch(fail)
  }

  const replaceArt = (): void => {
    onClose()
    window.dispatchEvent(new CustomEvent(OPTIONS_EVENT, { detail: card }))
  }

  const remove = (): void => {
    if (!options || busy) return
    if (!confirming) return setConfirming(true)
    setBusy(true)
    window.steamtv.game
      .delete(id)
      .then(() => {
        toast(`Deleted ${options.title}`)
        onClose()
      })
      .catch(fail)
  }

  if (step === 'rename' && options)
    return (
      <OnScreenKeyboard
        title={`Rename ${options.title}`}
        prompt={options.renamed ? `Clear it for the file's name, ${options.originalTitle}` : undefined}
        initial={options.title}
        onDone={rename}
        onCancel={() => setStep('menu')}
      />
    )

  const current = options?.emulators.find((e) => e.id === options.emulator)?.name ?? options?.emulators[0]?.name

  return (
    <GamePanel
      panel={panel}
      title={options?.title}
      cover={options?.cover}
      facts={options ? [...playFacts(options.playtime, options.lastPlayed), [drive, 'Size', size(options.files.bytes)]] : undefined}
      heading={step === 'emulator' ? 'Choose emulator' : 'Game settings'}
      error={error}
    >
      {options && (
        <>
        {step === 'menu' && (
          <>
            {row('Change name', options.renamed ? `Was ${options.originalTitle}` : options.title, () => setStep('rename'))}
            {row(
              'Change emulator',
              options.emulators.length > 1 ? (
                current
              ) : (
                <>
                  {current} <span className="regular">is the only one installed</span>
                </>
              ),
              () => (options.emulators.length > 1 ? setStep('emulator') : toast(`No other emulator for this game is installed`))
            )}
            {row('Change artwork', options.cover ? 'Replace the cover' : 'No cover yet', replaceArt)}
            {row(
              confirming ? 'Press A again to delete' : 'Delete files',
              busy
                ? 'Deleting…'
                : confirming && `${options.files.count} ${options.files.count === 1 ? 'file' : 'files'} · ${size(options.files.bytes)} · can’t be undone`,
              remove,
              confirming ? ' danger' : ''
            )}
          </>
        )}
        {step === 'emulator' &&
          options.emulators.map((emulator) => (
            <button
              key={emulator.id}
              className={`setting-row${emulator.id === options.emulator ? ' on' : ''}`}
              tabIndex={-1}
              role="radio"
              aria-checked={emulator.id === options.emulator}
              data-focusable=""
              data-select-sound="move"
              onClick={() => chooseEmulator(emulator.id, emulator.name)}
            >
              <span className="radio" aria-hidden="true" />
              <span className="setting-name display">{emulator.name}</span>
              {emulator.id === '' && <span className="setting-detail">Default</span>}
            </button>
          ))}
        </>
      )}
    </GamePanel>
  )
}
