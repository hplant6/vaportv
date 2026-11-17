import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { chmod, mkdir, readFile, rm, rmdir, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { NETWORK_DIR } from './musicLibrary'

// Network shares signed in to from vaporTV (Music sources → Add a network share), no
// terminal or root: rclone mounts each one read-only under ~/Network (FUSE, which SteamOS lets
// a user do), where it's just a folder, as a share mounted the old way is. rclone is fetched
// the first time a share's added (a pinned release, checked against its published SHA-256)
// into ~/.local/share/steamtv/rclone; each share's sign-in is kept in a config file only you
// can read, the password in rclone's obscured form. Mounted again whenever vaporTV starts.

const VERSION = 'v1.68.2'
const ZIP = `rclone-${VERSION}-linux-amd64.zip`
const BASE_URL = `https://downloads.rclone.org/${VERSION}`
const BIN_DIR = join(homedir(), '.local', 'share', 'steamtv', 'rclone')
const BIN = join(BIN_DIR, 'rclone')
const CONFIG = join(homedir(), '.config', 'steamtv', 'rclone.conf')
/** Asking a server for its shares, or a share for its folders, gives up after this long. */
const PROBE_MS = 20_000

export interface ShareSignIn {
  host: string
  user: string
  password: string
}

export interface SavedShare {
  /** Its folder under ~/Network (and its section in the config). */
  name: string
  host: string
  share: string
  user: string
  mounted: boolean
}

type Log = (line: string) => void

function run(args: string[], options: { input?: string; env?: Record<string, string>; timeoutMs?: number } = {}): Promise<{ code: number; out: string; err: string }> {
  return new Promise((done) => {
    const child = spawn(BIN, args, { env: { ...process.env, ...options.env }, stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    const timer = options.timeoutMs ? setTimeout(() => child.kill(), options.timeoutMs) : null
    child.stdout.on('data', (c: Buffer) => (out += c.toString()))
    child.stderr.on('data', (c: Buffer) => (err += c.toString()))
    child.on('error', (e) => done({ code: -1, out, err: String(e) }))
    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      done({ code: code ?? -1, out, err })
    })
    child.stdin.end(options.input ?? '')
  })
}

/** The pinned rclone, fetched and checked the first time. */
export async function ensureRclone(log: Log): Promise<void> {
  if (existsSync(BIN)) return
  log(`shares: fetching rclone ${VERSION}`)
  const [zip, sums] = await Promise.all([
    fetch(`${BASE_URL}/${ZIP}`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`rclone download: ${r.status}`)))),
    fetch(`${BASE_URL}/SHA256SUMS`).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`rclone checksums: ${r.status}`))))
  ])
  const want = sums.split('\n').find((l) => l.trim().endsWith(ZIP))?.trim().split(/\s+/)[0]
  const got = createHash('sha256').update(Buffer.from(zip)).digest('hex')
  if (!want || want !== got) throw new Error("The share helper didn't download properly; try again")
  await mkdir(BIN_DIR, { recursive: true })
  const zipFile = join(tmpdir(), `vaportv-${ZIP}`)
  await writeFile(zipFile, Buffer.from(zip))
  // The binary out of the zip (Python's zipfile: on SteamOS, where unzip may not be).
  const code = await new Promise<number>((done) => {
    const py = spawn('python3', ['-c', 'import sys,zipfile;open(sys.argv[3],"wb").write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]))', zipFile, `rclone-${VERSION}-linux-amd64/rclone`, BIN])
    py.on('error', () => done(-1))
    py.on('close', (c) => done(c ?? -1))
  })
  await rm(zipFile, { force: true })
  if (code !== 0) throw new Error("Couldn't unpack the share helper")
  await chmod(BIN, 0o755)
  log('shares: rclone ready')
}

/** rclone's obscured form of a password (from stdin, so it's never on a command line). */
async function obscure(password: string): Promise<string> {
  const r = await run(['obscure', '-'], { input: password })
  if (r.code !== 0) throw new Error("Couldn't keep the password")
  return r.out.trim()
}

/** A server signed in to, as rclone's environment (no file): for finding shares and testing a sign-in. */
async function probeEnv(s: ShareSignIn): Promise<Record<string, string>> {
  return {
    RCLONE_CONFIG_PROBE_TYPE: 'smb',
    RCLONE_CONFIG_PROBE_HOST: s.host,
    RCLONE_CONFIG_PROBE_USER: s.user,
    RCLONE_CONFIG_PROBE_PASS: await obscure(s.password)
  }
}

/** What rclone said, as something a person can act on. */
function why(err: string): string {
  if (/logon failure|access denied|STATUS_LOGON_FAILURE|NT_STATUS_ACCESS_DENIED/i.test(err)) return 'The username or password was wrong'
  if (/no such host|connection refused|i\/o timeout|unreachable|deadline exceeded/i.test(err)) return "Couldn't reach that computer: check its name or address, and that it's on"
  if (/bad network name|BAD_NETWORK_NAME/i.test(err)) return "That share isn't on the computer"
  return err.split('\n').find((l) => l.trim())?.replace(/^.*?ERROR\s*:\s*/, '').slice(0, 160) || "Couldn't connect"
}

