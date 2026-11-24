import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { gameTab, newPlaylistPlace, PLAYLIST_TABS, playlistPlacesLabel, playlistTakes, TAB_LIST } from '../../../shared/tabs'
import type { PlaylistChoice, PlaylistPlace, PlaylistRow } from '../../../shared/types'
import { isGrid, SECTION_STYLES, type SectionStyle } from '../../../shared/tabSections'
import { SortMenu } from './SideBar'
import { useTabArrangement } from '../availableTabs'
import { currentScreen } from '../currentScreen'
import { focus, GRAB_CANCEL_EVENT, GRAB_MOVE_EVENT, TRAP_CLOSE_EVENT, type Direction } from '../input/focus'
import { HOME_CHANGED_EVENT } from '../screens/Settings'
import { ActionRow, OverStage } from './GooglePhotos'
import { OnScreenKeyboard } from './Keyboard'
import { toast } from './Toast'
import { ToggleRow } from './ToggleRow'

// Game playlists: your own lists of games from any console and Steam (as ES-DE's custom
// collections), each a row on Home, a list in a tab's left bar, or both. A game's menu (Start,
// or X) puts it in or takes it out of them, or starts a new one with it, for the tab it was
// opened on; Settings → Home names, orders and deletes them, and picks where each shows.

/** "1 title", "5 titles": games, films, shows and episodes alike (a playlist can hold any of them). */
const games = (n: number): string => `${n} ${n === 1 ? 'title' : 'titles'}`

/** Home redraws its playlist rows. */
const homeChanged = (): void => {
  window.dispatchEvent(new Event(HOME_CHANGED_EVENT))
}

/** Where a playlist shows, for a toast: "on Home", "on the Switch tab". */
function onPlace(place: PlaylistPlace): string {
  return place === 'home' ? 'on Home' : `on the ${playlistPlacesLabel([place])} tab`
}

/**
 * A new playlist's name, on vaporTV's keyboard; with `gameId`, that game goes in it. It shows
 * on `place` (a game's menu asks: Home, or the game's own tab), or else on the tab it's made
 * from (that tab's left bar), or Home from anywhere else. `made`: whether one was made.
 */
export function NewPlaylistKeyboard({
  gameId,
  gameTitle,
  place: chosen,
  onDone
}: {
  gameId?: string
  gameTitle?: string
  place?: PlaylistPlace
  onDone: (made: boolean) => void
}) {
  const [place] = useState(() => chosen ?? newPlaylistPlace(currentScreen()))
  return (
    <OnScreenKeyboard
      title="New playlist"
      prompt={gameTitle ? `What should it be called? ${gameTitle} goes in it first.` : 'What should it be called?'}
      initial=""
      onDone={(text) => {
        const name = text.trim()
        if (!name) return onDone(false)
        window.steamtv.gamePlaylists
          .create(name, [place], gameId)
          .then(() => {
            toast(gameTitle ? `Made ${name} ${onPlace(place)}, with ${gameTitle} in it` : `Made ${name} ${onPlace(place)}`)
            homeChanged()
            onDone(true)
          })
          .catch(() => {
            toast(`Couldn’t make ${name}`)
            onDone(false)
          })
      }}
      onCancel={() => onDone(false)}
    />
  )
}

/**
 * The game menu's Playlists step: a row per playlist that can take the game (Home's, and its
 * own tab's) with Add (Added once the game's in it; pressed again, it comes out). The New
 * playlist buttons sit below the box (NewPlaylistButtons).
 */
