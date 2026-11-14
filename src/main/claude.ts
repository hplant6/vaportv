import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, delimiter, join } from 'node:path'
import { createInterface } from 'node:readline'
import type { ClaudeEvent, ClaudeStatus } from '../shared/types'
import { claudeSignedIn } from './claudeLogin'
import { ownHelper } from './helpers'
import { speak, speechReady, stopSpeaking } from './speech'

// The Claude app: a spoken conversation with Claude Code. One `claude -p` stays running for
// the whole conversation, reading what was said (stream-json in) and streaming its reply
// back (stream-json out), so it remembers what came before. Each finished sentence is
// spoken while the rest is still arriving. Claude Code has to be installed on this machine
// and signed in (see the Claude guide). It may search the web and read this machine freely;
// anything that changes or runs something here asks first, on the TV (approve with A).
// vaporTV's own code is kept at ~/Projects/vaportv and brought up to date from GitHub each
// time a conversation starts, so a fix is made to the latest code.

/** Short and plain: it's heard through a TV and read from across the room. */
export const VOICE_PROMPT = `You are in a spoken conversation through a TV in a living room.
The user talks into a microphone; speech recognition turns it into text, so expect misheard words and infer what was meant. If you truly can't tell, ask one short question.
Your reply is read aloud by text-to-speech and also shown in large type on the TV.
- Answer in one to three short sentences, under 60 words, unless the user asks for more detail.
- Lead with the answer. Use precise, concrete language. No filler, no preamble, no restating the question.
- Plain sentences only: no markdown, lists, headings, tables, code, emoji or URLs.
- Write numbers, units and symbols as they should be spoken when that's clearer.
- Use web search when the answer depends on current or specific facts.`

/** Where vaporTV's code lives on this machine, and the Node that builds it (set up over SSH, see docs/box-dev.md). */
export const SOURCE_DIR = join(homedir(), 'Projects', 'vaportv')
const NODE_BIN = join(homedir(), '.local', 'share', 'vaportv-dev', 'node', 'bin')

/** The working half: fixing this machine and changing vaporTV itself. `source` says how the code was brought up to date. */
export function workPrompt(source: string): string {
  return `You can also fix problems on this machine (a SteamOS box running vaporTV, a TV front end) and change vaporTV's own code.
- Look before you change anything: read logs, files and settings first. Reading never needs permission.
- Anything that changes or runs something asks the user on the TV first. Give every command a short plain description; that is what they see and approve.
- The TV shows a working animation while you use tools, so don't narrate each step. When you finish, say in a sentence or two what you changed and whether it worked.
- SteamOS's system files are read-only and reset by updates: keep changes in the home folder (/home/deck) where you can.
- vaporTV's code is at ${SOURCE_DIR} (git, branch main). ${source}
- vaporTV logs to ~/.cache/steamtv/input.log. Its settings and data are in ~/.config/steamtv.
- To put a code change into use, run scripts/install-here.sh in that folder (it builds the app, which takes several minutes, and installs it; use a 10-minute timeout). The new version starts the next time vaporTV starts, so tell the user to restart vaporTV.
- Commit finished code changes on main with a clear message. Don't push: the user brings the commits to their computer (git pull box main) and pushes from there.`
}

const WORKDIR = join(homedir(), '.local', 'share', 'steamtv', 'claude')
const DEFAULT_MODEL = 'sonnet'
/** Where the native installer and older npm installs put it, then PATH. */
const CANDIDATES = [join(homedir(), '.local', 'bin', 'claude'), join(homedir(), '.claude', 'local', 'claude')]

type Send = (event: ClaudeEvent) => void
type Log = (line: string) => void

let proc: ChildProcess | null = null
let send: Send = () => {}
let log: Log = () => {}
/** The reply so far, and the part not yet handed to speech (an unfinished sentence). */
let reply = ''
let unspoken = ''
let busy = false
/** Turns cut short whose leftover output (and result) is still to come and is dropped. */
let discarding = 0
/** Speak replies aloud (off while the screen is closed). */
let voiceOn = true
let requestId = 0
/** Permission requests waiting for an answer on the TV, by request id. */
const pending = new Map<string, Record<string, unknown>>()

export function claudeBin(): string | null {
  for (const file of CANDIDATES) if (existsSync(file)) return file
  for (const dir of (process.env.PATH ?? '').split(delimiter)) if (dir && existsSync(join(dir, 'claude'))) return join(dir, 'claude')
  return null
}

export async function claudeStatus(): Promise<ClaudeStatus> {
  const bin = claudeBin()
  return { installed: bin !== null, signedIn: bin !== null && (await claudeSignedIn(bin)), speech: speechReady(), running: proc !== null, busy }
}

export function setClaudeListeners(sender: Send, logger: Log): void {
  send = sender
  log = logger
}

