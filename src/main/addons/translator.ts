// The translator (one of the extras, not in the public build): a spoken English ⇄ Japanese
// conversation between two people on the sofa. Whoever's turn it is talks; whisper hears it
// (voice.ts, 'translation'); Claude Code translates it, remembering the conversation so far;
// and it's said aloud in the other language: Japanese by VOICEVOX, English by vaporTV's own
// voice (speech.ts). Who the two people are, what the English speaker's words call the other
// and how politely, and which Japanese voice speaks, are in config.json's `translator`.
//
// VOICEVOX (free, natural Japanese voices) is its engine for Linux, ~2 GB, downloaded the
// first time and run on this machine while the translator's open, answering on localhost.
// Voices: VOICEVOX:No.7 and VOICEVOX:東北イタコ (each character has its own terms; credit them).

import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import { chmod, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { Readable } from 'node:stream'
import type { TranslatorEvent, TranslatorSettings, TranslatorStatus } from '../../shared/types'
import { claudeBin, toolEnv } from '../claude'
import { claudeSignedIn } from '../claudeLogin'
import { loadConfig, saveConfig } from '../config'
import { ownHelper } from '../helpers'
import { playWav, speak, stopSpeaking, whenQuiet } from '../speech'

const VOICEVOX_VERSION = '0.26.2'
const VOICEVOX_BASE = `https://github.com/VOICEVOX/voicevox_engine/releases/download/${VOICEVOX_VERSION}`
/** The engine comes in two parts that make one zip (a .vvpp) between them. */
const VOICEVOX_PARTS = ['001', '002'].map((n) => `${VOICEVOX_BASE}/voicevox_engine-linux-cpu-x64-${VOICEVOX_VERSION}.${n}.vvppp`)
const VOICEVOX_DIR = join(homedir(), '.local', 'share', 'steamtv', 'voicevox')
const ENGINE = join(VOICEVOX_DIR, 'engine')
/** Not VOICEVOX's usual 50021, so one run by hand doesn't get in the way. */
const PORT = 50121
const ENGINE_URL = `http://127.0.0.1:${PORT}`
const THREADS = 8
/** A touch slower than VOICEVOX's usual pace: easier to follow. */
const JA_SPEED = 0.92

/** The Japanese voices to choose from (VOICEVOX style ids), named as the app shows them. */
export const JA_VOICES: { id: number; name: string; credit: string }[] = [
  { id: 31, name: 'No.7 (storyteller)', credit: 'VOICEVOX:No.7' },
  { id: 109, name: 'Tohoku Itako', credit: 'VOICEVOX:東北イタコ' }
]

const DEFAULTS: TranslatorSettings = {
  you: 'You',
  youJa: 'あなた',
  them: 'Guest',
  themJa: 'お客さん',
  context: '',
  address: 'name',
  tone: 'polite',
  voice: JA_VOICES[0].id
}

type Send = (event: TranslatorEvent) => void
type Log = (line: string) => void

let send: Send = () => {}
let log: Log = () => {}
let engine: ChildProcess | null = null
let engineUp: Promise<void> | null = null
let installing: Promise<void> | null = null
let claude: ChildProcess | null = null
/** The prompt the running Claude was started with: a changed setting starts it afresh. */
let claudePrompt = ''
/** Counts quietTranslator calls: Japanese still being made from before one isn't played. */
let hushes = 0
/** The translation on its way, by turn. */
let waiting: { resolve: (text: string) => void; reject: (err: Error) => void } | null = null

export function setTranslatorListeners(sender: Send, logger: Log): void {
  send = sender
  log = logger
}

export async function translatorSettings(): Promise<TranslatorSettings> {
  return { ...DEFAULTS, ...(await loadConfig()).translator }
}

export async function saveTranslatorSettings(changes: Partial<TranslatorSettings>): Promise<TranslatorSettings> {
  const next = { ...(await translatorSettings()), ...changes }
  await saveConfig({ translator: next })
  if (changes.voice !== undefined && engine) void warmVoice(next.voice)
  return next
}

/** What the English speaker's words call the Japanese speaker, written as it's shown. */
export function addressAs(s: TranslatorSettings): string {
  return s.address === 'okaasan' ? 'お義母さん' : s.address === 'mother' ? 'お母さん' : s.themJa
}

function voiceInstalled(): boolean {
  return existsSync(join(ENGINE, 'run'))
}

export async function translatorStatus(): Promise<TranslatorStatus> {
  const bin = claudeBin()
  return {
    claudeInstalled: bin !== null,
    signedIn: bin !== null && (await claudeSignedIn(bin)),
    voiceInstalled: voiceInstalled(),
    settings: await translatorSettings(),
    voices: JA_VOICES.map(({ id, name }) => ({ id, name }))
  }
}

// --- The Japanese voice ---

/** Downloads VOICEVOX's engine (about 2 GB) and unpacks it, reporting progress. Once, however often it's asked. */
export function installVoice(): Promise<void> {
  installing ??= (async () => {
    if (voiceInstalled()) return
    await mkdir(VOICEVOX_DIR, { recursive: true })
    const zip = join(VOICEVOX_DIR, 'engine.vvpp')
    const part = `${zip}.part`
    const unpacking = join(VOICEVOX_DIR, 'engine.unpacking')
    try {
      // Both parts' sizes first, for one progress bar over the two.
      const sizes = await Promise.all(VOICEVOX_PARTS.map(async (url) => Number((await fetch(url, { method: 'HEAD' })).headers.get('content-length')) || 0))
      const total = sizes.reduce((a, b) => a + b, 0)
      let done = 0
      let lastSent = 0
      const out = createWriteStream(part)
      for (const url of VOICEVOX_PARTS) {
        log(`translator: downloading ${url}`)
        const res = await fetch(url)
        if (!res.ok || !res.body) throw new Error(`Couldn't download the Japanese voice (${res.status})`)
        for await (const chunk of Readable.fromWeb(res.body as import('node:stream/web').ReadableStream)) {
          done += (chunk as Buffer).length
          if (!out.write(chunk)) await new Promise((resolve) => out.once('drain', resolve))
          if (done - lastSent > 8_000_000) {
            lastSent = done
            send({ type: 'installing', done, total })
          }
        }
      }
      await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())))
      await rename(part, zip)
      send({ type: 'installing', done: total, total, unpacking: true })
      log('translator: unpacking the Japanese voice')
      await rm(unpacking, { recursive: true, force: true })
      await run('python3', ['-m', 'zipfile', '-e', zip, unpacking])
      await chmod(join(unpacking, 'run'), 0o755)
      await rm(ENGINE, { recursive: true, force: true })
      await rename(unpacking, ENGINE)
      log('translator: Japanese voice ready')
    } finally {
      await rm(part, { force: true })
      await rm(zip, { force: true })
      await rm(unpacking, { recursive: true, force: true })
    }
  })().finally(() => (installing = null))
  return installing
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'], env: toolEnv() })
    let err = ''
    child.stderr.on('data', (chunk: Buffer) => (err = (err + chunk.toString()).slice(-1000)))
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} failed: ${err.trim() || code}`))))
  })
}

/** Starts VOICEVOX's engine (it takes a few seconds), if it isn't running. */
function startEngine(): Promise<void> {
  engineUp ??= (async () => {
    log('translator: starting VOICEVOX')
    const child = spawn(join(ENGINE, 'run'), ['--host', '127.0.0.1', '--port', String(PORT), '--cpu_num_threads', String(THREADS)], {
      cwd: ENGINE,
      stdio: ['ignore', 'ignore', 'pipe'],
      env: toolEnv()
    })
    ownHelper(child)
    engine = child
    let err = ''
    child.stderr!.on('data', (chunk: Buffer) => (err = (err + chunk.toString()).slice(-2000)))
    child.on('error', (e) => log(`translator: VOICEVOX: ${e}`))
    child.on('close', (code) => {
      if (engine !== child) return
      engine = null
      engineUp = null
      log(`translator: VOICEVOX exited ${code}${err.trim() ? `: ${err.trim().split('\n').slice(-3).join(' | ')}` : ''}`)
    })
    for (let i = 0; i < 120; i++) {
      if (engine !== child) throw new Error('The Japanese voice stopped while starting')
      try {
        if ((await fetch(`${ENGINE_URL}/version`)).ok) break
      } catch {
        // Not answering yet.
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    log('translator: VOICEVOX ready')
    await warmVoice((await translatorSettings()).voice)
  })().catch((err) => {
    engineUp = null
    throw err
  })
  return engineUp
}

/** Loads a voice's model now, so its first words aren't slow. */
async function warmVoice(id: number): Promise<void> {
  await fetch(`${ENGINE_URL}/initialize_speaker?speaker=${id}&skip_reinit=true`, { method: 'POST' }).catch(() => {})
}

function stopEngine(): void {
  const child = engine
  engine = null
  engineUp = null
  child?.kill()
}

/** Japanese as it should be read: お義母さん is お母さん aloud (VOICEVOX reads 義母 as ぎぼ). */
export function readable(text: string): string {
  return text.replace(/お義母さん/g, 'お母さん').replace(/お義父さん/g, 'お父さん')
}

/** Japanese said by VOICEVOX into a WAV file (the translator's voice; the Claude app's Japanese too). */
export async function japaneseWav(text: string, voice?: number): Promise<string> {
  voice ??= (await translatorSettings()).voice
  await startEngine()
  const query = await fetch(`${ENGINE_URL}/audio_query?speaker=${voice}&text=${encodeURIComponent(readable(text))}`, { method: 'POST' })
  if (!query.ok) throw new Error(`The Japanese voice couldn't read that (${query.status})`)
  const settings = { ...(await query.json()), speedScale: JA_SPEED }
  const audio = await fetch(`${ENGINE_URL}/synthesis?speaker=${voice}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) })
  if (!audio.ok) throw new Error(`The Japanese voice couldn't say that (${audio.status})`)
  const file = join(tmpdir(), `vaportv-ja-${process.pid}-${Date.now()}-${++made}.wav`)
  await writeFile(file, Buffer.from(await audio.arrayBuffer()))
  return file
}
let made = 0

