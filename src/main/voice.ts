import { app } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { VoicePurpose, VoiceState } from '../shared/types'
import { ownHelper } from './helpers'

// Voice search: a remote's Menu tapped (or the search screen's mic) records from the default
// microphone until the speaker stops, then whisper.cpp turns it into text, all on this
// machine. whisper-cli ships with vaporTV (scripts/whisper.sh builds it); its English model
// (~490 MB) downloads the first time voice search is used.

const RATE = 16000
/** Level is judged over this much sound at a time. */
const FRAME_MS = 30
/** The first frames set the room's noise level (their quieter end, in case speech starts at once); speech is louder by the purpose's `overNoiseDb`. */
const CALIBRATE_MS = 300
/** Quieter than this is never speech, however quiet the room. */
const SPEECH_FLOOR_DB = -45
/** Speech has to last this long to count (not a cough or a click). */
const MIN_SPEECH_MS = 150
/** How long each kind of listening goes on: a search is a few words; a bug report, sentences with pauses. */
const LIMITS: Record<VoicePurpose, { endSilenceMs: number; noSpeechMs: number; maxMs: number; overNoiseDb: number }> = {
  // After speaking, endSilenceMs of quiet ends it; nothing said in noSpeechMs gives up.
  search: { endSilenceMs: 1000, noSpeechMs: 5000, maxMs: 10_000, overNoiseDb: 12 },
  // Searching the Music app: as search.
  music: { endSilenceMs: 1000, noSpeechMs: 5000, maxMs: 10_000, overNoiseDb: 12 },
  dictation: { endSilenceMs: 1500, noSpeechMs: 6000, maxMs: 30_000, overNoiseDb: 12 },
  // Talking to Claude from the sofa: quieter speech counts, and a pause to think mid-sentence shouldn't end it.
  conversation: { endSilenceMs: 2200, noSpeechMs: 10_000, maxMs: 60_000, overNoiseDb: 8 }
}
/** Nothing counted as speech, but something this far over the room was there: worth transcribing anyway (talking to Claude). */
const MAYBE_SPEECH_DB = 4
/** vaporTV's music fades out as search opens; the room is measured once it has. */
const MUSIC_FADE_MS = 400

const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin'
const MODEL = join(homedir(), '.local', 'share', 'steamtv', 'voice', 'ggml-small.en.bin')
/** whisper's prompt is cut at about 224 tokens; titles beyond this many characters wouldn't count. */
const HINTS_MAX = 600
/** Words said to Claude that whisper wouldn't otherwise spell right ("paper TV"). */
const CONVERSATION_HINTS = 'vaporTV, Claude, Claude Code, SteamOS, Steam, Emby, EmuDeck, ES-DE, GitHub.'
/** parecord holds back about 2 s of sound by default: listening started late, and Send lost the last words. */
const MIC_LATENCY_MS = 30
/** How often the Claude app hears the mic's level, for its meter. */
const LEVEL_EVERY_MS = 60

type Send = (state: VoiceState) => void
type Log = (line: string) => void
/** The mic's level as it records (0 the room to 1 loud), and whether speech has been heard yet. */
export type OnLevel = (level: number, speech: boolean) => void

let recorder: ChildProcess | null = null
/** Ends the recording now with what's been said (Send), set while recording. */
let finishNow: (() => void) | null = null
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

/** The quieter end of the calibration frames: a room's noise, even if speech started in them. */
export function roomLevel(frames: number[]): number {
  const sorted = [...frames].sort((a, b) => a - b)
  return sorted[Math.floor((sorted.length - 1) * 0.3)] ?? SPEECH_FLOOR_DB
}