/** The finished sentences at the front of `text`, and what's left after them. */
export function splitSentences(text: string): [string[], string] {
  const sentences: string[] = []
  // A sentence ends at . ! ? (not a decimal point or "e.g.") or a line break.
  const end = /([.!?]+["')\]]*)(\s+)|\n+/g
  let start = 0
  for (let m = end.exec(text); m; m = end.exec(text)) {
    const cut = m.index + (m[1]?.length ?? 0)
    const piece = text.slice(start, cut).trim()
    // "Dr." and single initials are rarely a sentence's end; wait for more.
    if (m[1] && /\b(?:[A-Z]|Dr|Mr|Mrs|Ms|St|vs|etc|e\.g|i\.e)\.$/.test(piece)) continue
    if (piece) sentences.push(piece)
    start = m.index + m[0].length
  }
  return [sentences, text.slice(start)]
}

/** Hands finished sentences (all of it, when `final`) to speech; resolves once they're queued. */
async function speakSome(final: boolean): Promise<void> {
  if (!voiceOn) {
    unspoken = ''
    return
  }
  const [sentences, rest] = splitSentences(unspoken)
  unspoken = final ? '' : rest
  await Promise.all(
    (final ? [...sentences, rest] : sentences).map((s) =>
      speak(s).catch((err) => {
        log(`claude: speech: ${err}`)
        send({ type: 'speechError', message: err instanceof Error ? err.message : String(err) })
      })
    )
  )
}

function handle(line: string): void {
  let msg: Record<string, unknown>
  try {
    msg = JSON.parse(line)
  } catch {
    return
  }
  if (msg.type === 'control_request') return askPermission(msg)
  if (msg.type === 'assistant' && !discarding) {
    // Each tool as it's used, in words, for the working line on screen.
    const content = (msg.message as { content?: { type?: string; name?: string; input?: Record<string, unknown> }[] })?.content ?? []
    for (const block of content)
      if (block.type === 'tool_use' || block.type === 'server_tool_use') send({ type: 'tool', name: block.name ?? '', detail: describeTool(block.name ?? '', block.input ?? {}) })
    return
  }
  if (msg.type === 'stream_event') {
    if (discarding) return
    const event = msg.event as { type?: string; delta?: { type?: string; text?: string }; content_block?: { type?: string; name?: string } }
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
      // A second block of text (after a search) starts a new paragraph.
      reply += event.delta.text
      unspoken += event.delta.text
      send({ type: 'delta', text: event.delta.text })
      void speakSome(false)
    } else if (event.type === 'content_block_start' && (event.content_block?.type === 'server_tool_use' || event.content_block?.type === 'tool_use')) {
      // The tool's name is known now, its input (and so the words for it) once the block is complete.
      send({ type: 'tool', name: event.content_block.name ?? '' })
    } else if (event.type === 'content_block_start' && event.content_block?.type === 'text' && reply && !/\s$/.test(reply)) {
      reply += '\n\n'
      unspoken += ' '
      send({ type: 'delta', text: '\n\n' })
    }
  } else if (msg.type === 'result') {
    if (discarding) {
      discarding--
      log(`claude: interrupted turn ended (${msg.subtype})`)
      return
    }
    busy = false
    const isError = msg.is_error === true || (typeof msg.subtype === 'string' && msg.subtype !== 'success')
    const text = typeof msg.result === 'string' ? msg.result : ''
    const said = reply
    reply = ''
    log(`claude: turn done (${msg.subtype}, ${msg.duration_ms} ms)`)
    if (isError) {
      unspoken = ''
      const why = text || String(msg.subtype)
      send({ type: 'error', message: friendlyError(why), signIn: SIGN_IN_ERROR.test(why) })
      // A session that failed to sign in stays failed: the next turn starts afresh.
      if (SIGN_IN_ERROR.test(why)) endClaude()
    } else {
      // The last words go to speech first, so the screen doesn't take the quiet before them for the end.
      void speakSome(true).finally(() => send({ type: 'done', text: said || text }))
    }
  } else if (msg.type === 'system' && msg.subtype === 'init') {
    log(`claude: session ${msg.session_id} (${msg.model})`)
  }
}

/** A tool call in a few words, as the working line shows it. */
export function describeTool(name: string, input: Record<string, unknown>): string {
  const file = typeof input.file_path === 'string' ? basename(input.file_path) : ''
  const said = typeof input.description === 'string' && input.description.trim() ? input.description.trim() : ''
  switch (name) {
    case 'Bash':
      return said || 'Running a command'
    case 'Read':
      return file ? `Reading ${file}` : 'Reading a file'
    case 'Edit':
    case 'Write':
      return file ? `Editing ${file}` : 'Editing a file'
    case 'Glob':
    case 'Grep':
      return 'Searching the files'
    case 'WebSearch':
    case 'web_search':
      return 'Searching the web'
    case 'WebFetch':
    case 'web_fetch':
      return 'Reading a web page'
    default:
      return said || 'Working'
  }
}

/** What a permission request would do, plainly (the line to approve), and the exact thing underneath it. */
export function describeRequest(name: string, input: Record<string, unknown>, description?: string): { description: string; detail: string } {
  const detail =
    typeof input.command === 'string' ? input.command : typeof input.file_path === 'string' ? input.file_path.replace(homedir(), '~') : typeof input.url === 'string' ? input.url : ''
  const plain = description?.trim() || describeTool(name, input)
  return { description: plain, detail: detail.length > 240 ? `${detail.slice(0, 240)}…` : detail }
}

function controlResponse(requestId: string, response: Record<string, unknown>): void {
  proc?.stdin?.write(`${JSON.stringify({ type: 'control_response', response: { subtype: 'success', request_id: requestId, response } })}\n`)
}

/** Claude Code asks before changing or running anything: the TV shows it and waits for A (allow) or B (deny). */
function askPermission(msg: Record<string, unknown>): void {
  const id = String(msg.request_id ?? '')
  const request = (msg.request ?? {}) as { subtype?: string; tool_name?: string; input?: Record<string, unknown>; description?: string }
  if (request.subtype !== 'can_use_tool') {
    proc?.stdin?.write(`${JSON.stringify({ type: 'control_response', response: { subtype: 'error', request_id: id, error: `vaporTV doesn't handle ${request.subtype}` } })}\n`)
    return
  }
  const input = request.input ?? {}
  pending.set(id, input)
  const { description, detail } = describeRequest(request.tool_name ?? '', input, request.description)
  log(`claude: asks to use ${request.tool_name}: ${description}${detail ? ` (${detail})` : ''}`)
  send({ type: 'permission', id, tool: request.tool_name ?? '', description, detail })
  if (voiceOn) void speak(`Can I go ahead? ${description}.`).catch(() => {})
}

/** The answer from the TV. A denied request tells Claude to stop and ask what to do instead. */
export function answerPermission(id: string, allow: boolean): void {
  const input = pending.get(id)
  if (!input) return
  pending.delete(id)
  log(`claude: ${allow ? 'allowed' : 'denied'} ${id}`)
  controlResponse(id, allow ? { behavior: 'allow', updatedInput: input } : { behavior: 'deny', message: 'The user said no on the TV. Don\'t try it another way; ask what they want instead.' })
}

/** Turns down whatever is waiting (the turn was cut short or the conversation ended). */
function denyPending(): void {
  for (const id of [...pending.keys()]) {
    answerPermission(id, false)
    send({ type: 'permissionDone', id })
  }
}

const SIGN_IN_ERROR = /log ?in|api key|authenticat|oauth|credential|401/i

/** Claude Code's errors in words that say what to do. */
export function friendlyError(text: string): string {
  if (SIGN_IN_ERROR.test(text)) return 'Claude Code isn’t signed in on this box. Sign in with your phone to continue.'
  if (/rate.?limit|usage limit|429|overloaded/i.test(text)) return 'Claude is busy or the usage limit was reached. Try again in a little while.'
  return text.length > 200 ? `${text.slice(0, 200)}…` : text
}

async function start(model: string): Promise<ChildProcess> {
  if (proc) return proc
  const bin = claudeBin()
  if (!bin) throw new Error('Claude Code isn’t installed on this box')
  await mkdir(WORKDIR, { recursive: true })
  send({ type: 'tool', name: 'git', detail: 'Getting the latest vaporTV code' })
  const source = await syncSource()
  log(`claude: source: ${source}`)
  const args = [
    '-p',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--model',
    model,
    // Searching and reading run freely; everything else (Bash, Edit, Write) asks on the TV.
    '--tools',
    'WebSearch,WebFetch,Read,Glob,Grep,Bash,Edit,Write',
    '--allowedTools',
    'WebSearch',
    'WebFetch',
    'Read',
    'Glob',
    'Grep',
    '--permission-prompt-tool',
    'stdio',
    // The box's own Claude Code settings (hooks, plugins) stay out of it.
    '--setting-sources',
    '',
    '--append-system-prompt',
    `${VOICE_PROMPT}\n\n${workPrompt(source)}`
  ]
  log(`claude: starting ${bin} (${model})`)
  const child = spawn(bin, args, { cwd: existsSync(SOURCE_DIR) ? SOURCE_DIR : WORKDIR, stdio: ['pipe', 'pipe', 'pipe'], env: { ...toolEnv(), CLAUDE_CODE_ENTRYPOINT: 'vaportv' } })
  ownHelper(child)
  proc = child
  createInterface({ input: child.stdout! }).on('line', (line) => {
    if (proc === child) handle(line)
  })
  let err = ''
  child.stderr!.on('data', (chunk: Buffer) => {
    err = (err + chunk.toString()).slice(-2000)
  })
  child.on('error', (e) => log(`claude: ${e}`))
  child.on('close', (code) => {
    if (proc !== child) return
    proc = null
    pending.clear()
    log(`claude: exited ${code}${err.trim() ? `: ${err.trim().split('\n').slice(-3).join(' | ')}` : ''}`)
    if (busy) {
      busy = false
      send({ type: 'error', message: friendlyError(err.trim() || `Claude Code stopped (exit ${code})`) })
    }
  })
  return child
}

/** The environment commands run in: this machine's, not the AppImage's (its library path and
 *  Electron's variables would leak into whatever Claude builds or runs), with the Node that builds vaporTV. */
export function toolEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {}
  const appDir = env.APPDIR
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined || /^(APPDIR|APPIMAGE|ARGV0|OWD|CHROME_DESKTOP|GDK_BACKEND)$/.test(key) || key.startsWith('ELECTRON_')) continue
    if (appDir && /^(LD_LIBRARY_PATH|LD_PRELOAD|XDG_DATA_DIRS|GSETTINGS_SCHEMA_DIR|PYTHONPATH|PERLLIB|QT_PLUGIN_PATH)$/.test(key)) {
      // The AppImage puts its own folders in front; keep only the machine's.
      const kept = value.split(':').filter((part) => part && !part.startsWith(appDir))
      if (kept.length) out[key] = kept.join(':')
      continue
    }
    out[key] = value
  }
  const path = (out.PATH ?? '/usr/local/bin:/usr/bin:/bin').split(':').filter((part) => !(appDir && part.startsWith(appDir)))
  out.PATH = [NODE_BIN, join(homedir(), '.local', 'bin'), ...path].join(':')
  return out
}

