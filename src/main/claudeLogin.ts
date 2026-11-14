import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { networkInterfaces } from 'node:os'
import type { ClaudeLoginState } from '../shared/types'
import { ownHelper } from './helpers'

// Signing Claude Code in from a phone. `claude auth login` prints a sign-in address and then
// waits for the code Anthropic shows after signing in. The TV shows a QR code for a one-off
// page vaporTV serves on the home network: it links to the sign-in, and takes the code back
// (pasted on the phone) to hand to `claude auth login`. A wrong code starts a fresh sign-in.

/** The page stops answering after this long. */
const TIMEOUT_MS = 15 * 60_000
/** How long `claude auth login` gets to check a code. */
const CHECK_MS = 45_000

type Send = (state: ClaudeLoginState) => void
type Log = (line: string) => void

let server: Server | null = null
let login: ChildProcess | null = null
let authUrl: string | null = null
let timer: NodeJS.Timeout | null = null
/** Resolves with what `claude auth login` said of the last code: null when it took it. */
let checking: ((failure: string | null) => void) | null = null

/** This machine's address on the home network: a private IPv4, the usual home ranges first. */
export function lanAddress(): string | null {
  const found: string[] = []
  for (const [name, addresses] of Object.entries(networkInterfaces())) {
    if (/^(docker|br-|veth|virbr|tailscale|lo)/.test(name)) continue
    for (const a of addresses ?? []) if (a.family === 'IPv4' && !a.internal) found.push(a.address)
  }
  const rank = (ip: string): number => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3)
  return found.sort((a, b) => rank(a) - rank(b))[0] ?? null
}

const escape = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

