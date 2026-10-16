import { useEffect, useRef, useState } from 'react'
import type { ArcadeCores } from '../../../shared/types'
import { CORE_EVENT, focus, TRAP_CLOSE_EVENT } from '../input/focus'
import { toast } from './Toast'

// Start on an arcade game: which RetroArch core it opens in. Some sets only run in
// the MAME version they were dumped for, so a game can be moved to another core.

export function CoreDialog() {
  const [item, setItem] = useState<{ id: string; card: HTMLElement } | null>(null)

  useEffect(() => {
    const open = (event: Event): void => {
      const card = (event as CustomEvent<HTMLElement>).detail
      const id = card.dataset.itemId
      if (!id) return
      if (!id.startsWith('arcade:')) return toast('Only arcade games have a choice of core')
      setItem({ id, card })
    }
    window.addEventListener(CORE_EVENT, open)
    return () => window.removeEventListener(CORE_EVENT, open)
  }, [])

  if (!item) return null
  return (
    <Cores
      id={item.id}
      onClose={() => {
        setItem(null)
        if (item.card.isConnected) focus(item.card)
      }}
    />
  )
}

function Cores({ id, onClose }: { id: string; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  const [cores, setCores] = useState<ArcadeCores | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.steamtv.arcadeCores
      .get(id)
      .then(setCores)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }, [id])

  useEffect(() => {
    window.addEventListener(TRAP_CLOSE_EVENT, onClose)
    return () => window.removeEventListener(TRAP_CLOSE_EVENT, onClose)
  }, [onClose])

  // The cursor starts on the core it uses now.
  useEffect(() => {
    if (!cores) return
    const current = panel.current?.querySelector<HTMLElement>('[aria-checked="true"]') ?? panel.current?.querySelector<HTMLElement>('[data-focusable]')
    if (current) focus(current)
  }, [cores])

  const choose = (core: string, name: string): void => {
    if (!cores) return
    if (core === cores.current) return onClose()
    window.steamtv.arcadeCores.set(id, core === cores.defaultCore ? null : core).then(() => {
      toast(`${cores.title} will open in ${name}`)
      onClose()
    })
  }

  return (
    <div className="dialog-backdrop">
      <div className="dialog-panel artwork-panel" ref={panel} data-focus-trap="">
        <h2 className="section-label display">{cores ? `Core for ${cores.title}` : 'Core'}</h2>
        {error && <p className="dialog-message">{error}</p>}
        {cores && (
          <>
            <p className="dialog-message">Which RetroArch core opens this game?</p>
            <div className="artwork-list">
              {cores.choices.map((core) => (
                <button
                  key={core.id}
                  className={`setting-row${core.id === cores.current ? ' on' : ''}`}
                  tabIndex={-1}
                  role="radio"
                  aria-checked={core.id === cores.current}
                  data-focusable=""
                  data-select-sound="move"
                  onClick={() => choose(core.id, core.name)}
                >
                  <span className="radio" aria-hidden="true" />
                  <span className="setting-name display">{core.name}</span>
                  {core.id === cores.defaultCore && <span className="setting-detail">Default</span>}
                </button>
              ))}
            </div>
            {cores.choices.length === 0 && <p className="dialog-message">No RetroArch core that runs this board is installed.</p>}
          </>
        )}
      </div>
    </div>
  )
}
