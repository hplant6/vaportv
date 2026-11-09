import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { GamePlaylist } from '../shared/types'

// Game playlists: your own lists of games from any console and Steam (as ES-DE's custom
// collections), each a row on Home. Kept in the order made (or as moved in Settings),
// games in the order added. Games are kept by id, so a game on a drive that isn't
// plugged in stays in its playlist and comes back with the drive.

const FILE = join(homedir(), '.local', 'share', 'steamtv', 'playlists.json')

export async function readPlaylists(): Promise<GamePlaylist[]> {
  try {
    const stored = JSON.parse(await readFile(FILE, 'utf8'))
    return Array.isArray(stored) ? stored : []
  } catch {
    return []
  }
}

let changing: Promise<unknown> = Promise.resolve()

/** One change at a time: read, change, write back (two at once would lose one). */
function change<T>(edit: (playlists: GamePlaylist[]) => { next: GamePlaylist[]; result: T }): Promise<T> {
  const run = changing.then(async () => {
    const { next, result } = edit(await readPlaylists())
    await mkdir(dirname(FILE), { recursive: true })
    await writeFile(`${FILE}.tmp`, JSON.stringify(next, null, 1))
    await rename(`${FILE}.tmp`, FILE)
    return result
  })
  changing = run.catch(() => {})
  return run
}

// The edits themselves, kept apart from the file for tests.

export function withNew(playlists: GamePlaylist[], name: string, id: string, item?: string): GamePlaylist[] {
  return [...playlists, { id, name, items: item ? [item] : [] }]
}

/** Puts the game in the playlist, or takes it out; `on` is whether it's in it now. */
export function withToggled(playlists: GamePlaylist[], playlist: string, item: string): { next: GamePlaylist[]; on: boolean } {
  let on = false
  const next = playlists.map((p) => {
    if (p.id !== playlist) return p
    on = !p.items.includes(item)
    return { ...p, items: on ? [...p.items, item] : p.items.filter((i) => i !== item) }
  })
  return { next, on }
}

/** One place up or down; unchanged at either end. */
export function withMoved(playlists: GamePlaylist[], playlist: string, direction: 'up' | 'down'): GamePlaylist[] {
  const i = playlists.findIndex((p) => p.id === playlist)
  const j = direction === 'up' ? i - 1 : i + 1
  if (i < 0 || j < 0 || j >= playlists.length) return playlists
  const next = [...playlists]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

export function createPlaylist(name: string, item?: string): Promise<string> {
  const id = `gp${Date.now().toString(36)}`
  return change((playlists) => ({ next: withNew(playlists, name, id, item), result: id }))
}

export function togglePlaylistItem(playlist: string, item: string): Promise<boolean> {
  return change((playlists) => {
    const { next, on } = withToggled(playlists, playlist, item)
    return { next, result: on }
  })
}

export function renamePlaylist(playlist: string, name: string): Promise<void> {
  return change((playlists) => ({ next: playlists.map((p) => (p.id === playlist ? { ...p, name } : p)), result: undefined }))
}

export function movePlaylist(playlist: string, direction: 'up' | 'down'): Promise<void> {
  return change((playlists) => ({ next: withMoved(playlists, playlist, direction), result: undefined }))
}

export function deletePlaylist(playlist: string): Promise<void> {
  return change((playlists) => ({ next: playlists.filter((p) => p.id !== playlist), result: undefined }))
}

/** A deleted game: out of every playlist. */
export async function forgetInPlaylists(item: string): Promise<void> {
  if (!(await readPlaylists()).some((p) => p.items.includes(item))) return
  await change((playlists) => ({ next: playlists.map((p) => ({ ...p, items: p.items.filter((i) => i !== item) })), result: undefined }))
}
