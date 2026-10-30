import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const DATA = join(homedir(), '.local', 'share', 'steamtv')
// When steamtv launched things Steam doesn't track (emulated games): id → unix seconds.
const HISTORY = join(DATA, 'history.json')
// How long things steamtv launched itself (emulators, apps it runs directly) have run: id → seconds.
const PLAYTIME = join(DATA, 'playtime.json')
// Games marked as favourites in steamtv (Switch for now), in the order added.
const FAVORITES = join(DATA, 'favorites.json')

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(`${path}.tmp`, JSON.stringify(value, null, 1))
  await rename(`${path}.tmp`, path)
}

let changing: Promise<unknown> = Promise.resolve()

/**
 * One change at a time to these files. Each reads a file, changes it and writes it back,
 * so two at once (a game's play time landing as another is recorded) would lose one, or
 * both write the same .tmp.
 */
function inTurn<T>(change: () => Promise<T>): Promise<T> {
  const run = changing.then(change)
  changing = run.catch(() => {})
  return run
}

export async function readHistory(): Promise<Record<string, number>> {
  return JSON.parse(await readFile(HISTORY, 'utf8').catch(() => '{}'))
}

export function recordPlay(id: string, at = Math.floor(Date.now() / 1000)): Promise<void> {
  return inTurn(async () => {
    const history = await readHistory()
    history[id] = at
    await writeJson(HISTORY, history)
  })
}

export async function readPlaytime(): Promise<Record<string, number>> {
  return JSON.parse(await readFile(PLAYTIME, 'utf8').catch(() => '{}'))
}

/** Adds a session's seconds to what `id` has played. */
export async function addPlaytime(id: string, seconds: number): Promise<void> {
  if (!(seconds > 0)) return
  return inTurn(async () => {
    const playtime = await readPlaytime()
    playtime[id] = Math.round((playtime[id] ?? 0) + seconds)
    await writeJson(PLAYTIME, playtime)
  })
}

/** Seconds → whole minutes, or undefined under one (nothing to show). */
export function minutes(seconds: number | undefined): number | undefined {
  const m = Math.floor((seconds ?? 0) / 60)
  return m > 0 ? m : undefined
}

export async function readFavorites(): Promise<string[]> {
  return JSON.parse(await readFile(FAVORITES, 'utf8').catch(() => '[]'))
}

/** Adds or removes a favourite; resolves with whether it's now a favourite. */
export function toggleFavorite(id: string): Promise<boolean> {
  return inTurn(async () => {
    const favorites = await readFavorites()
    const on = !favorites.includes(id)
    await writeJson(FAVORITES, on ? [...favorites, id] : favorites.filter((f) => f !== id))
    return on
  })
}

/** A deleted game: out of the play history and favourites. */
export function forgetGame(id: string): Promise<void> {
  return inTurn(async () => {
    const history = await readHistory()
    if (id in history) {
      delete history[id]
      await writeJson(HISTORY, history)
    }
    const favorites = await readFavorites()
    if (favorites.includes(id)) await writeJson(FAVORITES, favorites.filter((f) => f !== id))
  })
}
