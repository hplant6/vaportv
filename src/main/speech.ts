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

// Speaking aloud, for the Claude app: Kokoro (a small, natural-sounding neural voice, run by
// sherpa-onnx) turns each sentence into a WAV as soon as it's written, and they play one after
// another. All on this machine, on the CPU (about six times faster than it's spoken on the box's
// Ryzen). sherpa-onnx ships with vaporTV (scripts/kokoro.sh fetches it) and runs in a worker of its
// own (scripts/kokoro-worker.cjs); the model (~350 MB) downloads the first time something is spoken.

/** Kokoro v1.0 (Apache 2.0) as sherpa-onnx packs it: the model, its 54 voices, lexicons and eSpeak's data. */
const MODEL_NAME = 'kokoro-multi-lang-v1_0'
const MODEL_URL = `https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/${MODEL_NAME}.tar.bz2`
const VOICE_DIR = join(homedir(), '.local', 'share', 'steamtv', 'voice')
const MODEL_DIR = join(VOICE_DIR, MODEL_NAME)
/** The voice: George, a British man (speaker 26 of the model's 54). */
const SPEAKER = 26
/** The voice for Japanese text: Alpha, a Japanese woman (speaker 37). */
const JAPANESE_SPEAKER = 37
const SPEED = 1
/** The box's Ryzen has 12 cores; this many keeps a sentence well ahead of the one playing. */
const THREADS = 8

type Log = (line: string) => void

/** Speaking started (true) or everything queued has been said (false). */
export type SpeakingListener = (speaking: boolean) => void

let worker: ChildProcess | null = null
let outDir: string | null = null
/** A sentence to say: its WAV once it's made (none if it couldn't be), in the order they were given. */
interface Slot {
  file?: string
  ready: boolean
}
/** Everything to be said, in order: a sentence plays once it's made and those before it have played. */
const slots: Slot[] = []
/** The slots waiting on the Kokoro worker, which answers in the order it's asked. */
const workerSlots: Slot[] = []
/** Japanese said by another voice (VOICEVOX, one of the extras), set by the translator: a WAV, or null to leave it to Kokoro. */
let japaneseVoice: ((text: string) => Promise<string | null>) | null = null
let japaneseReady: () => boolean = () => false
const JAPANESE = /[\u3040-\u30ff\u3400-\u9fff]/
let player: ChildProcess | null = null
let speaking = false
/** Counts stopSpeaking calls: a sentence still on its way from before one is dropped. */
let stops = 0
let onSpeaking: SpeakingListener = () => {}
let log: Log = () => {}
let downloading: Promise<void> | null = null

function kokoroDir(): string {
  return app.isPackaged ? join(process.resourcesPath, 'voice', 'kokoro') : join(app.getAppPath(), 'build', 'voice', 'kokoro')
}

export function speechReady(): boolean {
  return existsSync(join(kokoroDir(), 'worker.cjs')) && existsSync(join(kokoroDir(), 'node_modules', 'sherpa-onnx-node'))
}

export function setSpeechListeners(listener: SpeakingListener, logger: Log): void {
  onSpeaking = listener
  log = logger
}

/** Downloads the model and unpacks it beside the other voice files, if it isn't here yet. */
async function downloadModel(): Promise<void> {
  if (existsSync(join(MODEL_DIR, 'model.onnx'))) return
  log('speech: downloading the voice')
  await mkdir(VOICE_DIR, { recursive: true })
  const part = join(VOICE_DIR, `${MODEL_NAME}.tar.bz2.part`)
  const unpacking = join(VOICE_DIR, `${MODEL_NAME}.unpacking`)
  try {
    const res = await fetch(MODEL_URL)
    if (!res.ok || !res.body) throw new Error(`Couldn't download the speaking voice (${res.status})`)
    await pipeline(Readable.fromWeb(res.body as import('node:stream/web').ReadableStream), createWriteStream(part))
    await rm(unpacking, { recursive: true, force: true })
    await mkdir(unpacking)
    await new Promise<void>((resolve, reject) => {
      const tar = spawn('tar', ['-xjf', part, '-C', unpacking, '--strip-components=1'], { stdio: ['ignore', 'ignore', 'pipe'] })
      let err = ''
      tar.stderr.on('data', (chunk: Buffer) => (err += chunk.toString()))
      tar.on('error', reject)
      tar.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`Couldn't unpack the speaking voice: ${err.trim() || code}`))))
    })
    await rename(unpacking, MODEL_DIR)
    log('speech: voice ready')
  } finally {
    await rm(part, { force: true })
    await rm(unpacking, { recursive: true, force: true })
  }
}