async function sayJapanese(text: string, voice: number): Promise<void> {
  const at = hushes
  const file = await japaneseWav(text, voice)
  if (at !== hushes) return void rm(file, { force: true })
  playWav(file)
}

/** Whether VOICEVOX is downloaded. */
export function japaneseVoiceInstalled(): boolean {
  return voiceInstalled()
}

/** Stops VOICEVOX (nothing that speaks Japanese is open). */
export function stopJapaneseVoice(): void {
  stopEngine()
}

/** Stops speaking now, including Japanese still being made. */
export function quietTranslator(): void {
  hushes++
  stopSpeaking()
}

/** Says something aloud in the language given; resolves once it's been said (or stopped). */
export async function say(text: string, language: 'en' | 'ja'): Promise<void> {
  if (language === 'ja') await sayJapanese(text, (await translatorSettings()).voice)
  else await speak(text)
  await whenQuiet()
}

// --- Translating ---

export function translatorPrompt(s: TranslatorSettings): string {
  const tone = s.tone === 'casual' ? 'warmly and casually, as close family do (plain form, not です・ます)' : 'warmly and politely (です・ます), as to a respected elder in the family'
  return `You are the interpreter in a spoken conversation in a family living room, between ${s.you}, who speaks English, and ${s.them}, who speaks Japanese.${s.context ? ` ${s.context}` : ''}
Each message is one person's words as speech recognition heard them, headed with who said it and the language to translate into. Reply with ONLY the translation, in that language: never repeat the original, and no quotes, notes, romaji, readings or explanations.
- Translate the meaning and the feeling, the way a warm, natural interpreter would and the way people really talk. Keep it about as long as what was said.
- Speech recognition makes mistakes: use the conversation so far to work out what was meant.
- Into Japanese: ${s.you} speaks to ${s.them} ${tone}. When ${s.you} addresses ${s.them} or talks to ${s.them} about ${s.them}, call ${s.them} ${addressAs(s)}. Write naturally with kanji; it is read aloud by a Japanese voice. ${s.you}'s name in Japanese is ${s.youJa}.
- Into English: plain, natural spoken English. In English they are ${s.them} and ${s.you}.
- If you truly cannot make out what was said, reply with exactly ??? and nothing else.`
}

