import { useCallback, useEffect, useRef, useState } from 'react'
import { newPlaylistPlace, PLAYLIST_TABS, playlistPlacesLabel, TAB_LIST } from '../../../shared/tabs'
import type { PlaylistChoice, PlaylistPlace, PlaylistRow } from '../../../shared/types'
import { useTabArrangement } from '../availableTabs'
import { currentScreen } from '../currentScreen'
import { focus, TRAP_CLOSE_EVENT } from '../input/focus'
import { HOME_CHANGED_EVENT } from '../screens/Settings'
import { ActionRow, OverStage } from './GooglePhotos'
import { OnScreenKeyboard } from './Keyboard'
import { toast } from './Toast'
import { ToggleRow } from './ToggleRow'

// Game playlists: your own lists of games from any console and Steam (as ES-DE's custom
// collections), each a row on Home, a list in a tab's left bar, or both. A game's menu (Start,
// or X) puts it in or takes it out of them, or starts a new one with it, for the tab it was
// opened on; Settings → Home names, orders and deletes them, and picks where each shows.

const games = (n: number): string => `${n} ${n === 1 ? 'game' : 'games'}`

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
 * on the console tab it's made from (that tab's left bar), or Home from anywhere else.
 * `made`: whether one was made.
 */
export function NewPlaylistKeyboard({ gameId, gameTitle, onDone }: { gameId?: string; gameTitle?: string; onDone: (made: boolean) => void }) {
  const [place] = useState(() => newPlaylistPlace(currentScreen()))
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

/** The game menu's Playlists step: a row per playlist with Add (Added once the game's in it; pressed again, it comes out), then New playlist. */
export function PlaylistChoices({ gameId, gameTitle, onNew }: { gameId: string; gameTitle: string; onNew: () => void }) {
  const [choices, setChoices] = useState<PlaylistChoice[] | null>(null)

  useEffect(() => {
    window.steamtv.gamePlaylists.forGame(gameId).then(setChoices)
  }, [gameId])

  // The cursor starts on the first row once they're in.
  const loaded = choices !== null
  useEffect(() => {
    const el = loaded && document.querySelector<HTMLElement>('.game-panel .game-settings [data-focusable]')
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
  return (
    <>
      {choices.map((choice) => (
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
      ))}
      <button className="setting-row" tabIndex={-1} data-focusable="" data-select-sound="move" onClick={onNew}>
        <span className="setting-name display">New playlist</span>
        <span className="setting-detail">With this game in it</span>
      </button>
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
export function GamePlaylistsSettings() {
  const [playlists, setPlaylists] = useState<PlaylistRow[] | null>(null)
  const [editing, setEditing] = useState<{ id: string | null; from: HTMLElement | null } | null>(null)

  const reload = useCallback(() => window.steamtv.gamePlaylists.list().then(setPlaylists), [])
  useEffect(() => {
    reload()
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
    if (!next.length) return toast('It has to show somewhere: switch another on first')
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
