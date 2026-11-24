import { useEffect, useRef, useState } from 'react'
import { isGrid, moveSection, SECTION_STYLES, setHidden, setStyle, type TabSection } from '../../../shared/tabSections'
import type { LayoutTab, PlaylistRow } from '../../../shared/types'
import { focus, OWN_DIRECTION_EVENT, TRAP_CLOSE_EVENT, type Direction } from '../input/focus'
import { play } from '../input/sounds'
import { HOME_CHANGED_EVENT } from '../screens/Settings'
import { OnScreenKeyboard } from './Keyboard'
import type { SideList } from './SideBar'
import { toast } from './Toast'

// A game tab's Customize window (the button at the bottom of its left bar): a row per section,
// in the order they stack down the page. Each row: its name (A picks it up; up and down move it;
// A or B puts it down), its style (A steps through Spotlight, Carousel and the grids), and whether
// it shows; a playlist's row can also rename or delete it. Playlists not on this tab are listed
// under it, to add. Changes are kept as they're made.

interface Props {
  tab: LayoutTab
  label: string
  /** Every list the tab has, shown or not. */
  lists: SideList[]
  sections: TabSection[]
  onSections: (sections: TabSection[]) => void
  onPlaylistsChanged: () => void
  onClose: () => void
}

const styleName = (style: TabSection['style']): string => SECTION_STYLES.find((s) => s.id === style)?.name ?? style

