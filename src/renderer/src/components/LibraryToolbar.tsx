import { useState } from 'react'
import { SortMenu } from './SideBar'

// A game tab's toolbar, above its sections: Sort (how every list but Recents is ordered) and
// Genre (only the games of one, in every list). Each a drop-down, as the left bar's Sort was.

export interface ToolbarMenu {
  id: string
  label: string
  value: string
  options: { id: string; name: string }[]
  onPick: (id: string) => void
}

export function LibraryToolbar({ menus }: { menus: ToolbarMenu[] }) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <div className="library-toolbar">
      {menus.map((m) => {
        const id = `library-toolbar-${m.id}`
        return (
          <div className="side-bar-sort library-toolbar-menu" key={m.id}>
            <button
              id={id}
              className={`side-bar-sort-button display${open === m.id ? ' open' : ''}${m.id !== 'sort' && m.value !== m.options[0]?.id ? ' on' : ''}`}
              tabIndex={-1}
              data-focusable=""
              data-select-sound="move"
              aria-haspopup="menu"
              aria-expanded={open === m.id}
              onClick={() => setOpen(m.id)}
            >
              <span className="side-bar-sort-label">
                {m.label}: {m.options.find((o) => o.id === m.value)?.name}
              </span>
              <span className="side-bar-sort-arrow" aria-hidden="true" />
            </button>
            {open === m.id && (
              <SortMenu
                sort={m.value}
                sorts={m.options}
                buttonId={id}
                onPick={(next) => {
                  setOpen(null)
                  if (next !== m.value) m.onPick(next)
                }}
                onClose={() => setOpen(null)}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
