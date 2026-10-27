import { app } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { VoiceState } from '../shared/types'
import { ownHelper } from './helpers'

// Voice search: a remote's Menu tapped (or the search screen's mic) records from the default
// microphone until the speaker stops, then whisper.cpp turns it into text, all on this
// machine. whisper-cli ships with vaporTV (scripts/whisper.sh builds it); its English model
// (~150 MB) downloads the first time voice search is used.

const RATE = 16000
/** Level is judged over this much sound at a time. */
const FRAME_MS = 30
/** The first frames set the room's noise level; speech is this much louder. */
const CALIBRATE_MS = 300
const SPEECH_OVER_NOISE_DB = 12
/** Quieter than this is never speech, however quiet the room. */
const SPEECH_FLOOR_DB = -45
/** Speech has to last this long to count (not a cough or a click). */
const MIN_SPEECH_MS = 150
/** After speaking, this much quiet ends the recording. */
const END_SILENCE_MS = 1000
/** Nothing said in this long: give up. */
const NO_SPEECH_MS = 5000
const MAX_MS = 10_000

const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin'
const MODEL = join(homedir(), '.local', 'share', 'steamtv', 'voice', 'ggml-base.en.bin')
/** whisper's prompt is cut at about 224 tokens; titles beyond this many characters wouldn't count. */
const HINTS_MAX = 600

type Send = (state: VoiceState) => void
type Log = (line: string) => void

let recorder: ChildProcess | null = null
let busy = false
/** The search screen closed while listening: say nothing more. */
let cancelled = false
let hints = ''

function whisperCli(): string {
  return app.isPackaged ? join(process.resourcesPath, 'voice', 'whisper-cli') : join(app.getAppPath(), 'build', 'voice', 'whisper-cli')
}

/** Titles whisper should expect (the library's), so it spells "Metroid" rather than "metro it". */
export function setVoiceHints(titles: string[]): void {
  let text = ''
  for (const title of titles) {
    if (text.length + title.length + 2 > HINTS_MAX) break
    text += (text ? ', ' : '') + title
  }
  hints = text
}

export function voiceReady(): boolean {
  return existsSync(whisperCli())
}

async function ensureModel(send: Send, log: Log): Promise<void> {
  if (existsSync(MODEL)) return
  send({ phase: 'preparing' })
  log('voice: downloading the speech model')
  await mkdir(join(MODEL, '..'), { recursive: true })
  const part = `${MODEL}.part`
  const res = await fetch(MODEL_URL)
  if (!res.ok || !res.body) throw new Error(`Couldn't download the speech model (${res.status})`)
  await pipeline(Readable.fromWeb(res.body as import('node:stream/web').ReadableStream), createWriteStream(part))
  await rename(part, MODEL)
}

/** dBFS of 16-bit samples. */
function level(samples: Int16Array): number {
  let sum = 0
  for (const s of samples) sum += s * s
  const rms = Math.sqrt(sum / samples.length)
  return rms ? 20 * Math.log10(rms / 32768) : -100
}

/** The default microphone's name, or null when there's none (only a monitor of what's playing). */
function microphone(): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn('pactl', ['get-default-source'])
    let out = ''
    child.stdout.on('data', (chunk: Buffer) => (out += chunk))
    child.on('error', () => resolve(null))
    child.on('close', () => {
      const name = out.trim()
      resolve(name && !name.endsWith('.monitor') ? name : null)
    })
  })
}