export function PlaylistChoices({ gameId, gameTitle }: { gameId: string; gameTitle: string }) {
  const tab = gameTab(gameId)
  const [choices, setChoices] = useState<PlaylistChoice[] | null>(null)

  useEffect(() => {
    window.steamtv.gamePlaylists.forGame(gameId).then(setChoices)
  }, [gameId])

  // The cursor starts on the first row once they're in (none yet: the first New button).
  const loaded = choices !== null
  useEffect(() => {
    const el = loaded && document.querySelector<HTMLElement>('.game-panel .game-settings [data-focusable], .game-panel .game-footer [data-focusable]')
    if (el) focus(el)
  }, [loaded])

  const toggle = (choice: PlaylistChoice): void => {
    window.steamtv.gamePlaylists.toggle(choice.id, gameId).then((on) => {
      setChoices((list) => list?.map((c) => (c.id === choice.id ? { ...c, has: on, count: c.count + (on ? 1 : -1) } : c)) ?? null)
      toast(on ? `Added ${gameTitle} to ${choice.name}` : `Took ${gameTitle} out of ${choice.name}`)
      homeChanged()
    })
  }

  if (!choices) return null
  // One on another console's tab is for that console's games, so it isn't offered (unless the game's in it, to take it out).
  const open = choices.filter((choice) => choice.has || playlistTakes(choice.showOn, tab))
  const tabName = tab && playlistPlacesLabel([tab])
  // Under a heading each: Home's (any system; one on Home and a tab too is here), the game's own tab's, and any other.
  const sections: [string, PlaylistChoice[]][] = [
    ['Home playlists', open.filter((c) => c.showOn.includes('home'))],
    [`${tabName} tab playlists`, open.filter((c) => !c.showOn.includes('home') && tab !== null && c.showOn.includes(tab))],
    ['Other playlists', open.filter((c) => !c.showOn.includes('home') && (tab === null || !c.showOn.includes(tab)))]
  ]
  return (
    <>
      {sections.map(
        ([title, list]) =>
          list.length > 0 && [
            <h4 key={title} className="playlist-section display">
              {title}
            </h4>,
            ...list.map((choice) => (
              <button
                key={choice.id}
                className="setting-row playlist-choice"
                tabIndex={-1}
                aria-label={`${choice.has ? 'Remove from' : 'Add to'} ${choice.name}`}
                data-focusable=""
                data-select-sound="move"
                onClick={() => toggle(choice)}
              >
                <span className="setting-name display">{choice.name}</span>
                <span className="setting-detail">{`${games(choice.count)} · ${playlistPlacesLabel(choice.showOn)}`}</span>
                <span className={`playlist-action display${choice.has ? ' added' : ''}`} aria-hidden="true">
                  {choice.has ? 'Added ✓' : 'Add'}
                </span>
              </button>
            ))
          ]
      )}
      {open.length === 0 && <p className="settings-help">No playlists for this game yet. Make one below.</p>}
    </>
  )
}

/**
 * Below a game's playlists, side by side: a new Home playlist, which can mix games from any
 * system, and (a game on a tab) a new one for its own tab, for that console's games only.
 */
export function NewPlaylistButtons({ gameId, onNew }: { gameId: string; onNew: (place: PlaylistPlace) => void }) {
  const tab = gameTab(gameId)
  const tabName = tab && playlistPlacesLabel([tab])
  const button = (place: PlaylistPlace, name: string, detail: string) => (
    <button key={place} className="playlist-new" tabIndex={-1} data-focusable="" data-select-sound="move" onClick={() => onNew(place)}>
      <span className="playlist-new-name display">{name}</span>
      <span className="playlist-new-detail">{detail}</span>
    </button>
  )
  return (
    <>
      {button('home', 'New Home playlist', 'Shows on Home. Games from any system')}
      {tab && tabName && button(tab, `New ${tabName} playlist`, `Shows on the ${tabName} tab. ${tabName} games only`)}
    </>
  )
}

/** How many playlists a game is in, for its menu row; counted again when `recount` changes (back from Playlists). */
export function usePlaylistCount(gameId: string, recount: unknown): number | null {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    window.steamtv.gamePlaylists.forGame(gameId).then((list) => setCount(list.filter((c) => c.has).length))
  }, [gameId, recount])
  return count
}

/** Settings → Home → Game playlists: each one (A to edit), then New playlist. */
/** About how tall the style drop-down is (four choices). */
const STYLE_MENU_ROOM = 320