/** The translation of what was heard: "???" when it couldn't be made out. */
export async function translate(text: string, from: 'en' | 'ja'): Promise<string> {
  const s = await translatorSettings()
  const prompt = translatorPrompt(s)
  if (claude && claudePrompt !== prompt) endTranslation()
  const child = claude ?? startClaude(prompt)
  if (waiting) waiting.reject(new Error('Interrupted'))
  const heading = from === 'en' ? `${s.you} said, in English. Translate into Japanese:` : `${s.them} said, in Japanese. Translate into English:`
  return new Promise((resolve, reject) => {
    waiting = { resolve, reject }
    child.stdin!.write(`${JSON.stringify({ type: 'user', message: { role: 'user', content: `${heading}\n${text}` } })}\n`)
  })
}

/** The translation alone: if Claude second-guessed itself ("Wait…"), its last paragraph; without wrapping quotes. */
export function finalLine(text: string): string {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  return (paragraphs[paragraphs.length - 1] ?? '').replace(/^["“「](.*)["”」]$/s, '$1')
}

function startClaude(prompt: string): ChildProcess {
  const bin = claudeBin()
  if (!bin) throw new Error('Claude Code isn’t installed on this box')
  const args = [
    '-p',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--verbose',
    '--model',
    'sonnet',
    // Only translating: no tools, none of the box's own settings, and nothing saved.
    '--tools',
    '',
    '--setting-sources',
    '',
    '--no-session-persistence',
    '--system-prompt',
    prompt
  ]
  log('translator: starting Claude')
  const child = spawn(bin, args, { cwd: homedir(), stdio: ['pipe', 'pipe', 'pipe'], env: { ...toolEnv(), CLAUDE_CODE_ENTRYPOINT: 'vaportv' } })
  ownHelper(child)
  claude = child
  claudePrompt = prompt
  createInterface({ input: child.stdout! }).on('line', (line) => {
    if (claude !== child) return
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(line)
    } catch {
      return
    }
    if (msg.type !== 'result' || !waiting) return
    const turn = waiting
    waiting = null
    const text = typeof msg.result === 'string' ? msg.result.trim() : ''
    log(`translator: translated in ${msg.duration_ms} ms`)
    if (msg.is_error === true || msg.subtype !== 'success') turn.reject(new Error(text || String(msg.subtype)))
    else turn.resolve(finalLine(text))
  })
  let err = ''
  child.stderr!.on('data', (chunk: Buffer) => (err = (err + chunk.toString()).slice(-2000)))
  child.on('error', (e) => log(`translator: claude: ${e}`))
  child.on('close', (code) => {
    if (claude !== child) return
    claude = null
    log(`translator: claude exited ${code}${err.trim() ? `: ${err.trim().split('\n').slice(-3).join(' | ')}` : ''}`)
    waiting?.reject(new Error(err.trim().split('\n').pop() || `Claude Code stopped (exit ${code})`))
    waiting = null
  })
  return child
}

/** Forgets the conversation: the next thing said starts a new one. */
export function endTranslation(): void {
  const child = claude
  claude = null
  waiting?.reject(new Error('Interrupted'))
  waiting = null
  child?.kill()
}

/** The screen opened (start the Japanese voice, if it's here) or closed (stop everything). */
export function setTranslatorOpen(open: boolean): void {
  if (open) {
    if (voiceInstalled()) void startEngine().catch((err) => log(`translator: ${err}`))
    return
  }
  stopSpeaking()
  endTranslation()
  stopEngine()
}