function page(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign in to Claude · vaporTV</title><style>
:root{color-scheme:dark}body{margin:0;padding:28px 20px 48px;background:#0b070d;color:#fff;font:18px/1.45 system-ui,sans-serif}
main{max-width:520px;margin:0 auto}h1{font-size:26px;margin:0 0 6px;color:#ee960d}p{margin:0 0 14px;opacity:.85}
ol{padding-left:22px;margin:20px 0}li{margin-bottom:22px}
a.button,button{display:block;width:100%;box-sizing:border-box;padding:16px;border:0;border-radius:14px;background:#ee960d;color:#0b070d;font:700 18px system-ui,sans-serif;text-align:center;text-decoration:none;margin-top:10px}
textarea{width:100%;box-sizing:border-box;min-height:96px;margin-top:10px;padding:12px;border-radius:12px;border:1px solid rgba(255,226,183,.3);background:rgba(190,147,111,.08);color:#fff;font:16px ui-monospace,monospace}
.msg{padding:12px 14px;border-radius:12px;background:rgba(238,150,13,.15);margin:16px 0}</style></head><body><main>${body}</main></body></html>`
}

function form(token: string, message = ''): string {
  if (!authUrl) return page('<h1>Getting sign-in ready…</h1><p>Reload this page in a moment.</p>')
  return page(`<h1>Sign in to Claude</h1><p>For the Claude app on your TV.</p>
${message ? `<div class="msg">${escape(message)}</div>` : ''}
<ol><li>Sign in with your Claude account. When it shows a code, copy it.<a class="button" href="${escape(authUrl)}" target="_blank" rel="noopener">Sign in to Claude</a></li>
<li>Come back here, paste the code and tap Finish.<form method="post" action="/${token}"><textarea name="code" required autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Paste the code here"></textarea><button type="submit">Finish</button></form></li></ol>`)
}

/** Starts `claude auth login` and resolves with the address it wants signed in at. */
function startLogin(bin: string, log: Log): Promise<string> {
  return new Promise((resolve, reject) => {
    // BROWSER=true: nothing opens on the TV; the phone does the signing in.
    const child = spawn(bin, ['auth', 'login', '--claudeai'], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, BROWSER: 'true' } })
    ownHelper(child)
    login = child
    let out = ''
    let found = false
    const onData = (chunk: Buffer): void => {
      out += chunk.toString()
      const url = /https:\/\/\S+\/oauth\/authorize\?\S+/.exec(out)?.[0]
      if (url && !found) {
        found = true
        resolve(url)
      }
    }
    child.stdout!.on('data', onData)
    child.stderr!.on('data', onData)
    child.on('error', reject)
    child.on('close', (code) => {
      if (login === child) login = null
      const said = out.split('\n').filter((l) => /login|sign|code|error/i.test(l) && !/https:/.test(l)).pop()?.replace(/^.*?>\s*/, '').trim()
      log(`claude login: exited ${code}${said ? ` (${said})` : ''}`)
      if (!found) reject(new Error(said || 'Claude Code didn’t start a sign-in'))
      checking?.(code === 0 ? null : said || 'That code wasn’t accepted.')
      checking = null
    })
  })
}

/** Hands a code to `claude auth login`; resolves with why not, or null when signed in. */
function check(code: string): Promise<string | null> {
  const child = login
  if (!child?.stdin?.writable) return Promise.resolve('This sign-in has ended. Scan the QR code on the TV again.')
  return new Promise((resolve) => {
    const giveUp = setTimeout(() => {
      checking = null
      child.kill()
      resolve('Checking the code took too long.')
    }, CHECK_MS)
    checking = (failure) => {
      clearTimeout(giveUp)
      resolve(failure)
    }
    child.stdin!.write(`${code.trim()}\n`)
  })
}

/** Shows the phone page and runs sign-ins until one works, the screen closes or time runs out. */
export async function startClaudeLogin(bin: string, send: Send, log: Log): Promise<void> {
  stopClaudeLogin()
  const ip = lanAddress()
  if (!ip) return send({ phase: 'failed', message: 'This box isn’t on a network, so a phone can’t reach it.' })
  const token = randomBytes(12).toString('base64url')

  const fresh = async (): Promise<void> => {
    authUrl = null
    authUrl = await startLogin(bin, log)
  }

  const srv = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://box').pathname
    if (path !== `/${token}`) return void res.writeHead(404).end()
    const reply = (html: string): void => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' })
      res.end(html)
    }
    if (req.method !== 'POST') return reply(form(token))
    let body = ''
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString()
      if (body.length > 8192) req.destroy()
    })
    req.on('end', async () => {
      const code = new URLSearchParams(body).get('code')?.trim() ?? ''
      if (!code) return reply(form(token, 'Paste the code first.'))
      send({ phase: 'checking' })
      log('claude login: checking a code from the phone')
      const failure = await check(code)
      if (!failure) {
        send({ phase: 'done' })
        reply(page('<h1>Signed in</h1><p>You’re all set. Claude is ready on the TV.</p>'))
        stopClaudeLogin()
        return
      }
      log(`claude login: ${failure}`)
      // That sign-in is spent: start another for the next try.
      try {
        await fresh()
      } catch (err) {
        send({ phase: 'failed', message: String(err instanceof Error ? err.message : err) })
        return reply(page(`<h1>Sign-in stopped</h1><p>${escape(String(err))}</p>`))
      }
      send({ phase: 'waiting', url: pageUrl, message: 'That code didn’t work. Try again on your phone.' })
      // Each sign-in's code works once: the phone needs a new one.
      reply(form(token, /took too long|ended/.test(failure) ? failure : 'That code wasn’t accepted. Tap Sign in again for a new code, then paste that one.'))
    })
  })
  server = srv
  await new Promise<void>((resolve) => srv.listen(0, '0.0.0.0', resolve))
  const pageUrl = `http://${ip}:${(srv.address() as { port: number }).port}/${token}`
  log(`claude login: phone page on ${ip}`)
  timer = setTimeout(() => {
    send({ phase: 'failed', message: 'Sign-in timed out.' })
    stopClaudeLogin()
  }, TIMEOUT_MS)
  try {
    await fresh()
  } catch (err) {
    send({ phase: 'failed', message: err instanceof Error ? err.message : String(err) })
    stopClaudeLogin()
    return
  }
  if (server === srv) send({ phase: 'waiting', url: pageUrl })
}

export function stopClaudeLogin(): void {
  if (timer) clearTimeout(timer)
  timer = null
  server?.close()
  server = null
  const child = login
  login = null
  checking = null
  authUrl = null
  child?.kill()
}

/** Whether Claude Code is signed in (`claude auth status`; read from its own files, no network). */
export function claudeSignedIn(bin: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(bin, ['auth', 'status'], { stdio: ['ignore', 'pipe', 'ignore'] })
    ownHelper(child)
    let out = ''
    child.stdout.on('data', (chunk: Buffer) => (out += chunk))
    child.on('error', () => resolve(false))
    child.on('close', () => {
      try {
        resolve(JSON.parse(out).loggedIn === true)
      } catch {
        resolve(/logged in|signed in/i.test(out) && !/not (logged|signed) in/i.test(out))
      }
    })
  })
}
