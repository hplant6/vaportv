import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { claudeBin, toolEnv } from './claude'
import { ownHelper } from './helpers'
import { albumSongs, indexedSong, libraryAlbums } from './musicIndex'
import { browseMusic, musicAlbums } from './musicLibrary'
import type { MusicAlbum, MusicAnswer, MusicEntry, MusicTags } from '../shared/types'
import { readTags } from './musicLibrary'
import { isDisliked, musicTaste } from './musicFavorites'

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
- Reply with JSON only, nothing else: {"picks": [line numbers of every album that fits, best first, at most 200], "action": "play" | "shuffle" | "playlist" | "show"}
- "play": they asked to play or put something on. "shuffle": they asked to shuffle, or to play a broad kind of music ("play some jazz", "play all my vintage Japanese music"). "playlist": they asked to make or create a playlist (pick the albums it should draw from, up to 25). "show": they asked to find or show, or just named something.
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
    const action = parsed.action === 'play' || parsed.action === 'shuffle' || parsed.action === 'playlist' ? parsed.action : 'show'
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

function ask(bin: string, heard: string, promptFile = PROMPT_FILE): Promise<string | null> {
  const args = ['-p', '--model', MODEL, '--tools', '', '--setting-sources', '', '--no-session-persistence', '--disable-slash-commands', '--system-prompt-file', promptFile, '--output-format', 'json', heard]
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
  // A playlist: Claude chooses the songs from those albums' tracklists, and names it.
  if (answer.action === 'playlist' && indexed.length) {
    const made = await songsFor(bin, heard.trim(), answer.picks.map((n) => indexed[n]))
    if (!made) return null
    return { albums: [], songs: made.songs.map((t) => ({ name: basename(t.path), path: t.path, kind: 'track' as const })), action: 'playlist', name: made.name }
  }
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

/** A radio station holds about this many songs, at most this many from any one album. */
const RADIO_SONGS = 60
const RADIO_PER_ALBUM = 3

/** Shuffled in place (Fisher–Yates). */
function shuffle<T>(list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list
}

/**
 * Radio from a song, as Google Play Music's was: Claude picks the albums in the library that
 * sound like it (the same prompt and library as spoken requests, so its cache serves both), and
 * the station is the song, then a few songs from each of those albums, shuffled. Null without
 * Claude Code, before the index has albums, or if Claude fails or finds nothing.
 */
export async function musicRadio(path: string): Promise<MusicTags[] | null> {
  const bin = claudeBin()
  if (!bin) return null
  const seed = indexedSong(path) ?? (await readTags(path).catch(() => null))
  const albums = (await libraryAlbums()).slice(0, MOST_ALBUMS)
  if (!seed || !albums.length) return null
  await writePrompt(albums.map(albumLine))
  const facts = [seed.album && `from ${seed.album}`, seed.year, seed.genre].filter(Boolean).join(', ')
  // What they've liked and given a thumbs down: Claude leans toward the one and away from the other.
  const taste = await musicTaste()
  const request = [
    `Make a radio station from the song "${seed.title}"${seed.artist ? ` by ${seed.artist}` : ''}${facts ? ` (${facts})` : ''}: pick 15 to 25 albums in the library that sound like it (similar artists, era, style and mood), best first, the song's own album included if it's there. Action: shuffle.`,
    taste.liked.length ? `Songs the listener liked (lean toward their sound): ${taste.liked.join('; ')}.` : '',
    taste.disliked.length ? `Songs the listener gave a thumbs down (avoid albums that sound like these, and these artists unless the song is theirs): ${taste.disliked.join('; ')}.` : ''
  ]
    .filter(Boolean)
    .join('\n')
  const reply = await ask(bin, request)
  const answer = reply === null ? null : readAnswer(reply, albums.length)
  if (!answer?.picks.length) return null
  const picked: MusicTags[] = []
  for (const n of answer.picks) {
    const songs: MusicTags[] = []
    // Never a song given a thumbs down.
    for (const s of await albumSongs(albums[n].id)) if (s.path !== seed.path && !(await isDisliked(s))) songs.push(s)
    picked.push(...shuffle(songs).slice(0, RADIO_PER_ALBUM))
  }
  return [seed, ...shuffle(picked).slice(0, RADIO_SONGS - 1)]
}

/** The second step's prompt: the chosen albums' songs, one numbered line each. */
const SONGS_FILE = join(homedir(), '.cache', 'steamtv', 'claude-music-songs.txt')
/** Albums whose songs Claude chooses from, and songs a playlist holds at most. */
const PLAYLIST_ALBUMS = 25
const PLAYLIST_SONGS = 40

const SONG_INSTRUCTIONS = `You are making a playlist for vaporTV's Music app from a spoken request. Below are songs from albums in the person's library that fit it; choose the songs that best make the playlist they asked for (15 to 40, in a good listening order: an opener, a flow, a closer; spread across artists and albums, no more than three from any one album unless they asked for an artist), and give it a short name (2 to 5 words, no quotes or emoji).
- Reply with JSON only, nothing else: {"name": "…", "picks": [line numbers in playing order]}

Songs (line number, then "Artist — Title (Album, year, genre)"):
`

/** Claude's songs for a playlist from these albums, in order, and its name. Null if it fails. */
async function songsFor(bin: string, request: string, from: MusicAlbum[]): Promise<{ name: string; songs: MusicTags[] } | null> {
  const songs: MusicTags[] = []
  for (const album of from.slice(0, PLAYLIST_ALBUMS)) for (const s of await albumSongs(album.id)) if (!(await isDisliked(s))) songs.push(s)
  if (!songs.length) return null
  const line = (s: MusicTags, i: number): string => `${i} ${s.artist ? `${s.artist} — ` : ''}${s.title} (${[s.album, s.year, s.genre].filter(Boolean).join(', ')})`.replace(/\s+/g, ' ')
  await mkdir(dirname(SONGS_FILE), { recursive: true })
  await writeFile(SONGS_FILE, SONG_INSTRUCTIONS + songs.map(line).join('\n') + '\n')
  const reply = await ask(bin, request, SONGS_FILE)
  if (reply === null) return null
  try {
    const json = JSON.parse(reply.slice(reply.indexOf('{'), reply.lastIndexOf('}') + 1)) as { name?: unknown; picks?: unknown }
    const picks = Array.isArray(json.picks) ? [...new Set(json.picks.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < songs.length))] : []
    if (!picks.length) return null
    const name = typeof json.name === 'string' && json.name.trim() ? json.name.trim().slice(0, 60) : request.slice(0, 40)
    return { name, songs: picks.slice(0, PLAYLIST_SONGS).map((n) => songs[n]) }
  } catch {
    return null
  }
}

/** A playlist from a request ("rainy-day jazz"), through Claude: the albums, then the songs and a name. Null without Claude or if it fails. */
export async function claudePlaylist(request: string): Promise<{ name: string; songs: MusicTags[] } | null> {
  const bin = claudeBin()
  const albums = (await libraryAlbums()).slice(0, MOST_ALBUMS)
  if (!bin || !albums.length || !request.trim()) return null
  await writePrompt(albums.map(albumLine))
  const reply = await ask(bin, `Make a playlist: ${request.trim()}. Action: playlist.`)
  const answer = reply === null ? null : readAnswer(reply, albums.length)
  if (!answer?.picks.length) return null
  return songsFor(bin, request.trim(), answer.picks.map((n) => albums[n]))
}
