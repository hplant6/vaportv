import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { buttonName, DEFAULT_CONTROLS, type ControlAction, type Controls } from '../../../shared/controls'
import type { LocationSettings } from '../../../shared/types'
import { focus, focusDefault, TRAP_CLOSE_EVENT } from '../input/focus'
import { LocationDialog, WEATHER_CHANGED_EVENT } from './LocationDialog'

// The welcome tour: shown once, the first time vaporTV starts, and again from
// Settings → General. A goes on, B goes back; the last step checks the weather's place.

/** Settings fires this to show the tour again. */
export const OPEN_WELCOME_EVENT = 'steamtv:open-welcome'

export function Welcome() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    window.steamtv.welcome.seen().then((seen) => setOpen(!seen))
    const show = (): void => setOpen(true)
    window.addEventListener(OPEN_WELCOME_EVENT, show)
    return () => window.removeEventListener(OPEN_WELCOME_EVENT, show)
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    void window.steamtv.welcome.done()
    focusDefault()
  }, [])

  return open ? <Tour onClose={close} /> : null
}

/** A button's name as a little pill, the way the controller shows it. */
function Button({ children }: { children: ReactNode }) {
  return <span className="control-button display">{children}</span>
}

function Row({ keys, children }: { keys: ReactNode; children: ReactNode }) {
  return (
    <li className="welcome-row">
      <span className="welcome-keys">{keys}</span>
      <span>{children}</span>
    </li>
  )
}

function Tour({ onClose }: { onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState(0)
  const [controls, setControls] = useState<Controls>(DEFAULT_CONTROLS)
  const [location, setLocation] = useState<LocationSettings | null>(null)
  const [picking, setPicking] = useState(false)

  useEffect(() => {
    window.steamtv.getSettings().then((s) => setControls(s.controls))
    const load = (): void => {
      window.steamtv.location.get().then(setLocation)
    }
    load()
    window.addEventListener(WEATHER_CHANGED_EVENT, load)
    return () => window.removeEventListener(WEATHER_CHANGED_EVENT, load)
  }, [])

  const key = (action: ControlAction): ReactNode => <Button>{buttonName(controls[action])}</Button>

  const steps: { title: string; body: ReactNode }[] = [
    {
      title: 'Welcome to vaporTV',
      body: (
        <p className="dialog-message">
          Your Steam games, consoles and streaming apps, together on the TV and all run from the controller. Here’s how to
          get around; it takes a minute.
        </p>
      )
    },
    {
      title: 'Getting around',
      body: (
        <ul className="welcome-list">
          <Row keys={<Button>D-pad</Button>}>Move (the left stick works too)</Row>
          <Row keys={key('select')}>Open what’s highlighted</Row>
          <Row keys={key('back')}>Go back</Row>
          <Row keys={<>{key('previousTab')}{key('nextTab')}</>}>Switch tabs</Row>
        </ul>
      )
    },
    {
      title: 'On a game',
      body: (
        <ul className="welcome-list">
          <Row keys={key('favorite')}>Add it to Favorites, or take it off</Row>
          <Row keys={key('options')}>Fix a console game’s cover art</Row>
          <Row keys={key('core')}>Pick which emulator core runs an arcade game</Row>
          <Row keys={<>{key('volumeDown')}{key('volumeUp')}</>}>Volume down and up</Row>
          <Row keys={<><Button>Select</Button><Button>Start</Button></>}>Hold both while playing to close it and come back here</Row>
        </ul>
      )
    },
    {
      title: 'Your apps',
      body: (
        <p className="dialog-message">
          Streaming apps you haven’t set up yet are dimmed in the Apps tab: press {buttonName(controls.select)} on one and
          vaporTV sets it up. Backdrops, music, the screensaver and the buttons are all in Settings.
        </p>
      )
    },
    {
      title: 'Weather',
      body: (
        <p className="dialog-message">
          {location?.place
            ? `The weather is for ${location.place}${location.chosen ? '' : ', going by your internet connection'}. Is that right?`
            : 'vaporTV couldn’t tell where you are yet. Choose a place to see the weather.'}
        </p>
      )
    }
  ]
  const last = step === steps.length - 1

  // B: back a step; on the first, close.
  useEffect(() => {
    if (picking) return
    const back = (): void => (step === 0 ? onClose() : setStep(step - 1))
    window.addEventListener(TRAP_CLOSE_EVENT, back)
    return () => window.removeEventListener(TRAP_CLOSE_EVENT, back)
  }, [step, picking, onClose])

  useEffect(() => {
    if (picking) return
    const first = panel.current?.querySelector<HTMLElement>('[data-focusable]')
    if (first) focus(first)
  }, [step, picking])

  const closePicker = useCallback(() => setPicking(false), [])
  // One window at a time holds the cursor: the tour steps aside while a place is picked.
  if (picking) return <LocationDialog onClose={closePicker} />

  const action = (label: string, onClick: () => void, detail?: string) => (
    <button className="setting-row" tabIndex={-1} data-focusable="" data-select-sound="move" onClick={onClick}>
      <span className="setting-name display">{label}</span>
      {detail && <span className="setting-detail">{detail}</span>}
    </button>
  )

  return (
    <div className="dialog-backdrop">
      <div className="dialog-panel welcome-panel" ref={panel} data-focus-trap="">
        <p className="welcome-step">
          {step + 1} of {steps.length}
        </p>
        <h2 className="section-label display">{steps[step].title}</h2>
        {steps[step].body}
        <div className="setting-list">
          {last ? (
            <>
              {action(location?.place ? 'Yes, all done' : 'Skip for now', onClose)}
              {action('Choose a place', () => setPicking(true))}
            </>
          ) : (
            action(step === 0 ? 'Show me' : 'Next', () => setStep(step + 1), step > 0 ? `${buttonName(controls.back)} to go back` : undefined)
          )}
        </div>
      </div>
    </div>
  )
}
