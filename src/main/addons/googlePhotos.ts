// Google Photos add-on for the screensaver. Off unless config.json has
// googlePhotos.clientId and clientSecret (your own Google Cloud "Desktop app" OAuth
// client with the Photos Picker API enabled), so builds for other people don't
// carry it switched on.
//
// Google stopped letting apps read albums in March 2025. This uses the Picker API
// instead: vaporTV shows a QR code, you choose photos in Google Photos on your
// phone, and vaporTV keeps copies for the screensaver. Choosing again adds more.

import { spawn, type ChildProcess } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'
import QRCode from 'qrcode'
import type { GooglePhotosProgress, GooglePhotosStatus } from '../../shared/types'
import { loadConfig, saveConfig, type Config } from '../config'
import { ADDON_PHOTOS } from '../screensaver'

const PHOTOS_SCOPE = 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly'
/** For the Drive folder sync (googleDrive.ts); one sign-in covers both. */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly'
const PICKER = 'https://photospicker.googleapis.com/v1'
/** Photos are downloaded no bigger than the TV. */
const SIZE = '=w3840-h2160'
const FOLDER = join(ADDON_PHOTOS, 'google-photos')
/** Sign-in gets its own Chrome profile, so a running streaming app's Chrome doesn't take the window. */
const SIGN_IN_PROFILE = join(homedir(), '.local', 'share', 'steamtv', 'google-sign-in')
const SIGN_IN_TIMEOUT = 10 * 60 * 1000
const DOWNLOADS_AT_ONCE = 4

export type Client = NonNullable<Config['googlePhotos']>

/** Whether the saved sign-in includes a permission (sign-ins from before Drive don't). */
export function hasScope(config: Config, scope: string): boolean {
  return !!config.googlePhotos?.refreshToken && (config.googlePhotos.scopes ?? PHOTOS_SCOPE).split(' ').includes(scope)
}

export function googlePhotosEnabled(config: Config): boolean {
  return !!config.googlePhotos?.clientId && !!config.googlePhotos.clientSecret
}

export async function googlePhotosStatus(config: Config): Promise<GooglePhotosStatus> {
  const files = await readdir(FOLDER).catch(() => [])
  return {
    enabled: googlePhotosEnabled(config),
    signedIn: !!config.googlePhotos?.refreshToken,
    driveAllowed: hasScope(config, DRIVE_SCOPE),
    photoCount: files.filter((f) => !f.startsWith('.')).length
  }
}

/**
 * Opens a URL in a Chrome window on the TV. Google refuses to sign in inside other
 * apps' web views, vaporTV's included. Started by vaporTV, the window counts as
 * vaporTV's in Gaming Mode, so it shows on top.
 */
function openBrowser(url: string): ChildProcess {
  const args = ['run', 'com.google.Chrome', `--user-data-dir=${SIGN_IN_PROFILE}`, '--no-first-run', '--no-default-browser-check']
  return spawn('flatpak', [...args, `--app=${url}`, '--start-fullscreen'], { stdio: 'ignore' })
}

/**
 * Closes the sign-in window. Stopping `flatpak run` leaves Chrome itself running,
 * so everything using the sign-in profile is stopped, then killed if it lingers.
 */
function closeBrowser(): void {
  const pattern = `user-data-dir=${SIGN_IN_PROFILE}`
  spawn('pkill', ['-f', pattern], { stdio: 'ignore' }).on('error', () => {})
  setTimeout(() => spawn('pkill', ['-9', '-f', pattern], { stdio: 'ignore' }).on('error', () => {}), 3000)
}

async function tokenRequest(
  params: Record<string, string>
): Promise<{ access_token?: string; refresh_token?: string; scope?: string } | null> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(15000)
  }).catch(() => null)
  return res?.ok ? res.json() : null
}

/**
 * Google sign-in. Google sends the browser back to a one-off local address with a
 * code, which is traded for a refresh token kept in config.json.
 */
export async function signIn(): Promise<boolean> {
  const config = await loadConfig()
  const client = config.googlePhotos
  if (!client?.clientId || !client.clientSecret) return false

  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const state = randomBytes(16).toString('base64url')

  let redirectUri = ''
  const code = await new Promise<string | null>((resolve) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      // Browsers also ask for /favicon.ico; only the redirect carries a state.
      if (!url.searchParams.has('state')) return void res.writeHead(404).end()
      const ok = url.searchParams.get('state') === state && url.searchParams.has('code')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(
        `<body style="margin:0;height:100vh;display:grid;place-items:center;background:#0b070d;color:#fff;font:32px sans-serif">` +
          `${ok ? 'Signed in. Back to vaporTV…' : 'Sign-in didn’t finish. Try again from vaporTV.'}</body>`
      )
      finish(ok ? url.searchParams.get('code') : null)
    })
    const timer = setTimeout(() => finish(null), SIGN_IN_TIMEOUT)
    const finish = (result: string | null): void => {
      clearTimeout(timer)
      server.close()
      resolve(result)
    }
    server.listen(0, '127.0.0.1', () => {
      redirectUri = `http://127.0.0.1:${(server.address() as { port: number }).port}`
      const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      auth.search = new URLSearchParams({
        client_id: client.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: [PHOTOS_SCOPE, DRIVE_SCOPE].join(' '),
        access_type: 'offline',
        prompt: 'consent',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state
      }).toString()
      const browser = openBrowser(auth.toString())
      browser.on('error', () => finish(null))
      browser.on('exit', () => finish(null))
    })
  })
  // Leave "Signed in" up a moment, then close the window.
  setTimeout(closeBrowser, 1500)
  if (!code) return false

  const tokens = await tokenRequest({
    client_id: client.clientId,
    client_secret: client.clientSecret,
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  })
  if (!tokens?.refresh_token) return false
  // Google may grant fewer permissions than asked for (each can be unticked on its consent screen).
  await saveConfig({ googlePhotos: { ...client, refreshToken: tokens.refresh_token, scopes: tokens.scope } })
  return true
}

