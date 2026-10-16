import { useEffect, useRef, useState } from 'react'
import type { PowerAction } from '../../../shared/types'
import { focus, TRAP_CLOSE_EVENT } from '../input/focus'
import { requestSleep } from './SleepPrompt'
import { toast } from './Toast'

const ITEMS: { action: PowerAction; label: string }[] = [
  { action: 'desktop', label: 'Exit to Desktop' },
  { action: 'steam', label: 'Exit to Steam' },
  { action: 'sleep', label: 'Sleep' },
  { action: 'poweroff', label: 'Power Off' }
]

// Power Off needs a second press within this long, so a stray press can't turn the box off.
const CONFIRM_MS = 4000

/** The power icon's drop-down. Up/down and A inside it; B closes it. */
export function PowerMenu({ onClose }: { onClose: () => void }) {
  const menu = useRef<HTMLDivElement>(null)
  const [confirming, setConfirming] = useState(false)

  const close = (): void => {
    onClose()
    const button = document.getElementById('power-button')
    if (button) focus(button)
  }

  // Open with the cursor on the first item; B closes.
  useEffect(() => {
    const first = menu.current?.querySelector<HTMLElement>('[data-focusable]')
    if (first) focus(first)
    window.addEventListener(TRAP_CLOSE_EVENT, close)
    return () => window.removeEventListener(TRAP_CLOSE_EVENT, close)
  }, [])

  useEffect(() => {
    if (!confirming) return
    const timer = setTimeout(() => setConfirming(false), CONFIRM_MS)
    return () => clearTimeout(timer)
  }, [confirming])

  const choose = (action: PowerAction): void => {
    if (action === 'poweroff' && !confirming) {
      setConfirming(true)
      return
    }
    if (action === 'sleep') {
      close()
      requestSleep()
      return
    }
    window.steamtv.power(action).then((ok) => {
      if (!ok) toast("Couldn't do that from here")
    })
    close()
  }

  return (
    <div className="power-menu" role="menu" ref={menu} data-focus-trap="">
      {ITEMS.map((item) => (
        <button
          key={item.action}
          className={`power-item${item.action === 'poweroff' && confirming ? ' confirm' : ''}`}
          role="menuitem"
          tabIndex={-1}
          data-focusable=""
          data-select-sound="move"
          onClick={() => choose(item.action)}
        >
          {item.action === 'poweroff' && confirming ? 'Press A again to power off' : item.label}
        </button>
      ))}
    </div>
  )
}
