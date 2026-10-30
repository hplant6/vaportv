import { spawn } from 'node:child_process'
import { createHash, createPublicKey, verify, type KeyObject } from 'node:crypto'
import { createWriteStream, existsSync } from 'node:fs'
import { chmod, open, readFile, rename, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'
import { EXTRAS } from '../shared/build'
import type { UpdateInfo } from '../shared/types'
import type { Config } from './config'

// Updates from GitHub Releases. Each release carries vaporTV.AppImage and its notes (its
// section of CHANGELOG.md, put there by scripts/release.sh). A newer one is downloaded
// beside the running AppImage, checked, swapped in, and vaporTV restarted through Steam.
// Off in builds with the author's extras: a public release would replace them. The
// config's `updateFeed` (a releases JSON, as GitHub's API gives) turns it on for testing.
//
// Each release is signed: vaporTV.AppImage.sig, an Ed25519 signature of the AppImage's
// SHA-256, made by scripts/release.sh with the key in ~/.config/vaportv/update-key.pem.
// Only a download signed with that key is installed, so a release put up by anyone else
// (a stolen GitHub login, say) is never offered, and a changed download never swapped in.

const RELEASES = 'https://api.github.com/repos/hplant6/vaportv/releases?per_page=30'
const ASSET = 'vaporTV.AppImage'
const SIGNATURE = `${ASSET}.sig`
/** update-key.pem's public half (SPKI, base64). scripts/sign-update.mjs checks its key against this. */
const UPDATE_KEY = createPublicKey({
  key: Buffer.from('MCowBQYDK2VwAyEADcHVJHURlakW7Eri92D0pabenNmImFqMuxRasXjDMVU=', 'base64'),
  format: 'der',
  type: 'spki'
})
const SERVICE = join(homedir(), '.config', 'systemd', 'user', 'steamtv-autostart.service')
const SHORTCUT_ENV = join(homedir(), '.config', 'steamtv', 'steam-shortcut.env')

interface Release {
  tag_name: string
  name?: string
  body?: string
  published_at?: string
  draft?: boolean
  prerelease?: boolean
  assets: { name: string; browser_download_url: string; size: number; digest?: string | null }[]
}

/** "v1.2.0" or "1.2" as numbers, for comparing; null if it isn't a plain version. */
function parts(version: string): number[] | null {
  const m = /^v?(\d+(?:\.\d+)*)$/.exec(version.trim())
  return m ? m[1].split('.').map(Number) : null
}

export function newer(a: string, b: string): boolean {
  const x = parts(a)
  const y = parts(b)
  if (!x || !y) return false
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0)
  }
  return false
}

/** Whether `signature` (base64, as in a .sig) is `key`'s signature of `digest`. */
export function signedBy(digest: Buffer, signature: string, key: KeyObject = UPDATE_KEY): boolean {
  try {
    return verify(null, digest, key, Buffer.from(signature.trim(), 'base64'))
  } catch {
    return false
  }
}

/** Whether this copy can update itself: a public AppImage, or a test feed. */
export function canUpdate(config: Config): boolean {
  return !!process.env.APPIMAGE && (!EXTRAS || !!config.updateFeed)
}

async function releases(config: Config): Promise<Release[]> {
  const feed = config.updateFeed
  if (feed && !/^https?:/.test(feed)) return JSON.parse(await readFile(feed, 'utf8')) as Release[]
  const res = await fetch(feed ?? RELEASES, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'vaporTV' },
    signal: AbortSignal.timeout(15_000)
  })
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
  return (await res.json()) as Release[]
}