/** Records until the speaker stops; resolves to the sound, or null if nothing was said. */
function record(log: Log): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const child = spawn('parecord', ['--raw', `--rate=${RATE}`, '--channels=1', '--format=s16le'], { stdio: ['ignore', 'pipe', 'pipe'] })
    ownHelper(child)
    recorder = child
    const frameBytes = (RATE * FRAME_MS * 2) / 1000
    const chunks: Buffer[] = []
    let pending = Buffer.alloc(0)
    let elapsed = 0
    let noise: number[] = []
    let threshold = SPEECH_FLOOR_DB
    let speech = 0
    let heard = false
    let quiet = 0
    let done = false

    const finish = (result: Buffer | null): void => {
      if (done) return
      done = true
      child.kill()
      resolve(result)
    }

    child.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
      pending = Buffer.concat([pending, chunk])
      while (pending.length >= frameBytes) {
        const frame = new Int16Array(pending.buffer.slice(pending.byteOffset, pending.byteOffset + frameBytes))
        pending = pending.subarray(frameBytes)
        elapsed += FRAME_MS
        const db = level(frame)
        if (elapsed <= CALIBRATE_MS) {
          noise.push(db)
          if (elapsed + FRAME_MS > CALIBRATE_MS) {
            const room = noise.reduce((a, b) => a + b, 0) / noise.length
            threshold = Math.max(SPEECH_FLOOR_DB, room + SPEECH_OVER_NOISE_DB)
            log(`voice: room ${room.toFixed(1)} dB, speech over ${threshold.toFixed(1)} dB`)
            noise = []
          }
          continue
        }
        if (db > threshold) {
          speech += FRAME_MS
          quiet = 0
          if (speech >= MIN_SPEECH_MS) heard = true
        } else {
          if (!heard) speech = 0
          quiet += FRAME_MS
        }
        if (heard && quiet >= END_SILENCE_MS) return finish(Buffer.concat(chunks))
        if (!heard && elapsed >= NO_SPEECH_MS) return finish(null)
        if (elapsed >= MAX_MS) return finish(heard ? Buffer.concat(chunks) : null)
      }
    })
    child.stderr.on('data', (chunk: Buffer) => log(`voice: parecord: ${chunk.toString().trim()}`))
    child.on('error', (err) => {
      done = true
      reject(err)
    })
    child.on('close', () => {
      if (recorder === child) recorder = null
      // Stopped from outside (cancelled), or parecord gave up.
      if (!done) finish(null)
    })
  })
}

function wav(pcm: Buffer): Buffer {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(RATE, 24)
  header.writeUInt32LE(RATE * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

/** whisper's text, less its notes on what it heard besides words ("[BLANK_AUDIO]", "(music)"). */
export function cleanTranscript(out: string): string {
  return out
    .replace(/\[[^\]]*\]|\([^)]*\)|\*[^*]*\*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?]+$/, '')
}

function transcribe(file: string, log: Log): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ['-m', MODEL, '-f', file, '-l', 'en', '-nt', '-np', '-t', '8']
    if (hints) args.push('--prompt', hints)
    const child = spawn(whisperCli(), args, { stdio: ['ignore', 'pipe', 'pipe'] })
    ownHelper(child)
    let out = ''
    let err = ''
    child.stdout.on('data', (chunk: Buffer) => (out += chunk))
    child.stderr.on('data', (chunk: Buffer) => (err += chunk))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) {
        log(`voice: whisper exited ${code}: ${err.trim().split('\n').slice(-3).join(' | ')}`)
        return reject(new Error('Speech recognition failed'))
      }
      resolve(cleanTranscript(out))
    })
  })
}

/** Listens once and reports along the way: listening, thinking, then what was heard (or why not). */
export async function listen(report: Send, log: Log): Promise<void> {
  if (busy) return log('voice: already listening')
  cancelled = false
  const send: Send = (state) => {
    if (!cancelled) report(state)
  }
  if (process.platform !== 'linux' || !voiceReady()) {
    send({ phase: 'error', message: "Voice search isn't installed in this build" })
    return
  }
  busy = true
  try {
    await ensureModel(send, log)
    const mic = await microphone()
    if (!mic) {
      send({ phase: 'error', message: 'No microphone found. Plug one in and try again.' })
      return
    }
    log(`voice: listening on ${mic}`)
    send({ phase: 'listening' })
    const pcm = await record(log)
    if (cancelled) return log('voice: cancelled')
    if (!pcm) {
      send({ phase: 'error', message: "Didn't hear anything" })
      return
    }
    send({ phase: 'thinking' })
    const file = join(tmpdir(), `vaportv-voice-${process.pid}.wav`)
    await writeFile(file, wav(pcm))
    const started = performance.now()
    const text = await transcribe(file, log).finally(() => rm(file, { force: true }))
    log(`voice: heard "${text}" in ${Math.round(performance.now() - started)} ms`)
    send(text ? { phase: 'heard', text } : { phase: 'error', message: "Didn't catch that" })
  } catch (err) {
    log(`voice: ${err}`)
    send({ phase: 'error', message: err instanceof Error ? err.message : String(err) })
  } finally {
    busy = false
  }
}

/** Stops listening (the search screen closed); nothing is reported for it. */
export function stopListening(): void {
  cancelled = true
  recorder?.kill()
}
