import { useEffect, useRef, useState } from 'react'
import type { AppItem } from '../../../shared/types'
import { focus, TRAP_CLOSE_EVENT } from '../input/focus'
import { HOME_CHANGED_EVENT } from '../screens/Settings'
import { toast } from './Toast'

// A on an app tile that doesn't open yet: set it up from here. Programs install from
// Flathub and open straight away; websites get Chrome and a Steam shortcut, which means
// Steam closing and reopening.

/** AppTile fires this with the app (and its tile, to return to). */
export const APP_SETUP_EVENT = 'steamtv:app-setup'

export function AppSetupDialog({ apps }: { apps: AppItem[] }) {
  const [open, setOpen] = useState<{ app: AppItem; tile: HTMLElement } | null>(null)

  useEffect(() => {
    const onSetup = (event: Event): void => setOpen((event as CustomEvent<{ app: AppItem; tile: HTMLElement }>).detail)
    window.addEventListener(APP_SETUP_EVENT, onSetup)
    return () => window.removeEventListener(APP_SETUP_EVENT, onSetup)
  }, [])

  if (!open) return null
  // Other streaming sites not set up yet: offered together, so Steam restarts once.
  const otherSites = apps.filter((a) => a.id !== open.app.id && a.state && !a.state.ready && a.state.setup === 'web')
  return (
    <Setup
      app={open.app}
      otherSites={otherSites}
      onClose={() => {
        setOpen(null)
        if (open.tile.isConnected) focus(open.tile)
      }}
    />
  )
}

type Phase = 'ask' | 'working' | 'confirmSteam' | 'restarting'

function Setup({ app, otherSites, onClose }: { app: AppItem; otherSites: AppItem[]; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<Phase>('ask')
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const setup = app.state?.setup

  useEffect(() => window.steamtv.appSetup.onProgress(setProgress), [])

  // B closes, except mid-install.
  useEffect(() => {
    const back = (): void => {
      if (phase !== 'working' && phase !== 'restarting') onClose()
    }
    window.addEventListener(TRAP_CLOSE_EVENT, back)
    return () => window.removeEventListener(TRAP_CLOSE_EVENT, back)
  }, [phase, onClose])

  useEffect(() => {
    const first = panel.current?.querySelector<HTMLElement>('[data-focusable]')
    if (first) focus(first)
  }, [phase, error])

  const install = (): void => {
    setPhase('working')
    setError(null)
    window.steamtv.appSetup.install(app.id).then((err) => {
      if (err) {
        setError(err)
        setPhase('ask')
      } else if (setup === 'web') {
        setPhase('confirmSteam')
      } else {
        toast(`${app.name} is ready`)
        window.dispatchEvent(new Event(HOME_CHANGED_EVENT))
        onClose()
      }
    })
  }

  const addToSteam = (ids: string[]): void => {
    setPhase('restarting')
    window.steamtv.appSetup.addToSteam(ids).then((err) => {
      if (err) {
        setError(err)
        setPhase('confirmSteam')
      }
    })
  }

  const button = (label: string, onClick: () => void, detail?: string) => (
    <button className="setting-row" tabIndex={-1} data-focusable="" data-select-sound="move" onClick={onClick}>
      <span className="setting-name display">{label}</span>
      {detail && <span className="setting-detail">{detail}</span>}
    </button>
  )

  let body
  if (setup === 'emudeck') {
    body = (
      <>
        <p className="dialog-message">{app.name} comes with EmuDeck. Install EmuDeck in Desktop Mode and it opens from here.</p>
        <div className="setting-list">{button('OK', onClose)}</div>
      </>
    )
  } else if (setup === 'shortcut') {
    body = (
      <>
        <p className="dialog-message">
          Add {app.name} to Steam as a non-Steam game (in Desktop Mode), named “{app.name}”, and it opens from here.
        </p>
        <div className="setting-list">{button('OK', onClose)}</div>
      </>
    )
  } else if (phase === 'working') {
    body = <p className="dialog-message">{progress ?? 'Starting…'}</p>
  } else if (phase === 'restarting') {
    body = <p className="dialog-message">{progress ?? 'Steam is restarting…'} vaporTV will be back in a moment.</p>
  } else if (phase === 'confirmSteam') {
    body = (
      <>
        <p className="dialog-message">
          Steam closes and opens again to add {app.name} (about a minute). The controller works in it once you pick a
          layout for it in Steam (the “Web browser” one suits).
        </p>
        <div className="setting-list">
          {button(`Add ${app.name}`, () => addToSteam([app.id]))}
          {otherSites.length > 0 &&
            button(`Add all streaming apps`, () => addToSteam([app.id, ...otherSites.map((a) => a.id)]), `${app.name} and ${otherSites.length} more`)}
          {button('Not now', onClose)}
        </div>
      </>
    )
  } else {
    body = (
      <>
        <p className="dialog-message">
          {setup === 'install'
            ? `${app.name} opens in ${app.state?.program ?? 'an app'}, which isn't installed. vaporTV can install it from Flathub; it then opens from here.`
            : `${app.name} opens in Google Chrome as a Steam shortcut. vaporTV installs Chrome if it's missing, then adds ${app.name} to Steam.`}
        </p>
        <div className="setting-list">
          {button(setup === 'install' ? `Install ${app.state?.program ?? app.name}` : `Set up ${app.name}`, install)}
          {button('Not now', onClose)}
        </div>
      </>
    )
  }

  return (
    <div className="dialog-backdrop">
      <div className="dialog-panel" ref={panel} data-focus-trap="">
        <h2 className="section-label display">Set up {app.name}</h2>
        {error && <p className="dialog-message">{error}</p>}
        {body}
      </div>
    </div>
  )
}