function git(args: string[]): Promise<string> {
  return new Promise((resolve, reject) =>
    execFile('git', ['-C', SOURCE_DIR, ...args], { timeout: 60_000, env: toolEnv() }, (err, stdout, stderr) =>
      err ? reject(new Error((stderr || err.message).trim().split('\n').pop())) : resolve(stdout.trim())
    )
  )
}

/** Brings vaporTV's code up to date from GitHub before Claude sees it; says how that went, for Claude. */
export async function syncSource(): Promise<string> {
  if (!existsSync(join(SOURCE_DIR, '.git'))) return `It isn't set up on this machine yet (no ${SOURCE_DIR}), so code changes can't be made; say so if asked.`
  try {
    if (await git(['status', '--porcelain'])) {
      return 'It has uncommitted changes from an earlier session, so it was NOT updated from GitHub. Tell the user before changing code, and ask whether to keep or discard those changes.'
    }
    const branch = await git(['branch', '--show-current'])
    if (branch !== 'main') await git(['checkout', '-q', 'main'])
    await git(['pull', '--ff-only', '-q', 'origin', 'main'])
    const ahead = await git(['rev-list', '--count', 'origin/main..main'])
    const head = await git(['log', '-1', '--format=%h %s'])
    return `It was just updated to the latest from GitHub (${head})${ahead !== '0' ? `; ${ahead} local commits from earlier sessions sit on top, not pushed yet` : ''}.`
  } catch (err) {
    return `Updating it from GitHub failed (${err instanceof Error ? err.message : err}), so it may be out of date; mention that before changing code.`
  }
}