export async function signOut(): Promise<void> {
  const client = (await loadConfig()).googlePhotos
  if (!client) return
  if (client.refreshToken) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(client.refreshToken)}`, { method: 'POST' }).catch(() => {})
  }
  await saveConfig({ googlePhotos: { clientId: client.clientId, clientSecret: client.clientSecret } })
}

export async function accessToken(client: Client): Promise<string> {
  if (!client.refreshToken) throw new Error('Not signed in to Google')
  const tokens = await tokenRequest({
    client_id: client.clientId,
    client_secret: client.clientSecret,
    refresh_token: client.refreshToken,
    grant_type: 'refresh_token'
  })
  if (!tokens?.access_token) throw new Error('Google sign-in has expired; sign in again')
  return tokens.access_token
}

async function picker<T>(token: string, path: string, method = 'GET'): Promise<T> {
  const res = await fetch(`${PICKER}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000)
  })
  if (!res.ok) throw new Error(`Google Photos: HTTP ${res.status}`)
  return method === 'DELETE' ? (undefined as T) : res.json()
}

interface Session {
  id: string
  pickerUri: string
  mediaItemsSet?: boolean
  pollingConfig?: { pollInterval?: string; timeoutIn?: string }
}

interface PickedItem {
  id: string
  type?: string
  mediaFile?: { baseUrl: string; mimeType?: string }
}

/** "3.5s" -> 3500 */
const durationMs = (value: string | undefined, fallback: number): number => {
  const seconds = parseFloat(value ?? '')
  return Number.isFinite(seconds) ? seconds * 1000 : fallback
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

let current: { cancelled: boolean } | null = null

export function cancelPick(): void {
  if (current) current.cancelled = true
}

/**
 * Starts choosing photos: returns a QR code for the phone, then reports progress
 * (waiting, downloading, done or failed) through `report` until it finishes.
 */
export async function startPick(report: (progress: GooglePhotosProgress) => void): Promise<{ qr: string; url: string }> {
  cancelPick()
  const run = { cancelled: false }
  current = run
  const client = (await loadConfig()).googlePhotos
  if (!client) throw new Error('Google Photos add-on is not set up')
  const session = await picker<Session>(await accessToken(client), '/sessions', 'POST')
  const qr = await QRCode.toDataURL(session.pickerUri, { margin: 1, width: 480, color: { dark: '#000000', light: '#ffffff' } })

  void (async () => {
    try {
      // Wait for the phone: Google says how often to ask, and for how long.
      let state: Session = session
      const deadline = Date.now() + durationMs(session.pollingConfig?.timeoutIn, 20 * 60 * 1000)
      while (!state.mediaItemsSet) {
        if (run.cancelled) return
        if (Date.now() > deadline) throw new Error('Timed out waiting for a choice')
        await sleep(durationMs(state.pollingConfig?.pollInterval, 5000))
        if (run.cancelled) return
        state = await picker<Session>(await accessToken(client), `/sessions/${session.id}`)
      }

      // Choosing can take a while; start the downloads with a fresh token.
      const token = await accessToken(client)
      const items: PickedItem[] = []
      let pageToken = ''
      do {
        const page = await picker<{ mediaItems?: PickedItem[]; nextPageToken?: string }>(
          token,
          `/mediaItems?sessionId=${session.id}&pageSize=100${pageToken ? `&pageToken=${pageToken}` : ''}`
        )
        items.push(...(page.mediaItems ?? []))
        pageToken = page.nextPageToken ?? ''
      } while (pageToken)

      // Photos only; the screensaver doesn't play videos.
      const photos = items.filter((item) => item.type !== 'VIDEO' && item.mediaFile?.baseUrl)
      await mkdir(FOLDER, { recursive: true })
      let done = 0
      report({ state: 'downloading', done, total: photos.length })
      const queue = [...photos]
      const worker = async (): Promise<void> => {
        for (let item = queue.shift(); item && !run.cancelled; item = queue.shift()) {
          const res = await fetch(`${item.mediaFile!.baseUrl}${SIZE}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(60000)
          }).catch(() => null)
          if (res?.ok) {
            const type = res.headers.get('content-type') ?? ''
            const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : type.includes('gif') ? 'gif' : 'jpg'
            const name = item.id.replace(/[^A-Za-z0-9_-]/g, '_')
            await writeFile(join(FOLDER, `${name}.${ext}`), Buffer.from(await res.arrayBuffer()))
          }
          report({ state: 'downloading', done: ++done, total: photos.length })
        }
      }
      await Promise.all(Array.from({ length: DOWNLOADS_AT_ONCE }, worker))
      await picker(token, `/sessions/${session.id}`, 'DELETE').catch(() => {})
      if (!run.cancelled) report({ state: 'done', done, total: photos.length })
    } catch (err) {
      if (!run.cancelled) report({ state: 'failed', done: 0, total: 0, error: err instanceof Error ? err.message : String(err) })
    }
  })()

  return { qr, url: session.pickerUri }
}

/** Deletes every photo saved from Google Photos. */
export async function clearPhotos(): Promise<void> {
  await rm(FOLDER, { recursive: true, force: true })
}
