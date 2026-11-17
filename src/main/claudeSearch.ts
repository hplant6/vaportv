import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { claudeBin, toolEnv } from './claude'
import { ownHelper } from './helpers'
import type { SmartPicks } from '../shared/types'

// Voice search, smarter with Claude: when Claude Code is on this box and signed in, what was
// heard goes to it with the library (apps and games, one numbered line each), and it says
// which lines were meant: a title half-heard or misheard, a game described ("the blue
// hedgehog one"), or a kind of thing ("something to race in"). Without Claude Code, or if it
// fails or takes too long, search works as it always has (the screen keeps its own results).

/** The small, quick model: an answer in a few seconds. */
const MODEL = 'haiku'
/** Longer than this and the screen's own results stand. */
const TIMEOUT_MS = 15_000
/** The prompt goes in a file: a big library is too long for one argument. Kept the same while the library is, so Claude's prompt cache serves the next search. */
const PROMPT_FILE = join(homedir(), '.cache', 'steamtv', 'claude-search.txt')

const INSTRUCTIONS = `You are the voice search of vaporTV, a TV front end for games and apps. A spoken request arrives from speech recognition, so expect misheard words: match by sound and meaning, not only spelling. Pick what in the library below the person most likely means.
- They may name a title loosely or partly, describe a game (a character, a series, a genre, "that racing one"), or ask for a kind of thing ("something co-op", "a fighting game").
- Words like play, open, launch, start, find, show me are commands, not part of the title.
- Reply with JSON only, nothing else: {"picks": [line numbers of every good match, best first, at most 60], "start": true or false}
- "start": true only when they asked to play, open, start or launch one specific thing and your first pick is surely it.
- Nothing fits: {"picks": [], "start": false}

Library (line number, title, and in brackets its platform or "app"):
`

/** Its reply's JSON, read leniently (a fence or a word around it). */
export function readPicks(text: string, lines: number): SmartPicks | null {
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
  try {
    const parsed = JSON.parse(json) as { picks?: unknown; start?: unknown }
    if (!Array.isArray(parsed.picks)) return null
    const picks = [...new Set(parsed.picks.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < lines))]
    return { picks, start: parsed.start === true && picks.length > 0 }
  } catch {
    return null
  }
}

async function writePrompt(library: string[]): Promise<void> {
  const prompt = INSTRUCTIONS + library.map((line, i) => `${i} ${line.replace(/\s+/g, ' ')}`).join('\n') + '\n'
  if (existsSync(PROMPT_FILE) && (await readFile(PROMPT_FILE, 'utf8').catch(() => '')) === prompt) return
  await mkdir(join(homedir(), '.cache', 'steamtv'), { recursive: true })
  await writeFile(PROMPT_FILE, prompt)
}

/** Claude's picks from `library` for what was heard; null without Claude Code, or if it fails or takes too long. */
export async function smartSearch(heard: string, library: string[]): Promise<SmartPicks | null> {
  const bin = claudeBin()
  if (!bin || !heard.trim() || !library.length) return null
  await writePrompt(library)
  const args = ['-p', '--model', MODEL, '--tools', '', '--setting-sources', '', '--no-session-persistence', '--disable-slash-commands', '--system-prompt-file', PROMPT_FILE, '--output-format', 'json', heard.trim()]
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
        resolve(reply.is_error || typeof reply.result !== 'string' ? null : readPicks(reply.result, library.length))
      } catch {
        // Not signed in, or no answer: the screen's own results stand.
        resolve(null)
      }
    })
  })
}