export function TabCustomize({ tab, label, lists, sections, onSections, onPlaylistsChanged, onClose }: Props) {
  const panel = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)
  /** The section picked up to move. */
  const [moving, setMoving] = useState<string | null>(null)
  const [naming, setNaming] = useState<PlaylistRow | null>(null)
  /** A playlist's Delete pressed once: the next press deletes it. */
  const [confirming, setConfirming] = useState<string | null>(null)
  const [allPlaylists, setAllPlaylists] = useState<PlaylistRow[]>([])
  const api = window.steamtv.gamePlaylists

  const refresh = (): void => {
    api.list().then(setAllPlaylists)
  }
  useEffect(refresh, [])

  // Opening: the cursor on the first row's name.
  useEffect(() => {
    if (naming) return
    const first = panel.current?.querySelector<HTMLElement>('.customize-name')
    if (first) focus(first)
    // Only on opening and after renaming.
  }, [naming])

  useEffect(() => {
    if (!confirming) return
    const timer = setTimeout(() => setConfirming(null), 4000)
    return () => clearTimeout(timer)
  }, [confirming])

  // B closes (or puts down what's picked up); while something's picked up, up and down move it.
  useEffect(() => {
    if (naming) return
    const onBack = (): void => (moving ? setMoving(null) : onClose())
    const onDirection = (event: Event): void => {
      const direction = (event as CustomEvent<Direction>).detail
      if (!moving || (direction !== 'up' && direction !== 'down')) return
      const next = moveSection(sections, moving, direction === 'up' ? -1 : 1)
      if (next === sections) return
      play('move')
      onSections(next)
    }
    window.addEventListener(TRAP_CLOSE_EVENT, onBack)
    window.addEventListener(OWN_DIRECTION_EVENT, onDirection)
    return () => {
      window.removeEventListener(TRAP_CLOSE_EVENT, onBack)
      window.removeEventListener(OWN_DIRECTION_EVENT, onDirection)
    }
  }, [naming, moving, sections, onSections, onClose])

  const changed = (): void => {
    refresh()
    onPlaylistsChanged()
    window.dispatchEvent(new Event(HOME_CHANGED_EVENT))
  }

  const reveal = (el: HTMLElement): void => {
    const list = box.current
    const row = el.closest<HTMLElement>('.customize-row') ?? el
    if (!list) return
    if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop
    else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight
  }

  if (naming)
    return (
      <OnScreenKeyboard
        title={`Rename ${naming.name}`}
        initial={naming.name}
        onDone={(text) => {
          const name = text.trim()
          if (name && name !== naming.name)
            api.rename(naming.id, name).then(() => {
              toast(`Renamed to ${name}`)
              changed()
            })
          setNaming(null)
        }}
        onCancel={() => setNaming(null)}
      />
    )

  const nextStyle = (section: TabSection): void => {
    const at = SECTION_STYLES.findIndex((s) => s.id === section.style)
    const style = SECTION_STYLES[(at + 1) % SECTION_STYLES.length].id
    const grid = sections.find((s) => isGrid(s.style) && s.id !== section.id)
    onSections(setStyle(sections, section.id, style))
    if (isGrid(style)) toast(grid ? `A grid goes at the bottom: ${lists.find((l) => l.id === grid.id)?.name ?? 'the other'} is a carousel now` : 'A grid goes at the bottom')
  }

  const toggleShown = (section: TabSection): void => {
    const next = setHidden(sections, section.id, !section.hidden)
    if (!next) return toast('Something has to show on the tab')
    onSections(next)
  }

  const remove = (playlist: PlaylistRow): void => {
    if (confirming !== playlist.id) return setConfirming(playlist.id)
    setConfirming(null)
    api.delete(playlist.id).then(() => {
      toast(`Deleted ${playlist.name}`)
      changed()
      const first = panel.current?.querySelector<HTMLElement>('.customize-name')
      if (first) focus(first)
    })
  }

  const addHere = (playlist: PlaylistRow): void => {
    api.setShowOn(playlist.id, [...playlist.showOn, tab]).then(() => {
      toast(`${playlist.name} is on this tab now`)
      changed()
    })
  }

  const elsewhere = allPlaylists.filter((p) => !p.showOn.includes(tab))

  return (
    <div className="dialog-backdrop">
      <div className="dialog-panel customize-panel" ref={panel} data-focus-trap="" {...(moving ? { 'data-own-directions': '' } : {})}>
        <h2 className="section-label display">Customize {label}</h2>
        <p className="settings-help">
          {moving ? 'Up and down to move it, A to put it down.' : 'A on a name picks it up to move. The sections stack down the tab in this order; a grid goes last.'}
        </p>
        <div className="customize-list" ref={box}>
          {sections.map((section) => {
            const list = lists.find((l) => l.id === section.id)
            if (!list) return null
            const playlist = section.id.startsWith('playlist:') ? allPlaylists.find((p) => `playlist:${p.id}` === section.id) : undefined
            return (
              <div key={section.id} className={`customize-row${moving === section.id ? ' moving' : ''}${section.hidden ? ' hidden' : ''}`}>
                <button
                  className="customize-name display"
                  tabIndex={-1}
                  data-focusable=""
                  data-select-sound="move"
                  aria-pressed={moving === section.id}
                  onFocus={(e) => reveal(e.currentTarget)}
                  onClick={() => setMoving(moving === section.id ? null : section.id)}
                >
                  <span className="customize-grip" aria-hidden="true">
                    ⠿
                  </span>
                  {list.name}
                  <span className="customize-count">{list.items.length}</span>
                </button>
                <button className="customize-style" tabIndex={-1} data-focusable="" data-select-sound="move" onFocus={(e) => reveal(e.currentTarget)} onClick={() => nextStyle(section)}>
                  {styleName(section.style)}
                </button>
                <button
                  className={`customize-shown${section.hidden ? '' : ' on'}`}
                  tabIndex={-1}
                  data-focusable=""
                  data-select-sound="move"
                  role="switch"
                  aria-checked={!section.hidden}
                  onFocus={(e) => reveal(e.currentTarget)}
                  onClick={() => toggleShown(section)}
                >
                  {section.hidden ? 'Hidden' : 'Shown'}
                </button>
                {playlist ? (
                  <>
                    <button className="customize-action" tabIndex={-1} data-focusable="" data-select-sound="move" onFocus={(e) => reveal(e.currentTarget)} onClick={() => setNaming(playlist)}>
                      Rename
                    </button>
                    <button
                      className={`customize-action${confirming === playlist.id ? ' danger' : ''}`}
                      tabIndex={-1}
                      data-focusable=""
                      data-select-sound="move"
                      onFocus={(e) => reveal(e.currentTarget)}
                      onClick={() => remove(playlist)}
                    >
                      {confirming === playlist.id ? 'Press again' : 'Delete'}
                    </button>
                  </>
                ) : (
                  <span className="customize-spacer" />
                )}
              </div>
            )
          })}
          {elsewhere.length > 0 && <h3 className="settings-heading display">Playlists not on this tab</h3>}
          {elsewhere.map((playlist) => (
            <div key={playlist.id} className="customize-row elsewhere">
              <span className="customize-name display">{playlist.name}</span>
              <button className="customize-action" tabIndex={-1} data-focusable="" data-select-sound="move" onFocus={(e) => reveal(e.currentTarget)} onClick={() => addHere(playlist)}>
                Add to this tab
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
