import { useEffect, useRef, useState } from 'react'
import { isGrid, moveSection, SECTION_STYLES, setHidden, setStyle, type SectionStyle, type TabSection } from '../../../shared/tabSections'
import type { LayoutTab, PlaylistRow } from '../../../shared/types'
import { focus, OWN_DIRECTION_EVENT, TRAP_CLOSE_EVENT, type Direction } from '../input/focus'
import { play } from '../input/sounds'
import { HOME_CHANGED_EVENT } from '../screens/Settings'
import { OnScreenKeyboard } from './Keyboard'
import { SortMenu, type SideList } from './SideBar'
import { toast } from './Toast'

// A game tab's Customize window (the button at the bottom of its left bar): a row per section,
// in the order they stack down the page. Each row: its name (A picks it up; up and down move it;
// A or B puts it down), its style (a drop-down: Spotlight, Carousel or a grid), whether it shows
// (a switch), and, for a playlist, rename and delete (icon buttons; delete asks for a second
// press). Changes are kept as they're made.

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

/** About how tall the style drop-down is (four choices). */
const MENU_ROOM = 320

const styleName = (style: TabSection['style']): string => SECTION_STYLES.find((s) => s.id === style)?.name ?? style

export function TabCustomize({ label, lists, sections, onSections, onPlaylistsChanged, onClose }: Props) {
  const panel = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)
  /** The section picked up to move. */
  const [moving, setMoving] = useState<string | null>(null)
  const [naming, setNaming] = useState<PlaylistRow | null>(null)
  /** A playlist's Delete pressed once: the next press deletes it. */
  const [confirming, setConfirming] = useState<string | null>(null)
  /** The section whose style drop-down is open, and where its button is in the panel. */
  const [styleMenu, setStyleMenu] = useState<{ id: string; top: number; left: number; width: number; height: number; up: boolean } | null>(null)
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
    const onBack = (): void => {
      // An open drop-down closes itself.
      if (styleMenu) return
      if (moving) setMoving(null)
      else onClose()
    }
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
  }, [naming, moving, styleMenu, sections, onSections, onClose])

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

  const chooseStyle = (section: TabSection, style: SectionStyle): void => {
    if (style === section.style) return
    const grid = sections.find((s) => isGrid(s.style) && s.id !== section.id)
    onSections(setStyle(sections, section.id, style))
    if (isGrid(style)) toast(grid ? `A grid goes at the bottom: ${lists.find((l) => l.id === grid.id)?.name ?? 'the other'} is a carousel now` : 'A grid goes at the bottom')
  }

  const toggleShown = (section: TabSection): void => {
    const next = setHidden(sections, section.id, !section.hidden)
    if (!next) return toast('Something has to show on the tab')
    onSections(next)
  }

  // The drop-down hangs from its button, placed in the panel (the list scrolls, and would cut it off).
  const openStyleMenu = (section: TabSection, button: HTMLElement): void => {
    const p = panel.current?.getBoundingClientRect()
    const b = button.getBoundingClientRect()
    if (!p) return
    // Upward when there isn't room for its four choices below.
    setStyleMenu({ id: section.id, top: b.top - p.top, left: b.left - p.left, width: b.width, height: b.height, up: b.bottom + MENU_ROOM > window.innerHeight })
  }

  const remove = (playlist: PlaylistRow): void => {
    if (confirming !== playlist.id) {
      toast(`Press again to delete ${playlist.name}`)
      return setConfirming(playlist.id)
    }
    setConfirming(null)
    api.delete(playlist.id).then(() => {
      toast(`Deleted ${playlist.name}`)
      changed()
      const first = panel.current?.querySelector<HTMLElement>('.customize-name')
      if (first) focus(first)
    })
  }

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
                <button
                  id={`customize-style-${section.id}`}
                  className={`customize-style${styleMenu?.id === section.id ? ' open' : ''}`}
                  tabIndex={-1}
                  data-focusable=""
                  data-select-sound="move"
                  aria-haspopup="menu"
                  aria-expanded={styleMenu?.id === section.id}
                  onFocus={(e) => reveal(e.currentTarget)}
                  onClick={(e) => openStyleMenu(section, e.currentTarget)}
                >
                  <span>{styleName(section.style)}</span>
                  <span className="side-bar-sort-arrow" aria-hidden="true" />
                </button>
                <button
                  className={`customize-shown${section.hidden ? '' : ' on'}`}
                  tabIndex={-1}
                  data-focusable=""
                  data-select-sound="move"
                  role="switch"
                  aria-checked={!section.hidden}
                  onFocus={(e) => reveal(e.currentTarget)}
                  aria-label={`${list.name}: ${section.hidden ? 'off' : 'on'}`}
                  onClick={() => toggleShown(section)}
                >
                  <span className="toggle" aria-hidden="true">
                    <span className="toggle-knob" />
                  </span>
                  {section.hidden ? 'Off' : 'On'}
                </button>
                {playlist ? (
                  <>
                    <button
                      className="customize-icon"
                      tabIndex={-1}
                      data-focusable=""
                      data-select-sound="move"
                      aria-label={`Rename ${playlist.name}`}
                      title="Rename"
                      onFocus={(e) => reveal(e.currentTarget)}
                      onClick={() => setNaming(playlist)}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />
                      </svg>
                    </button>
                    <button
                      className={`customize-icon${confirming === playlist.id ? ' danger' : ''}`}
                      tabIndex={-1}
                      data-focusable=""
                      data-select-sound="move"
                      aria-label={confirming === playlist.id ? `Press again to delete ${playlist.name}` : `Delete ${playlist.name}`}
                      title="Delete"
                      onFocus={(e) => reveal(e.currentTarget)}
                      onClick={() => remove(playlist)}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5" />
                      </svg>
                    </button>
                  </>
                ) : (
                  <>
                    <span className="customize-spacer" />
                    <span className="customize-spacer" />
                  </>
                )}
              </div>
            )
          })}
        </div>
        {styleMenu &&
          (() => {
            const section = sections.find((x) => x.id === styleMenu.id)
            if (!section) return null
            return (
              <div className={`customize-menu-anchor${styleMenu.up ? ' up' : ''}`} style={{ top: styleMenu.top, left: styleMenu.left, width: styleMenu.width, height: styleMenu.height }}>
                <SortMenu
                  sort={section.style}
                  sorts={SECTION_STYLES}
                  buttonId={`customize-style-${section.id}`}
                  onPick={(style) => {
                    setStyleMenu(null)
                    chooseStyle(section, style as SectionStyle)
                  }}
                  onClose={() => setStyleMenu(null)}
                />
              </div>
            )
          })()}
      </div>
    </div>
  )
}
