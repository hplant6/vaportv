import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const DATA = join(homedir(), '.local', 'share', 'steamtv')
// When steamtv launched things Steam doesn't track (emulated games): id → unix seconds.
const HISTORY = join(DATA, 'history.json')
// Games marked as favourites in steamtv (Switch for now), in the order added.
const FAVORITES = join(DATA, 'favorites.json')

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(`${path}.tmp`, JSON.stringify(value, null, 1))
  await rename(`${path}.tmp`, path)
}

export async function readHistory(): Promise<Record<string, number>> {
  return JSON.parse(await readFile(HISTORY, 'utf8').catch(() => '{}'))
}

export async function recordPlay(id: string, at = Math.floor(Date.now() / 1000)): Promise<void> {
  const history = await readHistory()
  history[id] = at
  await writeJson(HISTORY, history)
}

export async function readFavorites(): Promise<string[]> {
  return JSON.parse(await readFile(FAVORITES, 'utf8').catch(() => '[]'))
}

/** Adds or removes a favourite; resolves with whether it's now a favourite. */
export async function toggleFavorite(id: string): Promise<boolean> {
  const favorites = await readFavorites()
  const on = !favorites.includes(id)
  await writeJson(FAVORITES, on ? [...favorites, id] : favorites.filter((f) => f !== id))
  return on
}

/** A deleted game: out of the play history and favourites. */
export async function forgetGame(id: string): Promise<void> {
  const history = await readHistory()
  if (id in history) {
    delete history[id]
    await writeJson(HISTORY, history)
  }
  const favorites = await readFavorites()
  if (favorites.includes(id)) await writeJson(FAVORITES, favorites.filter((f) => f !== id))
}