/** Records until the speaker stops (or Send); resolves to the sound, or null if nothing was said. `onReady`: sound is coming in, so it's listening. */
function record(log: Log, purpose: VoicePurpose, onReady: () => void, onLevel?: OnLevel): Promise<Buffer | null> {
  const { endSilenceMs, noSpeechMs, maxMs, overNoiseDb } = LIMITS[purpose]
  return new Promise((resolve, reject) => {
    const child = spawn('parecord', ['--raw', `--rate=${RATE}`, '--channels=1', '--format=s16le', `--latency-msec=${MIC_LATENCY_MS}`], { stdio: ['ignore', 'pipe', 'pipe'] })
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
    let room = SPEECH_FLOOR_DB
    let loudest = -Infinity
    /** When the wait for speech started: a press before any (talking to Claude) starts it again. */
    let waitFrom = 0

    const finish = (result: Buffer | null): void => {
      if (done) return
      done = true
      finishNow = null
      child.kill()
      resolve(result)
    }
    // Send: whatever's been said so far (whisper says if it was nothing).
    finishNow = () => {
      // Talking to Claude, a press before a word's been said is "I'm about to talk", not Send.
      if (purpose === 'conversation' && !heard) {
        waitFrom = elapsed
        return log('voice: pressed before speaking, still listening')
      }
      log(`voice: sent (${heard ? 'speech heard' : `nothing over ${threshold.toFixed(1)} dB, loudest ${loudest.toFixed(1)} dB`})`)
      finish(elapsed > CALIBRATE_MS ? Buffer.concat(chunks) : null)
    }
    // Given up with nothing counted as speech: talking to Claude, something near it is still sent.
    const giveUp = (): void => {
      const maybe = purpose === 'conversation' && loudest >= room + MAYBE_SPEECH_DB
      log(`voice: nothing over ${threshold.toFixed(1)} dB (loudest ${loudest.toFixed(1)} dB)${maybe ? ', transcribing anyway' : ''}`)
      finish(maybe ? Buffer.concat(chunks) : null)
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
            room = roomLevel(noise)
            threshold = Math.max(SPEECH_FLOOR_DB, room + overNoiseDb)
            log(`voice: room ${room.toFixed(1)} dB, speech over ${threshold.toFixed(1)} dB`)
            noise = []
            onReady()
          }
          continue
        }
        loudest = Math.max(loudest, db)
        if (onLevel && elapsed % LEVEL_EVERY_MS < FRAME_MS) onLevel(Math.min(1, Math.max(0, (db - room) / 30)), heard)
        if (db > threshold) {
          speech += FRAME_MS
          quiet = 0
          if (speech >= MIN_SPEECH_MS) heard = true
        } else {
          if (!heard) speech = 0
          quiet += FRAME_MS
        }
        if (heard && quiet >= endSilenceMs) return finish(Buffer.concat(chunks))
        if (!heard && elapsed - waitFrom >= noSpeechMs) return giveUp()
        if (elapsed >= maxMs) return heard ? finish(Buffer.concat(chunks)) : giveUp()
      }
    })
    child.stderr.on('data', (chunk: Buffer) => log(`voice: parecord: ${chunk.toString().trim()}`))
    child.on('error', (err) => {
      done = true
      reject(err)
    })
    child.on('close', () => {
      if (recorder === child) recorder = null
      finishNow = null
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

function transcribe(file: string, log: Log, purpose: VoicePurpose): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ['-m', MODEL, '-f', file, '-l', 'en', '-nt', '-np', '-t', '8']
    // Game names help a search; in a description they'd only tempt it to hear them.
    if (hints && purpose === 'search') args.push('--prompt', hints)
    else if (purpose === 'conversation') args.push('--prompt', CONVERSATION_HINTS)
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

/** Listens once (for a search, or dictating a bug report) and reports along the way: listening, thinking, then what was heard (or why not). */
export async function listen(report: (state: VoiceState, purpose: VoicePurpose) => void, log: Log, purpose: VoicePurpose = 'search', onLevel?: OnLevel): Promise<void> {
  if (busy) {
    log('voice: already listening')
    // The Claude screen waits on an answer; tell it there wasn't one, so it stops waiting.
    if (purpose === 'conversation') report({ phase: 'error', message: "Didn't hear anything" }, purpose)
    return
  }
  cancelled = false
  const send: Send = (state) => {
    if (!cancelled) report(state, purpose)
  }
  if (process.platform !== 'linux' || !voiceReady()) {
    send({ phase: 'error', message: "Voice search isn't installed in this build" })
    return
  }
  busy = true
  try {
    // At once, so the search screen opens (and the music fades) before the room is measured.
    send({ phase: 'starting' })
    await ensureModel(send, log)
    const mic = await microphone()
    if (!mic) {
      send({ phase: 'error', message: 'No microphone found. Plug one in and try again.' })
      return
    }
    await new Promise((resolve) => setTimeout(resolve, MUSIC_FADE_MS))
    if (cancelled) return
    log(`voice: starting the microphone ${mic} (${purpose})`)
    // Listening once sound is actually coming in (parecord takes a moment), so the first words aren't lost.
    const pcm = await record(log, purpose, () => {
      log('voice: listening')
      send({ phase: 'listening' })
    }, onLevel && ((level, speech) => !cancelled && onLevel(level, speech)))
    if (cancelled) return log('voice: cancelled')
    if (!pcm) {
      send({ phase: 'error', message: "Didn't hear anything" })
      return
    }
    send({ phase: 'thinking' })
    const file = join(tmpdir(), `vaportv-voice-${process.pid}.wav`)
    await writeFile(file, wav(pcm))
    const started = performance.now()
    const text = await transcribe(file, log, purpose).finally(() => rm(file, { force: true }))
    log(`voice: heard "${text}" in ${Math.round(performance.now() - started)} ms`)
    // Near-silence can come back as the prompt itself: that's nothing said.
    if (purpose === 'conversation' && text && CONVERSATION_HINTS.toLowerCase().includes(text.toLowerCase())) {
      send({ phase: 'error', message: "Didn't catch that" })
      return
    }
    send(text ? { phase: 'heard', text } : { phase: 'error', message: "Didn't catch that" })
  } catch (err) {
    log(`voice: ${err}`)
    send({ phase: 'error', message: err instanceof Error ? err.message : String(err) })
  } finally {
    busy = false
  }
}

/** Send: stops listening and works out what was said so far. */
export function finishListening(): void {
  finishNow?.()
}

/** Stops listening (the search screen closed); nothing is reported for it. */
export function stopListening(): void {
  cancelled = true
  recorder?.kill()
}
