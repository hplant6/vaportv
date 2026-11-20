import { randomBytes } from 'node:crypto'
import { open } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { homedir } from 'node:os'
import { scrub } from '../shared/bugReport'
import { lanAddress } from './claudeLogin'

// Report a problem's full details: a snapshot of what each part of vaporTV is doing at the
// moment the report is opened (main's parts registered here, the page's sent with the
// request), the system, and the whole recent log, scrubbed as the GitHub report is. A bug
// that's on screen when it's reported is still in this snapshot: the music held by
// something, a backdrop whose drawing was lost, the window out of focus.
//
// Nothing is gathered until a report is opened: each part just has a function waiting to
// be asked. The bundle is offered on a page on the home network (the second QR code), only
// while Report a problem is open; nothing leaves the box unless the person downloads or
// copies it.

/** What a part of main says about itself: plain values (states, kinds, counts), nothing personal. */
type Provider = () => unknown | Promise<unknown>
const providers = new Map<string, Provider>()

/** Adds a part of main to the snapshot under `name`. */
export function registerDiagnostics(name: string, provider: Provider): void {
  providers.set(name, provider)
}

/** Every registered part's state; one that throws says so instead of spoiling the rest. */
export async function collectMainDiagnostics(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {}
  for (const [name, provider] of providers) {
    try {
      out[name] = await provider()
    } catch (err) {
      out[name] = { error: String(err) }
    }
  }
  return out
}

/** How much of the end of the log goes in: days of an ordinary log, without making the file huge. */
const LOG_BYTES = 512 * 1024

async function logTail(path: string): Promise<string[]> {
  const file = await open(path, 'r').catch(() => null)
  if (!file) return ['(no log)']
  try {
    const { size } = await file.stat()
    const start = Math.max(0, size - LOG_BYTES)
    const buffer = Buffer.alloc(size - start)
    await file.read(buffer, 0, buffer.length, start)
    const lines = buffer.toString('utf8').split('\n').filter(Boolean)
    return start > 0 ? lines.slice(1) : lines
  } finally {
    await file.close()
  }
}

/** The bundle, as text: a header, the system, each side's snapshot (JSON), then the scrubbed log. */
export async function makeDiagnostics(system: string[], page: Record<string, unknown>, logPath: string): Promise<string> {
  const home = homedir()
  const json = (value: unknown): string => JSON.stringify(value, null, 2).split(home).join('~')
  const main = await collectMainDiagnostics()
  const log = (await logTail(logPath)).map((line) => scrub(line, home))
  return [
    `vaporTV details, ${new Date().toISOString()}`,
    'Attach this file to your GitHub report. It has what vaporTV was doing when you opened Report a problem, and its recent log, with what you pressed, said and named taken out.',
    '',
    '## System',
    ...system.map((s) => `- ${s}`),
    '',
    '## vaporTV (main)',
    json(main),
    '',
    '## vaporTV (screen)',
    json(page),
    '',
    `## Log (last ${log.length} lines)`,
    ...log,
    ''
  ].join('\n')
}

/** The details page closes by itself after this long, if the report's left open. */
const OPEN_MS = 20 * 60_000

let server: Server | null = null
let timer: NodeJS.Timeout | null = null

function pageHtml(token: string, issueUrl: string, lines: number): string {
  const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Report details · vaporTV</title><style>
:root{color-scheme:dark}body{margin:0;padding:28px 20px 48px;background:#0b070d;color:#fff;font:18px/1.45 system-ui,sans-serif}
main{max-width:640px;margin:0 auto}h1{font-size:26px;margin:0 0 6px;color:#ee960d}p{margin:0 0 14px;opacity:.85}
a.button,button{display:block;width:100%;box-sizing:border-box;margin:12px 0;padding:18px;border:0;border-radius:12px;background:#2a1d0c;color:#fff;text-align:center;font:700 18px system-ui,sans-serif;text-decoration:none}
a.primary{background:#ee960d;color:#000}pre{white-space:pre-wrap;word-break:break-word;font-size:12px;background:#151017;padding:12px;border-radius:8px;max-height:50vh;overflow:auto}
#copied{text-align:center;color:#7c7;min-height:1.4em}
</style></head><body><main><h1>Report details</h1>
<p>What vaporTV was doing when you opened Report a problem, and its recent log (${lines} lines). What you pressed, said and named has been taken out, but read it over before you share it: reports on GitHub are public.</p>
<a class="button primary" href="/${token}/vaportv-details.txt" download="vaportv-details.txt">Download the details</a>
<button id="copy">Copy the details</button><div id="copied"></div>
<a class="button" href="${esc(issueUrl)}">Write the report on GitHub</a>
<p>On GitHub, describe what went wrong, then attach the downloaded file (or paste the copy) before you submit.</p>
<pre id="text">Loading…</pre></main><script>
const pre=document.getElementById('text');let text='';
fetch('/${token}/vaportv-details.txt').then(r=>r.text()).then(t=>{text=t;pre.textContent=t});
document.getElementById('copy').onclick=async()=>{const say=m=>document.getElementById('copied').textContent=m;
try{await navigator.clipboard.writeText(text);return say('Copied')}catch{}
const ta=document.createElement('textarea');ta.value=text;ta.setAttribute('readonly','');ta.style.position='fixed';ta.style.opacity='0';
document.body.append(ta);ta.select();ta.setSelectionRange(0,text.length);const ok=document.execCommand('copy');ta.remove();say(ok?'Copied':'Couldn\\u2019t copy: use Download instead')};
</script></body></html>`
}

/** Offers `details` on a page on the home network; its address, or null when the box isn't on one. */
export function startDiagnosticsPage(details: string, issueUrl: string): Promise<string | null> {
  stopDiagnosticsPage()
  const ip = lanAddress()
  if (!ip) return Promise.resolve(null)
  const token = randomBytes(12).toString('base64url')
  const lines = details.split('\n').length
  const srv = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://tv').pathname
    const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }
    if (req.method === 'GET' && path === `/${token}`) {
      res.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8' })
      return res.end(pageHtml(token, issueUrl, lines))
    }
    if (req.method === 'GET' && path === `/${token}/vaportv-details.txt`) {
      res.writeHead(200, { ...headers, 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': 'attachment; filename="vaportv-details.txt"' })
      return res.end(details)
    }
    res.writeHead(404, headers)
    res.end('Not here')
  })
  return new Promise((resolve) => {
    srv.on('error', () => resolve(null))
    srv.listen(0, '0.0.0.0', () => {
      const address = srv.address()
      if (!address || typeof address === 'string') return resolve(null)
      server = srv
      timer = setTimeout(stopDiagnosticsPage, OPEN_MS)
      resolve(`http://${ip}:${address.port}/${token}`)
    })
  })
}

export function stopDiagnosticsPage(): void {
  if (timer) clearTimeout(timer)
  timer = null
  server?.close()
  server = null
}