/** The newest release past this version, with the notes of every release since, newest first; null if up to date. */
export async function checkForUpdate(config: Config): Promise<UpdateInfo | null> {
  const current = app.getVersion()
  const later = (await releases(config))
    // Unsigned releases (all before signing began, so all older than this copy) are never offered.
    .filter(
      (r) =>
        !r.draft &&
        !r.prerelease &&
        newer(r.tag_name, current) &&
        r.assets.some((a) => a.name === ASSET) &&
        r.assets.some((a) => a.name === SIGNATURE)
    )
    .sort((a, b) => (newer(a.tag_name, b.tag_name) ? -1 : 1))
  if (!later.length) return null
  const asset = later[0].assets.find((a) => a.name === ASSET)!
  return {
    current,
    version: later[0].tag_name.replace(/^v/, ''),
    size: asset.size,
    notes: later.map((r) => ({ version: r.tag_name.replace(/^v/, ''), date: r.published_at ?? null, body: r.body ?? '' }))
  }
}

/** Downloads `info`'s AppImage over the running one, reporting whole percents. */
export async function installUpdate(config: Config, info: UpdateInfo, progress: (percent: number) => void): Promise<void> {
  const target = process.env.APPIMAGE
  if (!target) throw new Error('vaporTV is not running from its AppImage')
  const release = (await releases(config)).find((r) => r.tag_name.replace(/^v/, '') === info.version)
  const asset = release?.assets.find((a) => a.name === ASSET)
  const signatureAsset = release?.assets.find((a) => a.name === SIGNATURE)
  if (!asset) throw new Error(`Release ${info.version} has no ${ASSET}`)
  if (!signatureAsset) throw new Error(`Release ${info.version} isn't signed`)
  const signed = await fetch(signatureAsset.browser_download_url, { headers: { 'User-Agent': 'vaporTV' } })
  if (!signed.ok) throw new Error(`Download failed (${signed.status})`)
  const signature = await signed.text()

  // Beside the running copy (same disk, so the swap is a rename); the running one stays
  // readable until it exits, as Linux keeps a replaced file for whoever has it open.
  const partial = `${target}.download`
  const res = await fetch(asset.browser_download_url, { headers: { 'User-Agent': 'vaporTV' } })
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`)
  const hash = createHash('sha256')
  const file = createWriteStream(partial)
  let received = 0
  let shown = -1
  try {
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      hash.update(chunk)
      if (!file.write(chunk)) await new Promise((resolve) => file.once('drain', resolve))
      received += chunk.length
      const percent = Math.floor((received / asset.size) * 100)
      if (percent !== shown) progress((shown = percent))
    }
    await new Promise<void>((resolve, reject) => {
      file.once('error', reject)
      file.end(resolve)
    })
    if (received !== asset.size) throw new Error('The download was cut short')
    const sum = hash.digest()
    const digest = asset.digest?.replace(/^sha256:/, '')
    if (digest && digest !== sum.toString('hex')) throw new Error("The download doesn't match the release")
    if (!signedBy(sum, signature)) throw new Error("The download isn't signed by vaporTV; not installing it")
    // An AppImage is an ELF program.
    const head = Buffer.alloc(4)
    const fd = await open(partial)
    await fd.read(head, 0, 4, 0)
    await fd.close()
    if (head.toString('hex') !== '7f454c46') throw new Error('The download is not an AppImage')
    await chmod(partial, 0o755)
    await rename(partial, target)
  } catch (err) {
    file.destroy()
    await rm(partial, { force: true })
    throw err
  }
}

/** Quits, and has vaporTV opened again from Steam a few seconds later (as a deploy does). */
export async function restartAfterUpdate(): Promise<void> {
  // Through systemd, so nothing of this process is left for Steam to wait on.
  let command: string[]
  if (existsSync(SERVICE)) command = ['systemctl', '--user', 'start', 'steamtv-autostart.service']
  else {
    const env = await readFile(SHORTCUT_ENV, 'utf8').catch(() => '')
    const gameId = /^STEAMTV_GAME_ID=(\d+)/m.exec(env)?.[1] ?? process.env.SteamGameId
    if (!gameId) return app.quit()
    command = ['steam', `steam://rungameid/${gameId}`]
  }
  spawn('systemd-run', ['--user', '--on-active=4', ...command], { detached: true, stdio: 'ignore' }).unref()
  setTimeout(() => app.quit(), 300)
}
