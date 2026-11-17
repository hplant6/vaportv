import { randomBytes } from 'node:crypto'
import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { homedir } from 'node:os'
import { dirname, extname, join, normalize, sep } from 'node:path'
import { lanAddress } from './claudeLogin'

// Send from your phone (Music sources): while its screen is open, a page on the home network
// (the QR code's address, a fresh secret in it each time) takes songs from a phone's browser
// and saves them in ~/Music/From your phone, keeping an album's folder when one's sent. Audio
// and cover pictures only; it stops when the screen closes, or after a while with nothing sent.

/** Where songs sent land (asked each time: home can't change, but tests give their own). */
const folder = (): string => join(homedir(), 'Music', 'From your phone')
/** What it takes: audio, and the pictures albums come with. */
const ALLOWED = /\.(mp3|flac|ogg|opus|m4a|aac|wav|wma|aiff?|alac|ape|wv|jpe?g|png|webp)$/i
/** A file bigger than this is refused (a 24-bit FLAC album's longest track is well under). */
const MOST_BYTES = 1024 ** 3
/** Nothing sent for this long: the page closes. */
const IDLE_MS = 20 * 60_000

export type PhoneUploadEvent = { phase: 'ready'; url: string } | { phase: 'received'; name: string; count: number } | { phase: 'stopped'; message?: string }

let server: Server | null = null
let idle: NodeJS.Timeout | null = null

/** A path the phone sent ("Album/01 Song.flac"), made safe to keep under the folder: no going up, no odd characters. */
export function safeName(sent: string): string | null {
  const parts = normalize(sent.replace(/\\/g, '/'))
    .split(/[/\\]/)
    .map((p) => p.replace(/[\u0000-\u001f<>:"|?*]/g, '').trim())
    .filter((p) => p && p !== '.' && p !== '..')
  if (!parts.length || !ALLOWED.test(parts[parts.length - 1])) return null
  return parts.slice(-3).join(sep)
}

function page(token: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Send music · vaporTV</title><style>
:root{color-scheme:dark}body{margin:0;padding:28px 20px 48px;background:#0b070d;color:#fff;font:18px/1.45 system-ui,sans-serif}
main{max-width:560px;margin:0 auto}h1{font-size:26px;margin:0 0 6px;color:#ee960d}p{margin:0 0 14px;opacity:.85}
label{display:block;margin:12px 0;padding:18px;border-radius:12px;background:#2a1d0c;text-align:center;font-weight:700;cursor:pointer}
input{display:none}ul{list-style:none;padding:0;margin:18px 0 0}li{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid #2a2a2a;font-size:15px}
li span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ok{color:#7c7}.bad{color:#e77}
</style></head><body><main><h1>Send music to vaporTV</h1>
<p>Pick songs (or a folder, on a computer). They’re copied to the TV and show up in the Music tab.</p>
<label>Choose songs<input id="files" type="file" multiple accept="audio/*,.flac,.m4a,.opus,.ogg,.wav,.jpg,.png"></label>
<label>Choose a folder<input id="folder" type="file" webkitdirectory multiple></label>
<ul id="list"></ul></main><script>
const list=document.getElementById('list');
async function send(files){for(const f of files){const name=f.webkitRelativePath||f.name;const li=document.createElement('li');
const a=document.createElement('span');a.textContent=name;const b=document.createElement('span');b.textContent='0%';li.append(a,b);list.prepend(li);
await new Promise(done=>{const x=new XMLHttpRequest();x.open('PUT','/${token}/file?name='+encodeURIComponent(name));
x.upload.onprogress=e=>{if(e.lengthComputable)b.textContent=Math.round(e.loaded/e.total*100)+'%'};
x.onload=()=>{b.textContent=x.status===200?'✓':'✗ '+x.responseText;b.className=x.status===200?'ok':'bad';done()};
x.onerror=()=>{b.textContent='✗ lost the TV';b.className='bad';done()};x.send(f)})}}
for(const id of ['files','folder'])document.getElementById(id).onchange=e=>send([...e.target.files]);
</script></body></html>`
}

/** Starts the page; events go to `send` (ready with its address, each song received, stopped). */
export function startPhoneUpload(send: (event: PhoneUploadEvent) => void): void {
  stopPhoneUpload()
  const ip = lanAddress()
  if (!ip) return send({ phase: 'stopped', message: 'This TV isn’t on a network, so a phone can’t reach it.' })
  const token = randomBytes(12).toString('base64url')
  let count = 0
  const touch = (): void => {
    if (idle) clearTimeout(idle)
    idle = setTimeout(() => {
      stopPhoneUpload()
      send({ phase: 'stopped', message: 'Closed after a while with nothing sent' })
    }, IDLE_MS)
  }
  const srv = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://tv')
    const reply = (status: number, body: string, type = 'text/plain; charset=utf-8'): void => {
      res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' })
      res.end(body)
    }
    if (req.method === 'GET' && url.pathname === `/${token}`) return reply(200, page(token), 'text/html; charset=utf-8')
    if (req.method !== 'PUT' || url.pathname !== `/${token}/file`) return reply(404, 'Not here')
    const name = safeName(url.searchParams.get('name') ?? '')
    if (!name) return reply(415, 'not a song')
    if (Number(req.headers['content-length'] ?? 0) > MOST_BYTES) return reply(413, 'too big')
    touch()
    // One already there of the same name: "Song (2).flac".
    const wanted = join(folder(), name)
    const ext = extname(wanted)
    let target = wanted
    for (let n = 2; existsSync(target); n++) target = `${wanted.slice(0, -ext.length)} (${n})${ext}`
    const temp = `${target}.part`
    let bytes = 0
    void mkdir(dirname(target), { recursive: true }).then(() => {
      const out = createWriteStream(temp)
      req.on('data', (chunk: Buffer) => {
        bytes += chunk.length
        if (bytes > MOST_BYTES) req.destroy()
      })
      req.pipe(out)
      const fail = (): void => {
        out.destroy()
        void rm(temp, { force: true })
        if (!res.headersSent) reply(500, 'not saved')
      }
      req.on('aborted', fail)
      req.on('error', fail)
      out.on('error', fail)
      out.on('finish', () => {
        if (bytes > MOST_BYTES) return fail()
        void rename(temp, target).then(
          () => {
            count++
            send({ phase: 'received', name: name.split(sep).pop()!, count })
            reply(200, 'ok')
          },
          () => fail()
        )
      })
    })
  })
  srv.on('error', () => send({ phase: 'stopped', message: 'Couldn’t open the page for your phone' }))
  srv.listen(0, '0.0.0.0', () => {
    const address = srv.address()
    if (!address || typeof address === 'string') return
    server = srv
    touch()
    send({ phase: 'ready', url: `http://${ip}:${address.port}/${token}` })
  })
}

export function stopPhoneUpload(): void {
  if (idle) clearTimeout(idle)
  idle = null
  server?.close()
  server = null
}
