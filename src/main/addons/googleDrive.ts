// Google Drive folder sync for the screensaver (part of the Google add-on). vaporTV
// mirrors one Drive folder and its subfolders into the screensaver: new photos are
// downloaded, changed ones replaced, and ones removed from Drive deleted here too.
// The folder is one named DEFAULT_FOLDER unless another is chosen in Settings.

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DriveFolder, GoogleDriveStatus } from '../../shared/types'
import { loadConfig, saveConfig, type Config } from '../config'
import { ADDON_PHOTOS } from '../screensaver'
import { accessToken, DRIVE_SCOPE, hasScope } from './googlePhotos'

const API = 'https://www.googleapis.com/drive/v3'
export const DEFAULT_FOLDER = 'vaporTV Screensaver'
const FOLDER_TYPE = 'application/vnd.google-apps.folder'
const LOCAL = join(ADDON_PHOTOS, 'google-drive')
const INDEX = join(LOCAL, '.index.json')
const SYNC_EVERY = 15 * 60 * 1000
/** Albums are subfolders; look this many levels down. */
const MAX_DEPTH = 3
const DOWNLOADS_AT_ONCE = 3
/** Drive serves a resized copy at up to this size, so originals never need downloading. */
const TV_SIZE = 3840
// What the screensaver can show when Drive has no resized copy to offer.
const SHOWABLE = /^image\/(jpeg|png|webp|gif|avif)$/

interface DriveFile {
  id: string
  name: string
  parents?: string[]
  mimeType: string
  md5Checksum?: string
  modifiedTime?: string
  thumbnailLink?: string
}

/** What's downloaded: Drive file id -> local file name and the version it came from. */
type Index = Record<string, { file: string; version: string }>

let syncing = false
let lastSync: number | null = null
let lastError: string | null = null
let lastFolder: { name: string; found: boolean } | null = null

async function drive<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) })
  if (!res.ok) throw new Error(`Google Drive: HTTP ${res.status}`)
  return res.json()
}

/** Every page of a files.list query (or just the first `limit` results, with `orderBy`). */
async function list(
  token: string,
  q: string,
  fields = 'id,name,mimeType,md5Checksum,modifiedTime,thumbnailLink',
  first?: { limit: number; orderBy: string }
): Promise<DriveFile[]> {
  const files: DriveFile[] = []
  let pageToken = ''
  do {
    const params = new URLSearchParams({ q, fields: `nextPageToken,files(${fields})`, pageSize: String(first?.limit ?? 1000) })
    if (first) params.set('orderBy', first.orderBy)
    if (pageToken) params.set('pageToken', pageToken)
    const page = await drive<{ files?: DriveFile[]; nextPageToken?: string }>(token, `/files?${params}`)
    files.push(...(page.files ?? []))
    pageToken = first ? '' : (page.nextPageToken ?? '')
  } while (pageToken)
  return files
}

/** How many recently changed folders the chooser offers, besides top-level and shared ones. */
const RECENT_FOLDERS = 25

const quote = (s: string): string => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

/**
 * The folder to mirror: the one chosen in Settings (by id), else the one with the
 * configured name (DEFAULT_FOLDER unless set). Null if there's none.
 */
async function resolveFolder(token: string, config: Config): Promise<{ id: string; name: string } | null> {
  const chosen = config.googleDrive
  if (chosen?.folderId) return { id: chosen.folderId, name: chosen.folderName ?? 'Chosen folder' }
  const name = chosen?.folderName ?? DEFAULT_FOLDER
  const found = await list(token, `mimeType='${FOLDER_TYPE}' and name=${quote(name)} and trashed=false`, 'id,name,parents')
  // A folder can hold one of the same name (an export folder inside itself): take the outermost.
  const ids = new Set(found.map((f) => f.id))
  const outer = found.find((f) => !f.parents?.some((p) => ids.has(p))) ?? found[0]
  return outer ? { id: outer.id, name: outer.name } : null
}

/** Images in a folder and its subfolders. */
async function photosIn(token: string, folderId: string, depth = 0): Promise<DriveFile[]> {
  const children = await list(token, `${quote(folderId)} in parents and trashed=false`)
  const photos = children.filter((f) => f.mimeType.startsWith('image/'))
  if (depth < MAX_DEPTH) {
    for (const sub of children.filter((f) => f.mimeType === FOLDER_TYPE)) photos.push(...(await photosIn(token, sub.id, depth + 1)))
  }
  return photos
}

/**
 * A photo at TV size: Drive's resized copy where it has one (also turns iPhone HEIC
 * into JPEG), else the original if the screensaver can show it.
 */
async function download(token: string, file: DriveFile): Promise<{ data: Buffer; ext: string } | null> {
  const auth = { Authorization: `Bearer ${token}` }
  if (file.thumbnailLink) {
    const url = file.thumbnailLink.replace(/=s\d+$/, `=s${TV_SIZE}`)
    const res = await fetch(url, { headers: auth, signal: AbortSignal.timeout(60000) }).catch(() => null)
    const type = res?.headers.get('content-type') ?? ''
    if (res?.ok && type.startsWith('image/')) return { data: Buffer.from(await res.arrayBuffer()), ext: type.includes('png') ? 'png' : 'jpg' }
  }
  if (!SHOWABLE.test(file.mimeType)) return null
  const res = await fetch(`${API}/files/${file.id}?alt=media`, { headers: auth, signal: AbortSignal.timeout(120000) }).catch(() => null)
  if (!res?.ok) return null
  return { data: Buffer.from(await res.arrayBuffer()), ext: file.mimeType.split('/')[1].replace('jpeg', 'jpg') }
}

