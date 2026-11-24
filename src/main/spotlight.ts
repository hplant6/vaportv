import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { SpotlightDetails } from '../shared/types'
import type { Config } from './config'
import { artUrl } from './library/art'
import { hasSteam, steamRoot } from './library/recents'
import { activeUserDir, steamGameHero } from './library/steam'

// The Spotlight layout's big picture, logo and description for the game the cursor's on, asked
// for once the cursor settles. Steam games (and games added to Steam): their hero banner and logo
// (custom ones from Steam's grid folder, else Steam's own), and the store's short description, asked
// once per game and kept. Other games' heroes come with their cards (RecentItem.hero).

const SUMMARIES = join(homedir(), '.local', 'share', 'steamtv', 'steam-summaries.json')
/** A game the store had nothing on is asked again after this long. */
const RETRY_MS = 30 * 24 * 60 * 60 * 1000

interface Summary {
  text?: string
  at: number
}

let summaries: Record<string, Summary> | null = null
const asking = new Map<string, Promise<string | undefined>>()

async function loadSummaries(): Promise<Record<string, Summary>> {
  if (!summaries) {
    try {
      const parsed = JSON.parse(await readFile(SUMMARIES, 'utf8'))
      summaries = parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      summaries = {}
    }
  }
  return summaries!
}

async function saveSummaries(): Promise<void> {
  await mkdir(dirname(SUMMARIES), { recursive: true })
  await writeFile(`${SUMMARIES}.tmp`, JSON.stringify(summaries))
  await rename(`${SUMMARIES}.tmp`, SUMMARIES)
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }

/** The store's description as plain text: no tags, entities read, on one line. */
export function plainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (all, code: string) => {
      if (code[0] === '#') {
        const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1))
        return Number.isFinite(n) ? String.fromCodePoint(n) : all
      }
      return ENTITIES[code.toLowerCase()] ?? all
    })
    .replace(/\s+/g, ' ')
    .trim()
}

/** The store's answer: the app's short description, if it has one. */
export function parseSummary(appid: string, body: unknown): string | undefined {
  const entry = (body as Record<string, { success?: boolean; data?: { short_description?: string } }> | null)?.[appid]
  const text = entry?.success ? plainText(entry.data?.short_description ?? '') : ''
  return text || undefined
}

/** A Steam game's short description from the store, asked for once and kept. Only the app id is sent. */
async function steamSummary(appid: string): Promise<string | undefined> {
  const known = await loadSummaries()
  const entry = known[appid]
  if (entry && (entry.text || Date.now() - entry.at < RETRY_MS)) return entry.text
  let pending = asking.get(appid)
  if (!pending) {
    pending = (async () => {
      const response = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&filters=basic&l=english`).catch(() => null)
      // Refused or offline: nothing this time, asked again later.
      if (!response?.ok) return undefined
      const text = parseSummary(appid, await response.json().catch(() => null))
      known[appid] = { text, at: Date.now() }
      await saveSummaries().catch(() => {})
      return text
    })().finally(() => asking.delete(appid))
    asking.set(appid, pending)
  }
  return pending
}

/** The details for the item with this id (a card's), as far as they're known. */
export async function spotlightDetails(config: Config, id: string): Promise<SpotlightDetails> {
  const steam = /^(steam|shortcut):(\d+)$/.exec(id)
  if (!steam || !hasSteam(config)) return {}
  const [, kind, appid] = steam
  const root = steamRoot(config)
  const userDir = await activeUserDir(root)
  const art = userDir ? await steamGameHero(root, userDir, appid) : {}
  // Games added to Steam from elsewhere aren't in its store.
  const description = kind === 'steam' ? await steamSummary(appid) : undefined
  return {
    backdrop: art.hero && artUrl(art.hero),
    logo: art.logo && artUrl(art.logo),
    description
  }
}
