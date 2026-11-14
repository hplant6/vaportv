import { app } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { ownHelper } from './helpers'

// Speaking aloud, for the Claude app: Piper (a small neural text-to-speech engine) turns each
// sentence into a WAV as soon as it's written, and they play one after another. All on this
// machine. Piper ships with vaporTV (scripts/piper.sh fetches it); its voice (~60 MB)
// downloads the first time something is spoken.

const VOICE_NAME = 'en_US-lessac-medium'
const VOICE_URL = `https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/${VOICE_NAME}.onnx`
const VOICE_DIR = join(homedir(), '.local', 'share', 'steamtv', 'voice')
const VOICE = join(VOICE_DIR, `${VOICE_NAME}.onnx`)

type Log = (line: string) => void

/** Speaking started (true) or everything queued has been said (false). */
export type SpeakingListener = (speaking: boolean) => void

let piper: ChildProcess | null = null
let outDir: string | null = null
/** Sentences written to Piper whose WAV hasn't come back yet. */
let pending = 0
/** WAVs waiting their turn to play. */
const queue: string[] = []
let player: ChildProcess | null = null
let speaking = false
/** Counts stopSpeaking calls: a sentence still on its way from before one is dropped. */
let stops = 0
let onSpeaking: SpeakingListener = () => {}
let log: Log = () => {}

function piperBin(): string {
  return app.isPackaged ? join(process.resourcesPath, 'voice', 'piper', 'piper') : join(app.getAppPath(), 'build', 'voice', 'piper', 'piper')
}

export function speechReady(): boolean {
  return existsSync(piperBin())
}

export function setSpeechListeners(listener: SpeakingListener, logger: Log): void {
  onSpeaking = listener
  log = logger
}

async function download(url: string, to: string): Promise<void> {
  if (existsSync(to)) return
  await mkdir(VOICE_DIR, { recursive: true })
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`Couldn't download the speaking voice (${res.status})`)
  const part = `${to}.part`
  await pipeline(Readable.fromWeb(res.body as import('node:stream/web').ReadableStream), createWriteStream(part))
  await rename(part, to)
}

/** Downloads the voice if it isn't here yet (its model and the settings Piper reads beside it). */
export async function prepareSpeech(): Promise<void> {
  if (!speechReady()) throw new Error("Speech isn't installed in this build")
  if (!existsSync(VOICE)) log('speech: downloading the voice')
  await download(`${VOICE_URL}.json`, `${VOICE}.json`)
  await download(VOICE_URL, VOICE)
}

function setSpeaking(on: boolean): void {
  if (speaking === on) return
  speaking = on
  onSpeaking(on)
}

function settle(): void {
  if (!player && !queue.length && !pending) setSpeaking(false)
}

function playNext(): void {
  if (player) return
  const file = queue.shift()
  if (!file) return settle()
  const child = spawn('paplay', [file], { stdio: 'ignore' })
  ownHelper(child)
  player = child
  const done = (): void => {
    if (player !== child) return
    player = null
    void rm(file, { force: true })
    playNext()
  }
  child.on('error', (err) => {
    log(`speech: paplay: ${err}`)
    done()
  })
  child.on('close', done)
}

async function startPiper(): Promise<ChildProcess> {
  if (piper) return piper
  outDir = await mkdtemp(join(tmpdir(), 'vaportv-speech-'))
  // Reads a sentence a line; writes each as a WAV in outDir and prints its path.
  const child = spawn(piperBin(), ['--model', VOICE, '--output_dir', outDir, '--sentence_silence', '0.15', '--quiet'], {
    stdio: ['pipe', 'pipe', 'pipe']
  })
  ownHelper(child)
  piper = child
  createInterface({ input: child.stdout! }).on('line', (line) => {
    if (piper !== child) return
    const file = line.trim()
    if (!file.endsWith('.wav')) return
    pending = Math.max(0, pending - 1)
    queue.push(file)
    playNext()
  })
  child.stderr!.on('data', (chunk: Buffer) => log(`speech: piper: ${chunk.toString().trim()}`))
  child.on('error', (err) => log(`speech: piper: ${err}`))
  child.on('close', (code) => {
    if (piper !== child) return
    log(`speech: piper exited ${code}`)
    piper = null
    pending = 0
    settle()
  })
  return child
}

/** Text as it should sound: no markdown marks, links or emoji, on one line. */
export function speakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'the link')
    .replace(/[*_#`>|~]/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Says a sentence (or a few), after whatever is already queued. */
export async function speak(text: string): Promise<void> {
  const line = speakable(text)
  if (!/[\p{L}\p{N}]/u.test(line)) return
  // Counted at once: speaking has begun even while the voice downloads.
  pending++
  setSpeaking(true)
  const generation = stops
  try {
    await prepareSpeech()
    const child = await startPiper()
    if (generation !== stops) return
    child.stdin!.write(`${line}\n`)
  } catch (err) {
    if (generation === stops) {
      pending = Math.max(0, pending - 1)
      settle()
    }
    throw err
  }
}

/** Stops talking at once and forgets what was queued. */
export function stopSpeaking(): void {
  stops++
  const child = piper
  piper = null
  pending = 0
  child?.kill()
  player?.kill()
  player = null
  for (const file of queue.splice(0)) void rm(file, { force: true })
  if (outDir) void rm(outDir, { recursive: true, force: true })
  outDir = null
  setSpeaking(false)
}
