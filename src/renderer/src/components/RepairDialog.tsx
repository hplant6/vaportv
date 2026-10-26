import { useCallback, useEffect, useRef, useState } from 'react'
import type { SetupDamage } from '../../../shared/types'
import { focus, TRAP_CLOSE_EVENT } from '../input/focus'
import { OnScreenKeyboard } from './Keyboard'
import { toast } from './Toast'

// SteamOS updates throw away every /etc change that isn't on their keep list, and with it
// part of setup: the Netflix policy (vaporTV for Netflix stops installing) and the wake rule.
// Checked as vaporTV starts; Repair asks for the admin password on vaporTV's own keyboard
// (Gaming Mode has nothing else to ask with) and puts them back. Later: not again for this.

type Phase = { kind: 'ready' } | { kind: 'typing' } | { kind: 'working' } | { kind: 'failed'; message: string }

const damageKey = (d: SetupDamage): string => (['wake', 'netflix', 'keep'] as const).filter((k) => d[k]).join(',')

function lost(d: SetupDamage): string {
  const parts = [d.netflix && 'Netflix remote control', d.wake && 'waking with the controller'].filter(Boolean)
  return parts.length
    ? `A SteamOS update removed part of vaporTV's setup: ${parts.join(' and ')}.`
    : "SteamOS updates can remove part of vaporTV's setup. Repair once so they keep it."
}

export function RepairDialog() {
  const [damage, setDamage] = useState<SetupDamage | null>(null)
  const pending = useRef<SetupDamage | null>(null)

  // As UpdateDialog: only when vaporTV is in front with nothing else open.
  const tryOpen = useCallback(() => {
    if (!pending.current || !document.hasFocus() || document.querySelector('[data-focus-trap]')) return
    setDamage(pending.current)
    pending.current = null
  }, [])

  useEffect(() => {
    window.steamtv.setup.damage().then((found) => {
      const key = damageKey(found)
      if (!key || found.dismissed === key) return
      pending.current = found
      tryOpen()
    })
    window.addEventListener('focus', tryOpen)
    return () => window.removeEventListener('focus', tryOpen)
  }, [tryOpen])

  if (!damage) return null
  return <Repair damage={damage} onClose={() => setDamage(null)} />
}

function Repair({ damage, onClose }: { damage: SetupDamage; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'ready' })

  const later = useCallback(() => {
    if (phase.kind === 'working' || phase.kind === 'typing') return
    window.steamtv.setup.dismissRepair(damageKey(damage))
    onClose()
  }, [phase.kind, damage, onClose])

  useEffect(() => {
    window.addEventListener(TRAP_CLOSE_EVENT, later)
    return () => window.removeEventListener(TRAP_CLOSE_EVENT, later)
  }, [later])

  // The cursor starts on Repair (or OK), and comes back to it after the keyboard.
  useEffect(() => {
    if (phase.kind === 'typing') return
    const button = panel.current?.querySelector<HTMLElement>('.repair-buttons [data-focusable]')
    if (button) focus(button)
  }, [phase.kind])

  const repair = (password: string): void => {
    setPhase({ kind: 'working' })
    window.steamtv.setup.repair(password).then((err) => {
      if (err) return setPhase({ kind: 'failed', message: err })
      // Chrome reads its policies as it starts.
      toast(damage.netflix ? 'Repaired. Close and reopen Netflix to get the remote working again' : 'Repaired')
      onClose()
    })
  }

  if (phase.kind === 'typing') {
    return (
      <OnScreenKeyboard
        title="Admin password"
        prompt="The one you set with passwd"
        secret
        onDone={repair}
        onCancel={() => setPhase({ kind: 'ready' })}
      />
    )
  }

  const status = !damage.password
    ? 'It needs an admin password, and none is set. In Desktop Mode, run `passwd` in Konsole to set one.'
    : phase.kind === 'working'
      ? 'Repairing…'
      : phase.kind === 'failed'
        ? `Couldn't repair: ${phase.message}`
        : 'Repairing needs your admin password.'

  return (
    <div className="dialog-backdrop">
      <div className="dialog-panel" ref={panel} data-focus-trap="">
        <h2 className="section-label display">Repair vaporTV</h2>
        <p className="dialog-message">{lost(damage)}</p>
        <p className="dialog-message">{status}</p>
        <div className="repair-buttons">
          {damage.password && (
            <button
              className="dialog-button display"
              tabIndex={-1}
              data-focusable=""
              disabled={phase.kind === 'working'}
              onClick={() => setPhase({ kind: 'typing' })}
            >
              {phase.kind === 'failed' ? 'Try again' : 'Repair'}
            </button>
          )}
          <button className="dialog-button display" tabIndex={-1} data-focusable="" data-select-sound="move" disabled={phase.kind === 'working'} onClick={later}>
            {damage.password ? 'Later' : 'OK'}
          </button>
        </div>
      </div>
    </div>
  )
}