/** Says something to Claude; the reply comes back through the listener as it's written. */
export async function sendToClaude(text: string, model = DEFAULT_MODEL): Promise<void> {
  const child = await start(model)
  reply = ''
  unspoken = ''
  busy = true
  stopSpeaking()
  child.stdin!.write(`${JSON.stringify({ type: 'user', message: { role: 'user', content: text } })}\n`)
}

/** Cuts the reply short (talking over it): stops speaking and stops Claude's turn. */
export function interruptClaude(): void {
  stopSpeaking()
  unspoken = ''
  denyPending()
  if (proc && busy) {
    busy = false
    discarding++
    reply = ''
    proc.stdin!.write(`${JSON.stringify({ type: 'control_request', request_id: `vaportv-${++requestId}`, request: { subtype: 'interrupt' } })}\n`)
  }
}

/** Whether replies are spoken (the screen is open) or only written. */
export function setClaudeVoice(on: boolean): void {
  voiceOn = on
  if (!on) {
    stopSpeaking()
    unspoken = ''
  }
}

/** Forgets the conversation: the next thing said starts a new one. */
export function endClaude(): void {
  stopSpeaking()
  denyPending()
  const child = proc
  proc = null
  busy = false
  discarding = 0
  reply = ''
  unspoken = ''
  child?.kill()
}
