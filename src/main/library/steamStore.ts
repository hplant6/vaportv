import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { mainGenre } from '../../shared/genres'
import type { GameFacts } from './esde'

// Steam games' genres and release years, for the Steam tab's Genres and Years: from Steam's
// store, a game at a time in the background (slowly: the store allows about 200 a five
// minutes), kept so each is asked once. Only the app id is sent.

const FILE = join(homedir(), '.local', 'share', 'steamtv', 'steam-store.json')
/** Between asks; a refusal (429) waits much longer. */
const GAP_MS = 1500
const REFUSED_MS = 5 * 60 * 1000
/** A game the store had nothing on (delisted, a tool) is asked again after this long. */
const RETRY_MS = 30 * 24 * 60 * 60 * 1000
/** Steam's genre tags that aren't what a game is: the first other one is its genre. */
const NOT_GENRES = new Set(['Indie', 'Free to Play', 'Early Access', 'Massively Multiplayer'])

interface Stored extends GameFacts {
  /** When it was asked (ms). */
  at: number
}

let stored: Record<string, Stored> | null = null

async function load(): Promise<Record<string, Stored>> {
  if (!stored) {
    try {
      const parsed = JSON.parse(await readFile(FILE, 'utf8'))
      stored = parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      stored = {}
    }
  }
  return stored!
}

async function save(): Promise<void> {
  await mkdir(dirname(FILE), { recursive: true })
  await writeFile(`${FILE}.tmp`, JSON.stringify(stored))
  await rename(`${FILE}.tmp`, FILE)
}

/** What's known of these apps so far, by app id. */
export async function storeFacts(appids: string[]): Promise<Map<string, GameFacts>> {
  const known = await load()
  const facts = new Map<string, GameFacts>()
  for (const appid of appids) {
    const entry = known[appid]
    if (entry && (entry.genre || entry.year)) facts.set(appid, { genre: entry.genre, year: entry.year })
  }
  return facts
}

/** The store's answer for one app: its main genre and release year, if it has them. */
export function parseAppDetails(appid: string, body: unknown): GameFacts {
  const data = (body as Record<string, { success?: boolean; data?: { genres?: { description?: string }[]; release_date?: { date?: string } } }>)?.[appid]
  if (!data?.success || !data.data) return {}
  const tags = (data.data.genres ?? []).map((g) => g.description ?? '').filter(Boolean)
  const year = Number(data.data.release_date?.date?.match(/\b(19[7-9]\d|20\d\d)\b/)?.[1])
  return { genre: mainGenre(tags.find((tag) => !NOT_GENRES.has(tag)) ?? tags[0]), year: year || undefined }
}

let filling = false

/** Asks the store about the apps it hasn't yet, a few seconds apart; `onUpdate` after each batch that found some. */
export function fillStoreFacts(appids: string[], onUpdate: () => void): void {
  if (filling) return
  filling = true
  ;(async () => {
    const known = await load()
    const wanted = appids.filter((id) => !known[id] || (!known[id].genre && !known[id].year && Date.now() - known[id].at > RETRY_MS))
    let found = 0
    for (const appid of wanted) {
      const response = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&filters=genres,release_date&l=english`).catch(() => null)
      if (response?.status === 429) {
        await new Promise((resolve) => setTimeout(resolve, REFUSED_MS))
        continue
      }
      if (!response?.ok) break
      const facts = parseAppDetails(appid, await response.json().catch(() => null))
      known[appid] = { ...facts, at: Date.now() }
      if (facts.genre || facts.year) found++
      // Saved and shown every so often, so a long first fill shows its progress.
      if (found >= 20) {
        await save()
        onUpdate()
        found = 0
      }
      await new Promise((resolve) => setTimeout(resolve, GAP_MS))
    }
    if (wanted.length) await save()
    if (found) onUpdate()
  })()
    .catch((err: Error) => console.error('steamtv: Steam store facts:', err.message))
    .finally(() => (filling = false))
}
