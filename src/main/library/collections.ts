import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SteamGame } from './steam'

// Steam keeps collections in a cloud-storage namespace file: a JSON array of
// [key, { key, value, is_deleted, ... }], where each user-collections.* value is
// itself JSON: { id, name, added: [appid], removed: [appid], filterSpec? }.
const PREFIX = 'user-collections.'
// Steam's built-in "Hidden" collection holds games you've chosen not to see.
const SKIP = new Set(['hidden'])

interface FilterGroup {
  rgOptions?: number[]
  bAcceptUnion?: boolean
}

interface StoredCollection {
  id: string
  name: string
  added?: number[]
  removed?: number[]
  filterSpec?: { strSearchText?: string; filterGroups?: FilterGroup[] }
}

// Dynamic collections store Steam library filters. Steam doesn't document the
// codes; these are inferred from collections named for them. Group 1 is "play
// state". Steamtv only knows installed games, so "installed" matches all of them.
const PLAY_STATE_GROUP = 1
const PLAY_STATE: Record<number, (game: SteamGame) => boolean> = {
  1: () => true, // installed
  3: (game) => game.lastPlayed > 0, // played
  4: (game) => game.lastPlayed === 0 // unplayed
}

/** A supported filter, or null if it uses anything steamtv can't apply. */
type Rule = (game: SteamGame) => boolean

function parseFilter(spec: NonNullable<StoredCollection['filterSpec']>): Rule | null {
  if (spec.strSearchText) return null
  const groups = spec.filterGroups ?? []
  // Any option outside the play-state group (genres, features, ...) isn't supported.
  if (groups.some((group, i) => i !== PLAY_STATE_GROUP && group.rgOptions?.length)) return null
  const group = groups[PLAY_STATE_GROUP]
  const tests = (group?.rgOptions ?? []).map((option) => PLAY_STATE[option])
  if (tests.some((test) => !test)) return null
  if (!tests.length) return () => true
  return group?.bAcceptUnion
    ? (game) => tests.some((test) => test(game))
    : (game) => tests.every((test) => test(game))
}

export interface CollectionContents {
  id: string
  name: string
  dynamic: boolean
  /** App ids for hand-picked collections; empty for dynamic ones. */
  appids: number[]
  /** For dynamic collections: which games match, or null if steamtv can't apply the filter. */
  rule: Rule | null
}

/** Whether steamtv can show this collection. */
export function isSupported(collection: CollectionContents): boolean {
  return !collection.dynamic || collection.rule !== null
}

/** The installed games in a collection, in the order given. */
export function collectionGames(collection: CollectionContents, games: SteamGame[]): SteamGame[] {
  if (collection.dynamic) return collection.rule ? games.filter(collection.rule) : []
  const ids = new Set(collection.appids)
  return games.filter((game) => ids.has(Number(game.appid)))
}

export async function readCollections(userDir: string): Promise<CollectionContents[]> {
  let entries: [string, { value?: string; is_deleted?: boolean }][]
  try {
    entries = JSON.parse(await readFile(join(userDir, 'config', 'cloudstorage', 'cloud-storage-namespace-1.json'), 'utf8'))
  } catch {
    return []
  }

  const collections: CollectionContents[] = []
  for (const [key, meta] of entries) {
    if (!key.startsWith(PREFIX) || meta.is_deleted || !meta.value) continue
    let stored: StoredCollection
    try {
      stored = JSON.parse(meta.value)
    } catch {
      continue
    }
    if (SKIP.has(stored.id)) continue
    const dynamic = stored.filterSpec !== undefined
    const removed = new Set(stored.removed ?? [])
    const appids = dynamic ? [] : (stored.added ?? []).filter((id) => !removed.has(id))
    const rule = stored.filterSpec ? parseFilter(stored.filterSpec) : null
    collections.push({ id: stored.id, name: stored.name, dynamic, appids, rule })
  }
  // Favorites first, then the rest by name.
  return collections.sort((a, b) => (a.id === 'favorite' ? -1 : b.id === 'favorite' ? 1 : a.name.localeCompare(b.name)))
}
