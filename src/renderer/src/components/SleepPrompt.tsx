import { useEffect, useRef, useState } from 'react'
import { focus, TRAP_CLOSE_EVENT } from '../input/focus'
import { isSwitchOff } from '../../../shared/controllers'
import { toast } from './Toast'

const SLEEP_EVENT = 'steamtv:sleep'
/** Settings fires this after changing "Sleep when the controller is switched off". */
export const SLEEP_SETTING_EVENT = 'steamtv:sleep-setting'
/** From the power menu: sleeps anyway after this long if no controller is switched off. */
const ASK_SECONDS = 15
/** After a controller is switched off (with the setting on): time to change your mind. */
const AUTO_SECONDS = 5

/** The power menu's Sleep: asks for the controller to be switched off first. */
export function requestSleep(): void {
  window.dispatchEvent(new Event(SLEEP_EVENT))
}

type Mode = 'ask' | 'auto'

let lastConnect = -Infinity
window.addEventListener('gamepadconnected', () => (lastConnect = performance.now()))

/**
 * Whether a disconnect means a controller was switched off: a real one, the last
 * real one connected, and not part of another controller connecting.
 */
function switchedOff(event: Event): boolean {
  const pad = (event as GamepadEvent).gamepad
  const pads = navigator.getGamepads().filter((p): p is Gamepad => !!p)
  return !!pad && isSwitchOff(pad, pads, performance.now() - lastConnect)
}

/**
 * Sleeping with the controller already off lets switching it back on wake the box.
 * USB wake only follows a change on the port: with the receiver connected at sleep,
 * the box wakes when it disconnects (the controller switched off); with nothing
 * connected, it wakes when the receiver reconnects (switched back on).
 *
 * 'ask' (power menu): waits for a controller to be switched off, then sleeps.
 * 'auto' (the setting): a controller switched off while vaporTV is on screen starts a
 * short countdown to sleep (unless the warning is turned off); switching it back on,
 * or Cancel, stops it.
 */
export function SleepPrompt() {
  const [mode, setMode] = useState<Mode | null>(null)
  const [seconds, setSeconds] = useState(0)
  const panel = useRef<HTMLDivElement>(null)
  const autoSleep = useRef(false)
  const warn = useRef(true)

  useEffect(() => {
    const load = (): void => {
      window.steamtv.getSettings().then((s) => {
        autoSleep.current = s.sleepOnControllerOff
        warn.current = s.sleepWarning
      })
    }
    const ask = (): void => {
      setSeconds(ASK_SECONDS)
      setMode('ask')
    }
    // Only over vaporTV itself: a controller dying mid-game mustn't put the box to sleep.
    const disconnected = (event: Event): void => {
      if (!autoSleep.current || !document.hasFocus() || document.visibilityState !== 'visible') return
      if (!switchedOff(event)) return
      window.steamtv.logInput(`sleep: controller switched off (${(event as GamepadEvent).gamepad.id})`)
      if (!warn.current) {
        window.steamtv.power('sleep')
        return
      }
      setMode((current) => {
        if (current) return current
        setSeconds(AUTO_SECONDS)
        return 'auto'
      })
    }
    load()
    window.addEventListener(SLEEP_SETTING_EVENT, load)
    window.addEventListener(SLEEP_EVENT, ask)
    window.addEventListener('gamepaddisconnected', disconnected)
    return () => {
      window.removeEventListener(SLEEP_SETTING_EVENT, load)
      window.removeEventListener(SLEEP_EVENT, ask)
      window.removeEventListener('gamepaddisconnected', disconnected)
    }
  }, [])

  useEffect(() => {
    if (!mode) return
    let done = false
    const sleep = (): void => {
      if (done) return
      done = true
      setMode(null)
      window.steamtv.power('sleep').then((ok) => {
        if (!ok) toast("Couldn't sleep from here")
      })
    }
    const cancel = (): void => {
      done = true
      setMode(null)
    }
    const timer = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) sleep()
        return s - 1
      })
    }, 1000)
    // Asked from the power menu: the controller going off is the go-ahead.
    // Counting down on its own: the controller coming back means it was a blip, or a change of mind.
    const onDisconnect = mode === 'ask' ? (event: Event) => switchedOff(event) && sleep() : undefined
    const onConnect = mode === 'auto' ? cancel : undefined
    if (onDisconnect) window.addEventListener('gamepaddisconnected', onDisconnect)
    if (onConnect) window.addEventListener('gamepadconnected', onConnect)
    window.addEventListener(TRAP_CLOSE_EVENT, cancel)
    const button = panel.current?.querySelector<HTMLElement>('[data-focusable]')
    if (button) focus(button)
    return () => {
      clearInterval(timer)
      if (onDisconnect) window.removeEventListener('gamepaddisconnected', onDisconnect)
      if (onConnect) window.removeEventListener('gamepadconnected', onConnect)
      window.removeEventListener(TRAP_CLOSE_EVENT, cancel)
    }
  }, [mode])

  if (!mode) return null
  return (
    <div className="dialog-backdrop">
      <div className="dialog-panel" ref={panel} data-focus-trap="">
        <h2 className="section-label display">Sleep</h2>
        <p className="dialog-message">
          {mode === 'ask'
            ? 'Switch your controller off now. Press its home button later to wake the box.'
            : 'Controller switched off. Switch it back on to stay awake.'}
          <br />
          Sleeping in {Math.max(seconds, 0)}s.
        </p>
        <button
          className="dialog-button display"
          tabIndex={-1}
          data-focusable=""
          data-select-sound="move"
          onClick={() => window.dispatchEvent(new Event(TRAP_CLOSE_EVENT))}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