/**
 * Settings → Home: the playlists' rows on Home, as a tab's Customize window has its sections: a
 * row each, in the order they show (under everything else on Home). Each row: its name (A picks
 * it up; up and down move it; A or B puts it down), its style (a drop-down: Spotlight, Carousel or
 * a grid, which goes to the bottom), whether it shows on Home (a switch), rename and delete (icon
 * buttons; delete asks for a second press). Changes are kept as they're made. The order is the
 * playlists' own, so a tab's left bar lists them so too.
 */
export function HomePlaylistsSettings() {
  const group = useRef<HTMLDivElement>(null)
  const [rows, setRows] = useState<PlaylistRow[] | null>(null)
  /** The playlist picked up to move. */
  const [moving, setMoving] = useState<string | null>(null)
  const [naming, setNaming] = useState<PlaylistRow | null>(null)
  /** A playlist's Delete pressed once: the next press deletes it. */
  const [confirming, setConfirming] = useState<string | null>(null)
  /** The playlist whose style drop-down is open, and where its button is in the group. */
  const [styleMenu, setStyleMenu] = useState<{ id: string; top: number; left: number; width: number; height: number; up: boolean } | null>(null)
  const api = window.steamtv.gamePlaylists
  const reload = useCallback(() => api.list().then(setRows), [])
  useEffect(() => {
    reload()
    // Changed elsewhere (a playlist's window under Game playlists, a game's X menu): this follows.
    window.addEventListener(HOME_CHANGED_EVENT, reload)
    return () => window.removeEventListener(HOME_CHANGED_EVENT, reload)
  }, [reload])
  const changed = (): Promise<unknown> => reload().then(homeChanged)

  useEffect(() => {
    if (!confirming) return
    const timer = setTimeout(() => setConfirming(null), 4000)
    return () => clearTimeout(timer)
  }, [confirming])

  // The name keeps the cursor as its row moves, and the pane follows it.
  useLayoutEffect(() => {
    if (!moving) return
    const name = document.querySelector<HTMLElement>(`.customize-name[data-playlist-id="${moving}"]`)
    if (!name) return
    if (document.activeElement !== name) focus(name)
    else name.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
  }, [moving, rows])

  // Picked up: up and down move it (kept as it goes), B puts it down as A does.
  useEffect(() => {
    if (!moving || !rows) return
    const onMove = (event: Event): void => {
      const direction = (event as CustomEvent<Direction>).detail
      const i = rows.findIndex((r) => r.id === moving)
      const j = direction === 'up' ? i - 1 : direction === 'down' ? i + 1 : -1
      if (i < 0 || j < 0 || j >= rows.length) return
      const next = [...rows]
      ;[next[i], next[j]] = [next[j], next[i]]
      setRows(next)
      api.order(next.map((r) => r.id)).then(homeChanged)
    }
    const onPutDown = (): void => setMoving(null)
    window.addEventListener(GRAB_MOVE_EVENT, onMove)
    window.addEventListener(GRAB_CANCEL_EVENT, onPutDown)
    return () => {
      window.removeEventListener(GRAB_MOVE_EVENT, onMove)
      window.removeEventListener(GRAB_CANCEL_EVENT, onPutDown)
    }
  }, [moving, rows])

  const toggle = (p: PlaylistRow): void => {
    const on = !p.showOn.includes('home')
    const showOn: PlaylistPlace[] = on ? [...p.showOn, 'home'] : p.showOn.filter((place) => place !== 'home')
    setRows((was) => was && was.map((r) => (r.id === p.id ? { ...r, showOn } : r)))
    api.setShowOn(p.id, showOn).then(homeChanged)
  }

  const chooseStyle = (p: PlaylistRow, style: SectionStyle): void => {
    if (style === p.homeStyle) return
    const grid = rows?.find((r) => r.id !== p.id && isGrid(r.homeStyle))
    api.setHomeStyle(p.id, style).then(changed)
    if (isGrid(style)) toast(grid ? `A grid goes at the bottom: ${grid.name} is a carousel now` : 'A grid goes at the bottom')
  }

  // The drop-down hangs from its button, placed in the group (as Customize's is in its panel).
  const openStyleMenu = (p: PlaylistRow, button: HTMLElement): void => {
    const el = group.current
    if (!el) return
    const g = el.getBoundingClientRect()
    const b = button.getBoundingClientRect()
    // Measured as shown on the screen, the stage scaled to fit the TV: back to the group's own pixels.
    const scale = g.width / el.offsetWidth || 1
    setStyleMenu({
      id: p.id,
      top: (b.top - g.top) / scale,
      left: (b.left - g.left) / scale,
      width: b.width / scale,
      height: b.height / scale,
      up: b.bottom + STYLE_MENU_ROOM * scale > window.innerHeight
    })
  }

  const remove = (p: PlaylistRow): void => {
    if (confirming !== p.id) {
      toast(`Press again to delete ${p.name}`)
      return setConfirming(p.id)
    }
    setConfirming(null)
    api.delete(p.id).then(() => {
      toast(`Deleted ${p.name}`)
      changed()
    })
  }

  if (!rows?.length) return null
  const menuFor = styleMenu && rows.find((r) => r.id === styleMenu.id)
  return (
    <div className="settings-group home-playlists" ref={group}>
      <h3 className="settings-heading display">Playlists on Home</h3>
      <p className="settings-help">
        {moving
          ? 'Up and down to move it, A to put it down.'
          : 'They show on Home in this order, under everything else. A on a name picks it up to move it; a grid goes to the bottom.'}
      </p>
      <div className="setting-list" data-focus-memory="settings-home-playlists">
        {rows.map((p) => {
          const shown = p.showOn.includes('home')
          return (
            <div key={p.id} className={`customize-row${moving === p.id ? ' moving' : ''}${shown ? '' : ' hidden'}`}>
              <button
                className="customize-name display"
                tabIndex={-1}
                data-focusable=""
                data-select-sound="move"
                data-playlist-id={p.id}
                aria-pressed={moving === p.id}
                {...(moving === p.id ? { 'data-grabbed': '' } : {})}
                onClick={() => setMoving(moving === p.id ? null : p.id)}
              >
                <span className="customize-grip" aria-hidden="true">
                  ⠿
                </span>
                {p.name}
                <span className="customize-count">{p.items.length}</span>
              </button>
              <button
                id={`home-playlist-style-${p.id}`}
                className={`customize-style${styleMenu?.id === p.id ? ' open' : ''}`}
                tabIndex={-1}
                data-focusable=""
                data-select-sound="move"
                aria-haspopup="menu"
                aria-expanded={styleMenu?.id === p.id}
                onClick={(e) => openStyleMenu(p, e.currentTarget)}
              >
                <span>{SECTION_STYLES.find((st) => st.id === p.homeStyle)?.name ?? p.homeStyle}</span>
                <span className="side-bar-sort-arrow" aria-hidden="true" />
              </button>
              <button
                className={`customize-shown${shown ? ' on' : ''}`}
                tabIndex={-1}
                data-focusable=""
                data-select-sound="move"
                role="switch"
                aria-checked={shown}
                aria-label={`${p.name} on Home: ${shown ? 'on' : 'off'}`}
                onClick={() => toggle(p)}
              >
                <span className="toggle" aria-hidden="true">
                  <span className="toggle-knob" />
                </span>
                {shown ? 'On' : 'Off'}
              </button>
              <button
                className="customize-icon"
                tabIndex={-1}
                data-focusable=""
                data-select-sound="move"
                aria-label={`Rename ${p.name}`}
                title="Rename"
                onClick={() => setNaming(p)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />
                </svg>
              </button>
              <button
                className={`customize-icon${confirming === p.id ? ' danger' : ''}`}
                tabIndex={-1}
                data-focusable=""
                data-select-sound="move"
                aria-label={confirming === p.id ? `Press again to delete ${p.name}` : `Delete ${p.name}`}
                title="Delete"
                onClick={() => remove(p)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5" />
                </svg>
              </button>
            </div>
          )
        })}
      </div>
      {styleMenu && menuFor && (
        <div className={`customize-menu-anchor${styleMenu.up ? ' up' : ''}`} style={{ top: styleMenu.top, left: styleMenu.left, width: styleMenu.width, height: styleMenu.height }}>
          <SortMenu
            sort={menuFor.homeStyle}
            sorts={SECTION_STYLES}
            buttonId={`home-playlist-style-${menuFor.id}`}
            onPick={(style) => {
              setStyleMenu(null)
              chooseStyle(menuFor, style as SectionStyle)
            }}
            onClose={() => setStyleMenu(null)}
          />
        </div>
      )}
      {naming && (
        <OverStage>
          <OnScreenKeyboard
            title={`Rename ${naming.name}`}
            initial={naming.name}
            onDone={(text) => {
              const name = text.trim()
              const was = naming
              setNaming(null)
              if (name && name !== was.name)
                api.rename(was.id, name).then(() => {
                  toast(`Renamed to ${name}`)
                  changed()
                })
            }}
            onCancel={() => setNaming(null)}
          />
        </OverStage>
      )}
    </div>
  )
}

export function GamePlaylistsSettings() {
  const [playlists, setPlaylists] = useState<PlaylistRow[] | null>(null)
  const [editing, setEditing] = useState<{ id: string | null; from: HTMLElement | null } | null>(null)

  const reload = useCallback(() => window.steamtv.gamePlaylists.list().then(setPlaylists), [])
  useEffect(() => {
    reload()
    // Switched on or off Home, or moved, in Playlists on Home (above).
    window.addEventListener(HOME_CHANGED_EVENT, reload)
    return () => window.removeEventListener(HOME_CHANGED_EVENT, reload)
  }, [reload])

  const open = (id: string | null): void => setEditing({ id, from: document.activeElement as HTMLElement | null })
  const close = (): void => {
    const from = editing?.from
    setEditing(null)
    reload().then(() => {
      if (from?.isConnected) focus(from)
    })
  }

  const current = editing?.id ? playlists?.find((p) => p.id === editing.id) : undefined
  return (
    <div className="settings-group">
      <h3 className="settings-heading display">Game playlists</h3>
      <p className="settings-help">
        Your own lists of games from any console and Steam, each a row on Home, a list on a console’s tab, or both. Press X on a game to put it in
        one.
      </p>
      <div className="setting-list" data-focus-memory="settings-game-playlists">
        {playlists?.map((p) => (
          <ActionRow key={p.id} label={p.name} detail={`${games(p.items.length)} · ${playlistPlacesLabel(p.showOn)}`} onSelect={() => open(p.id)} />
        ))}
        <ActionRow label="New playlist" detail="Name it here, then add games from their menus" onSelect={() => open(null)} />
      </div>
      {editing && (
        <OverStage>
          {editing.id === null ? (
            <NewPlaylistKeyboard onDone={close} />
          ) : (
            current && playlists && (
              <GamePlaylistDialog
                playlist={current}
                index={playlists.indexOf(current)}
                total={playlists.length}
                onChanged={() => {
                  reload()
                  homeChanged()
                }}
                onClose={close}
              />
            )
          )}
        </OverStage>
      )}
    </div>
  )
}

/** One playlist: its name, where it shows, its place in the order, its games (switch one off to take it out), and Delete. */
function GamePlaylistDialog({
  playlist,
  index,
  total,
  onChanged,
  onClose
}: {
  playlist: PlaylistRow
  index: number
  total: number
  onChanged: () => void
  onClose: () => void
}) {
  const panel = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [naming, setNaming] = useState(false)
  const [confirming, setConfirming] = useState(false)
  // The games it had on opening stay listed, so one switched off by mistake can go back in.
  const [shown] = useState(playlist.items)
  const inIt = new Set(playlist.items.map((i) => i.id))
  const api = window.steamtv.gamePlaylists
  // Home and the tabs that show (a tab switched off, or with no games, isn't offered unless it's already chosen).
  const arrangement = useTabArrangement()
  const showing = new Set<string>([...arrangement.bar, ...arrangement.more, ...playlist.showOn])
  const places: PlaylistPlace[] = ['home', ...PLAYLIST_TABS.filter((tab) => showing.has(tab))]

  useEffect(() => {
    if (naming) return
    window.addEventListener(TRAP_CLOSE_EVENT, onClose)
    return () => window.removeEventListener(TRAP_CLOSE_EVENT, onClose)
  }, [naming, onClose])

  useEffect(() => {
    if (naming) return
    const first = panel.current?.querySelector<HTMLElement>('[data-focusable]')
    if (first) focus(first)
  }, [naming])

  useEffect(() => {
    if (!confirming) return
    const timer = setTimeout(() => setConfirming(false), 4000)
    return () => clearTimeout(timer)
  }, [confirming])

  const reveal = (el: HTMLElement): void => {
    const box = list.current
    if (!box) return
    if (el.offsetTop < box.scrollTop) box.scrollTop = el.offsetTop
    else if (el.offsetTop + el.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = el.offsetTop + el.offsetHeight - box.clientHeight
  }

  if (naming)
    return (
      <OnScreenKeyboard
        title={`Rename ${playlist.name}`}
        initial={playlist.name}
        onDone={(text) => {
          const name = text.trim()
          if (name && name !== playlist.name) api.rename(playlist.id, name).then(onChanged)
          setNaming(false)
        }}
        onCancel={() => setNaming(false)}
      />
    )

  const action = (label: string, detail: string, onClick: () => void, extra = '') => (
    <button
      className={`setting-row${extra}`}
      tabIndex={-1}
      data-focusable=""
      data-select-sound="move"
      onFocus={(e) => reveal(e.currentTarget)}
      onClick={onClick}
    >
      <span className="setting-name display">{label}</span>
      <span className="setting-detail">{detail}</span>
    </button>
  )

  const move = (direction: 'up' | 'down'): void => {
    api.move(playlist.id, direction).then(onChanged)
    toast(direction === 'up' ? `${playlist.name} moved up` : `${playlist.name} moved down`)
  }

  const toggleShowOn = (place: PlaylistPlace): void => {
    const on = !playlist.showOn.includes(place)
    const next = on ? [...playlist.showOn, place] : playlist.showOn.filter((p) => p !== place)
    api.setShowOn(playlist.id, next).then(onChanged)
    toast(on ? `${playlist.name} shows ${onPlace(place)}` : `${playlist.name} is off ${place === 'home' ? 'Home' : `the ${playlistPlacesLabel([place])} tab`}`)
  }

  const remove = (): void => {
    if (!confirming) return setConfirming(true)
    api.delete(playlist.id).then(() => {
      toast(`Deleted ${playlist.name}`)
      onChanged()
      onClose()
    })
  }

  return (
    <div className="dialog-backdrop">
      <div className="dialog-panel artwork-panel" ref={panel} data-focus-trap="">
        <h2 className="section-label display">{playlist.name}</h2>
        <div className="artwork-list" ref={list}>
          {action('Name', 'Change what it’s called', () => setNaming(true))}
          {total > 1 && action('Move up', `${index + 1} of ${total} playlists`, () => (index > 0 ? move('up') : toast('It’s already first')))}
          {total > 1 && action('Move down', `${index + 1} of ${total} playlists`, () => (index < total - 1 ? move('down') : toast('It’s already last')))}
          <h3 className="settings-heading display">Show on</h3>
          {places.map((place) => (
            <ToggleRow
              key={place}
              label={TAB_LIST.find((tab) => tab.id === place)?.label ?? place}
              detail={place === 'home' ? 'A row on Home' : 'In the tab’s list'}
              on={playlist.showOn.includes(place)}
              onToggle={() => toggleShowOn(place)}
              onFocus={reveal}
            />
          ))}
          <h3 className="settings-heading display">Games</h3>
          {shown.length === 0 && <p className="settings-help">No games yet. Press Start on a game, then Playlists.</p>}
          {shown.map((item) => (
            <ToggleRow
              key={item.id}
              label={item.title}
              on={inIt.has(item.id)}
              onToggle={() => api.toggle(playlist.id, item.id).then(onChanged)}
              onFocus={reveal}
            />
          ))}
          {action(confirming ? 'Press A again to delete' : 'Delete playlist', 'The games stay', remove, confirming ? ' danger' : '')}
        </div>
      </div>
    </div>
  )
}
