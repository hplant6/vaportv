import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { claudeBin, toolEnv } from './claude'
import { ownHelper } from './helpers'
import { albumSongs, libraryAlbums } from './musicIndex'
import { browseMusic, musicAlbums } from './musicLibrary'
import type { MusicAlbum, MusicAnswer, MusicEntry } from '../shared/types'

// The Music app's voice search, through Claude Code: what was heard goes to Claude with every
// album in the library (its folder path, "Artist/Album", one numbered line each), and Claude
// says which albums were meant and whether to play them. It knows music, so a request by
// kind ("my vintage Japanese music", "something to relax to") finds albums whose names never
// say so. Without Claude Code, or if it fails or takes too long, the screen's own name search stands.

/** The small, quick model: an answer in a few seconds. */
const MODEL = 'haiku'
const TIMEOUT_MS = 20_000
/** Kept the same while the library is, so Claude's prompt cache serves the next request. */
const PROMPT_FILE = join(homedir(), '.cache', 'steamtv', 'claude-music.txt')
/** Lines sent at most: a very big library is cut (prompt size). */
const MOST_ALBUMS = 5000
/** Songs queued at most from one request. */
const MOST_SONGS = 1000

const INSTRUCTIONS = `You are the voice control of vaporTV's Music app on a TV. A spoken request arrives from speech recognition, so expect misheard words: match by sound and meaning, not only spelling. Pick the albums in the library below that the person means.
- They may name an artist, album or song loosely, or ask for a kind of music: a genre, an era, a country, a mood ("vintage Japanese music", "80s synth pop", "something chill"). Use what you know about the artists and albums to decide, not only the words in the names.
- Words like play, put on, shuffle, find, show me are commands, not part of a name.
- Reply with JSON only, nothing else: {"picks": [line numbers of every album that fits, best first, at most 200], "action": "play" | "shuffle" | "show"}
- "play": they asked to play or put something on. "shuffle": they asked to shuffle, or to play a broad kind of music ("play some jazz", "play all my vintage Japanese music"). "show": they asked to find or show, or just named something.
- Nothing fits: {"picks": [], "action": "show"}

Library (line number, then each album: "Artist — Album (year, genre)" from its tags, or its folder path, usually Artist/Album):
`

/** Its reply's JSON, read leniently (a fence or a word around it). */
export function readAnswer(text: string, lines: number): { picks: number[]; action: MusicAnswer['action'] } | null {
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
  try {
    const parsed = JSON.parse(json) as { picks?: unknown; action?: unknown }
    if (!Array.isArray(parsed.picks)) return null
    const picks = [...new Set(parsed.picks.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < lines))]
    const action = parsed.action === 'play' || parsed.action === 'shuffle' ? parsed.action : 'show'
    return { picks, action: picks.length ? action : 'show' }
  } catch {
    return null
  }
}

async function writePrompt(lines: string[]): Promise<void> {
  const prompt = INSTRUCTIONS + lines.map((line, i) => `${i} ${line.replace(/\s+/g, ' ')}`).join('\n') + '\n'
  if (existsSync(PROMPT_FILE) && (await readFile(PROMPT_FILE, 'utf8').catch(() => '')) === prompt) return
  await mkdir(join(homedir(), '.cache', 'steamtv'), { recursive: true })
  await writeFile(PROMPT_FILE, prompt)
}

function ask(bin: string, heard: string): Promise<string | null> {
  const args = ['-p', '--model', MODEL, '--tools', '', '--setting-sources', '', '--no-session-persistence', '--disable-slash-commands', '--system-prompt-file', PROMPT_FILE, '--output-format', 'json', heard]
  return new Promise((resolve) => {
    const child = spawn(bin, args, { cwd: tmpdir(), stdio: ['ignore', 'pipe', 'ignore'], env: toolEnv() })
    ownHelper(child)
    let out = ''
    const timer = setTimeout(() => {
      child.kill()
      resolve(null)
    }, TIMEOUT_MS)
    child.stdout.on('data', (chunk: Buffer) => (out += chunk))
    child.on('error', () => {
      clearTimeout(timer)
      resolve(null)
    })
    child.on('close', () => {
      clearTimeout(timer)
      try {
        const reply = JSON.parse(out) as { is_error?: boolean; result?: string }
        resolve(reply.is_error || typeof reply.result !== 'string' ? null : reply.result)
      } catch {
        resolve(null)
      }
    })
  })
}

/** One line for Claude: "Artist — Album (1982, City Pop)" from the index. */
export function albumLine(a: MusicAlbum): string {
  const facts = [a.year, a.genre].filter(Boolean).join(', ')
  return `${a.artist ? `${a.artist} — ` : ''}${a.title}${facts ? ` (${facts})` : ''}`
}

/** Claude's albums for what was heard, and to play them: their songs, album by album. Null without Claude Code, or if it fails or takes too long. */
export async function askMusic(heard: string): Promise<MusicAnswer | null> {
  const bin = claudeBin()
  if (!bin || !heard.trim()) return null
  // The index's albums (tags: artist, year, genre) once it has some; until then, the folders' names.
  const indexed = (await libraryAlbums()).slice(0, MOST_ALBUMS)
  const folders = indexed.length ? [] : (await musicAlbums()).slice(0, MOST_ALBUMS)
  const lines = indexed.length ? indexed.map(albumLine) : folders.map((a) => a.where)
  if (!lines.length) return null
  await writePrompt(lines)
  const reply = await ask(bin, heard.trim())
  const answer = reply === null ? null : readAnswer(reply, lines.length)
  if (!answer) return null
  const picked: MusicEntry[] = indexed.length
    ? answer.picks.map((n) => ({ name: indexed[n].title, path: indexed[n].folder, kind: 'folder' as const }))
    : answer.picks.map((n) => folders[n].entry)
  const songs: MusicEntry[] = []
  if (answer.action !== 'show') {
    for (const n of answer.picks) {
      if (songs.length >= MOST_SONGS) break
      if (indexed.length) {
        songs.push(...(await albumSongs(indexed[n].id)).map((t) => ({ name: basename(t.path), path: t.path, kind: 'track' as const })))
      } else {
        const inside = await browseMusic(folders[n].entry.path).catch(() => [] as MusicEntry[])
        songs.push(...inside.filter((e) => e.kind === 'track'))
      }
    }
  }
  // The same folder twice (two albums in one): once.
  const unique = [...new Map(picked.map((p) => [p.path, p])).values()]
  return { albums: unique, songs: songs.slice(0, MOST_SONGS), action: answer.action }
}