/** Downloads the voice if it isn't here yet (once, however many sentences are waiting on it). */
export async function prepareSpeech(): Promise<void> {
  if (!speechReady()) throw new Error("Speech isn't installed in this build")
  downloading ??= downloadModel().finally(() => (downloading = null))
  await downloading
}

/** Waiting for everything queued to have been said (the translator, before it listens again). */
const quietWaiters: (() => void)[] = []

function setSpeaking(on: boolean): void {
  if (speaking === on) return
  speaking = on
  onSpeaking(on)
  if (!on) for (const done of quietWaiters.splice(0)) done()
}

/** Resolves once everything queued has been said (or stopped). */
export function whenQuiet(): Promise<void> {
  return speaking ? new Promise((resolve) => quietWaiters.push(resolve)) : Promise.resolve()
}

/** Japanese sentences go to `voice` from now on (falling back to Kokoro when it gives none); `ready` says whether it's there (it reads kanji). */
export function setJapaneseVoice(voice: ((text: string) => Promise<string | null>) | null, ready: () => boolean = () => voice !== null): void {
  japaneseVoice = voice
  japaneseReady = ready
}

/** Whether Japanese is said by a voice that reads kanji (else Kokoro, which needs kana). */
export function japaneseReadsKanji(): boolean {
  return japaneseVoice !== null && japaneseReady()
}

/** Plays a WAV made elsewhere (the translator's Japanese voice) after whatever is queued; it's deleted once played. */
export function playWav(file: string): void {
  slots.push({ file, ready: true })
  setSpeaking(true)
  playNext()
}

function fill(slot: Slot, file?: string): void {
  slot.file = file
  slot.ready = true
  playNext()
}

function settle(): void {
  if (!player && !slots.length) setSpeaking(false)
}

function playNext(): void {
  if (player) return
  // Sentences that couldn't be said are passed over; one still being made holds up those after it.
  while (slots[0]?.ready && !slots[0].file) slots.shift()
  if (!slots.length) return settle()
  if (!slots[0].ready) return
  const file = slots.shift()!.file!
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

async function startWorker(): Promise<ChildProcess> {
  if (worker) return worker
  outDir = await mkdtemp(join(tmpdir(), 'vaportv-speech-'))
  // vaporTV's own Electron, as plain Node: reads a sentence a line, writes each as a WAV in outDir
  // and prints its path (an empty line for one it couldn't say).
  const child = spawn(process.execPath, [join(kokoroDir(), 'worker.cjs'), MODEL_DIR, outDir, String(SPEAKER), String(SPEED), String(THREADS), String(JAPANESE_SPEAKER)], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  })
  ownHelper(child)
  worker = child
  createInterface({ input: child.stdout! }).on('line', (line) => {
    if (worker !== child) return
    const slot = workerSlots.shift()
    const file = line.trim()
    if (slot) fill(slot, file.endsWith('.wav') ? file : undefined)
    else if (file.endsWith('.wav')) void rm(file, { force: true })
  })
  child.stderr!.on('data', (chunk: Buffer) => {
    // sherpa-onnx notes each phoneme it has no sound for (a syllable mark eSpeak adds): not worth a log line each.
    const lines = chunk.toString().split('\n').filter((l) => l.trim() && !/Skip unknown phonemes/.test(l))
    for (const l of lines) log(`speech: kokoro: ${l.trim()}`)
  })
  child.on('error', (err) => log(`speech: kokoro: ${err}`))
  child.on('close', (code) => {
    if (worker !== child) return
    log(`speech: kokoro exited ${code}`)
    worker = null
    for (const slot of workerSlots.splice(0)) fill(slot)
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
  // Its place is taken at once (speaking has begun even while a voice downloads), so sentences keep their order.
  const slot: Slot = { ready: false }
  slots.push(slot)
  setSpeaking(true)
  const generation = stops
  try {
    if (japaneseVoice && JAPANESE.test(line)) {
      const file = await japaneseVoice(line).catch((err) => {
        log(`speech: Japanese voice: ${err}`)
        return null
      })
      if (generation !== stops) {
        if (file) void rm(file, { force: true })
        return
      }
      if (file) return fill(slot, file)
    }
    await prepareSpeech()
    const child = await startWorker()
    if (generation !== stops) return
    workerSlots.push(slot)
    child.stdin!.write(`${line}\n`)
  } catch (err) {
    if (generation === stops) fill(slot)
    throw err
  }
}

/** Stops talking at once and forgets what was queued. */
export function stopSpeaking(): void {
  stops++
  const child = worker
  worker = null
  workerSlots.length = 0
  child?.kill()
  player?.kill()
  player = null
  for (const slot of slots.splice(0)) if (slot.file) void rm(slot.file, { force: true })
  if (outDir) void rm(outDir, { recursive: true, force: true })
  outDir = null
  setSpeaking(false)
}