/** The shares on a computer (its folders shared on the network), signed in to with these. */
export async function findShares(s: ShareSignIn, log: Log): Promise<string[]> {
  await ensureRclone(log)
  const r = await run(['lsd', 'probe:'], { env: await probeEnv(s), timeoutMs: PROBE_MS })
  if (r.code !== 0) throw new Error(why(r.err))
  return shareNames(r.out)
}

/** rclone lsd's lines ("          -1 2026-01-01 00:00:00        -1 Music"): the names, hidden admin shares (C$, IPC$) left out. */
export function shareNames(out: string): string[] {
  return out
    .split('\n')
    .map((l) => l.trim().split(/\s+/).slice(4).join(' '))
    .filter((n) => n && !/\$$/.test(n))
}

interface Section {
  name: string
  host: string
  share: string
  user: string
  pass: string
}

async function readConfig(): Promise<Section[]> {
  const text = await readFile(CONFIG, 'utf8').catch(() => '')
  const out: Section[] = []
  let cur: Partial<Section> | null = null
  for (const line of text.split('\n')) {
    const head = line.match(/^\[(.+)\]$/)
    if (head) {
      cur = { name: head[1] }
      out.push(cur as Section)
    } else if (cur) {
      const kv = line.match(/^(\w+)\s*=\s*(.*)$/)
      if (kv && ['host', 'share', 'user', 'pass'].includes(kv[1])) (cur as Record<string, string>)[kv[1]] = kv[2]
    }
  }
  return out.filter((s) => s.host && s.share)
}

async function writeConfig(sections: Section[]): Promise<void> {
  await mkdir(join(homedir(), '.config', 'steamtv'), { recursive: true })
  const text = sections.map((s) => `[${s.name}]\ntype = smb\nhost = ${s.host}\nuser = ${s.user}\npass = ${s.pass}\nshare = ${s.share}\n`).join('\n')
  await writeFile(CONFIG, text, { mode: 0o600 })
  await chmod(CONFIG, 0o600)
}

/** Whether something's mounted at this folder. */
async function mounted(dir: string): Promise<boolean> {
  const mounts = await readFile('/proc/mounts', 'utf8').catch(() => '')
  return mounts.split('\n').some((l) => l.split(' ')[1] === dir.replace(/ /g, '\\040'))
}

/** A share mounted at ~/Network/<name>, read-only, in the background (rclone stays running). */
async function mount(section: Section, log: Log): Promise<void> {
  const dir = join(NETWORK_DIR, section.name)
  if (await mounted(dir)) return
  await mkdir(dir, { recursive: true })
  const r = await run(
    ['mount', `${section.name}:${section.share}`, dir, '--config', CONFIG, '--read-only', '--daemon', '--daemon-wait', '15s', '--dir-cache-time', '10m', '--vfs-read-chunk-size', '16M', '--buffer-size', '32M'],
    { timeoutMs: 30_000 }
  )
  if (r.code !== 0) throw new Error(why(r.err))
  log(`shares: mounted ${section.name}`)
}

/** Its folder's name: "LargeBox-Music", another of the same name "LargeBox-Music-2". */
function folderName(host: string, share: string, taken: string[]): string {
  const base = `${host}-${share}`.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'Share'
  let name = base
  for (let n = 2; taken.includes(name) || existsSync(join(NETWORK_DIR, name)); n++) name = `${base}-${n}`
  return name
}

/** A share signed in to and mounted (tried first, so a wrong password isn't kept); its folder's name. */
export async function addShare(s: ShareSignIn & { share: string }, log: Log): Promise<string> {
  await ensureRclone(log)
  const test = await run(['lsd', `probe:${s.share}`, '--max-depth', '1'], { env: await probeEnv(s), timeoutMs: PROBE_MS })
  if (test.code !== 0) throw new Error(why(test.err))
  const sections = await readConfig()
  const section: Section = { name: folderName(s.host, s.share, sections.map((x) => x.name)), host: s.host, share: s.share, user: s.user, pass: await obscure(s.password) }
  await writeConfig([...sections, section])
  await mount(section, log)
  return section.name
}

/** A share unmounted and forgotten. */
export async function removeShare(name: string, log: Log): Promise<void> {
  const dir = join(NETWORK_DIR, name)
  if (await mounted(dir)) await new Promise<void>((done) => spawn('fusermount3', ['-u', dir]).on('close', () => done()).on('error', () => done()))
  // Its (now empty) mount folder.
  await rmdir(dir).catch(() => {})
  await writeConfig((await readConfig()).filter((s) => s.name !== name))
  log(`shares: removed ${name}`)
}

/** The shares signed in to from vaporTV, and whether each is mounted now. */
export async function listShares(): Promise<SavedShare[]> {
  return Promise.all((await readConfig()).map(async (s) => ({ name: s.name, host: s.host, share: s.share, user: s.user, mounted: await mounted(join(NETWORK_DIR, s.name)) })))
}

/** vaporTV starting: every share signed in to mounted again (one that can't be is logged and left). */
export async function mountShares(log: Log): Promise<void> {
  const sections = await readConfig()
  if (!sections.length || !existsSync(BIN)) return
  for (const s of sections) await mount(s, log).catch((e: unknown) => log(`shares: ${s.name}: ${String(e)}`))
}