async function readIndex(): Promise<Index> {
  return JSON.parse(await readFile(INDEX, 'utf8').catch(() => '{}'))
}

async function writeIndex(index: Index): Promise<void> {
  await writeFile(`${INDEX}.tmp`, JSON.stringify(index))
  await rename(`${INDEX}.tmp`, INDEX)
}

/** Brings the local copy in line with the Drive folder. Safe to call any time; overlapping calls are skipped. */
export async function syncDrive(): Promise<void> {
  if (syncing) return
  const config = await loadConfig()
  const client = config.googlePhotos
  if (!client || !hasScope(config, DRIVE_SCOPE)) return
  syncing = true
  try {
    const token = await accessToken(client)
    const folder = await resolveFolder(token, config)
    lastFolder = { name: folder?.name ?? DEFAULT_FOLDER, found: !!folder }
    if (!folder) {
      lastError = null
      return
    }
    const remote = await photosIn(token, folder.id)
    await mkdir(LOCAL, { recursive: true })
    const index = await readIndex()
    const version = (f: DriveFile): string => f.md5Checksum ?? f.modifiedTime ?? ''

    // Gone from Drive (or moved out of the folder): gone from the screensaver.
    const keep = new Set(remote.map((f) => f.id))
    for (const [id, entry] of Object.entries(index)) {
      if (keep.has(id)) continue
      await rm(join(LOCAL, entry.file), { force: true })
      delete index[id]
    }

    const queue = remote.filter((f) => index[f.id]?.version !== version(f))
    const worker = async (): Promise<void> => {
      for (let file = queue.shift(); file; file = queue.shift()) {
        const got = await download(token, file)
        if (!got) continue
        const name = `${file.id.replace(/[^A-Za-z0-9_-]/g, '_')}.${got.ext}`
        await writeFile(join(LOCAL, name), got.data)
        const old = index[file.id]?.file
        if (old && old !== name) await rm(join(LOCAL, old), { force: true })
        index[file.id] = { file: name, version: version(file) }
      }
    }
    await Promise.all(Array.from({ length: DOWNLOADS_AT_ONCE }, worker))
    await writeIndex(index)
    lastSync = Date.now()
    lastError = null
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err)
  } finally {
    syncing = false
  }
}

/** Syncs shortly after start, then every SYNC_EVERY. */
export function startDriveSync(): void {
  setTimeout(() => void syncDrive(), 60 * 1000)
  setInterval(() => void syncDrive(), SYNC_EVERY)
}

export async function driveStatus(): Promise<GoogleDriveStatus> {
  const config = await loadConfig()
  const index = await readIndex()
  return {
    folderName: config.googleDrive?.folderName ?? lastFolder?.name ?? DEFAULT_FOLDER,
    found: lastFolder?.found ?? null,
    photoCount: Object.keys(index).length,
    lastSync,
    syncing,
    error: lastError
  }
}

/**
 * Folders to choose from: those at the top of My Drive, ones shared with you, and the
 * most recently changed ones. That last group is how folders backed up from a PC by
 * Google Drive for desktop show up (they live under Computers, not My Drive).
 */
export async function driveFolders(): Promise<DriveFolder[]> {
  const config = await loadConfig()
  if (!config.googlePhotos) return []
  const token = await accessToken(config.googlePhotos)
  const q = `mimeType='${FOLDER_TYPE}' and trashed=false`
  const [recent, mine, shared] = await Promise.all([
    list(token, `${q} and 'me' in owners`, 'id,name', { limit: RECENT_FOLDERS, orderBy: 'modifiedTime desc' }),
    list(token, `${q} and 'root' in parents`, 'id,name'),
    list(token, `${q} and sharedWithMe=true`, 'id,name')
  ])
  const byName = (a: DriveFolder, b: DriveFolder): number => a.name.localeCompare(b.name)
  const seen = new Set<string>()
  const once = (folders: DriveFolder[]): DriveFolder[] => folders.filter((f) => !seen.has(f.id) && seen.add(f.id))
  // Recent first (newest first), then the rest by name.
  return [
    ...once(recent.map((f) => ({ id: f.id, name: f.name, where: 'recent' as const }))),
    ...once(mine.map((f) => ({ id: f.id, name: f.name, where: 'mine' as const })).sort(byName)),
    ...once(shared.map((f) => ({ id: f.id, name: f.name, where: 'shared' as const })).sort(byName))
  ]
}

/** After signing out: the folder's photos leave the screensaver, and its status is forgotten. */
export async function forgetDrive(): Promise<void> {
  while (syncing) await new Promise((resolve) => setTimeout(resolve, 500))
  await rm(LOCAL, { recursive: true, force: true })
  lastSync = null
  lastError = null
  lastFolder = null
}

/** Uses another folder (or, with null, the default one again) and syncs it now. */
export async function chooseDriveFolder(folder: DriveFolder | null): Promise<void> {
  while (syncing) await new Promise((resolve) => setTimeout(resolve, 500))
  await saveConfig({ googleDrive: folder ? { folderId: folder.id, folderName: folder.name } : {} })
  // The old folder's photos go; the new folder's come down fresh.
  await rm(LOCAL, { recursive: true, force: true })
  lastFolder = null
  await syncDrive()
}
