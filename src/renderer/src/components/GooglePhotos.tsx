import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { DriveFolder, GoogleDriveStatus, GooglePhotosProgress, GooglePhotosStatus } from '../../../shared/types'
import { focus, TRAP_CLOSE_EVENT } from '../input/focus'
import { toast } from './Toast'

function ActionRow({ label, detail, onSelect }: { label: string; detail?: string; onSelect: () => void }) {
  return (
    <button className="setting-row" tabIndex={-1} aria-label={label} data-focusable="" data-select-sound="move" onClick={onSelect}>
      <span className="setting-name display">{label}</span>
      {detail && <span className="setting-detail">{detail}</span>}
    </button>
  )
}

const DRIVE_POLL_MS = 3000

const FOLDER_WHERE: Record<DriveFolder['where'], string> = {
  recent: 'Recently updated',
  mine: 'My Drive',
  shared: 'Shared with you'
}

/**
 * Dialogs render over the whole stage: inside Settings' scrolling pane, the pane's
 * scroll transform would position and clip them.
 */
function OverStage({ children }: { children: ReactNode }) {
  return createPortal(children, document.querySelector('.stage') ?? document.body)
}

/** An IPC error's own message, without Electron's "Error invoking remote method …" wrapper. */
function errorText(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

/** "just now", "5 min ago", "2 h ago" */
function ago(ms: number): string {
  const minutes = Math.round((Date.now() - ms) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  return `${Math.round(minutes / 60)} h ago`
}

function driveDetail(drive: GoogleDriveStatus): string {
  if (drive.syncing) return 'Syncing…'
  if (drive.error) return `Couldn't sync: ${drive.error}`
  if (drive.found === false) return `No folder named “${drive.folderName}” in your Drive yet`
  const count = `${drive.photoCount} photo${drive.photoCount === 1 ? '' : 's'}`
  return drive.lastSync ? `${count} · synced ${ago(drive.lastSync)}` : `${count} · not synced yet`
}

/**
 * Google add-on settings: a Drive folder kept in sync with the screensaver, and photos
 * picked from Google Photos. Nothing at all unless the add-on is set up in config.json.
 */
export function GooglePhotosSettings() {
  const [status, setStatus] = useState<GooglePhotosStatus | null>(null)
  const [signingIn, setSigningIn] = useState(false)
  const [picking, setPicking] = useState(false)
  const [choosingFolder, setChoosingFolder] = useState(false)
  // The row that opened a dialog, to put the cursor back on when it closes.
  const opener = useRef<HTMLElement | null>(null)
  const open = (show: (on: boolean) => void): void => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    show(true)
  }
  const closed = (): void => {
    if (opener.current?.isConnected) focus(opener.current)
  }
  const [drive, setDrive] = useState<GoogleDriveStatus | null>(null)

  const refresh = (): void => {
    window.steamtv.googlePhotos.status().then(setStatus)
  }
  useEffect(refresh, [])

  // Sync runs in the background (every 15 minutes); keep its line up to date while this is open.
  const driveOn = !!status?.driveAllowed
  useEffect(() => {
    if (!driveOn) return
    const load = (): void => {
      window.steamtv.googleDrive.status().then(setDrive)
    }
    load()
    const timer = setInterval(load, DRIVE_POLL_MS)
    return () => clearInterval(timer)
  }, [driveOn])

  if (!status?.enabled) return null

  const signIn = (): void => {
    if (signingIn) return
    setSigningIn(true)
    window.steamtv.googlePhotos.signIn().then((ok) => {
      setSigningIn(false)
      toast(ok ? 'Signed in to Google' : "Didn't sign in to Google")
      refresh()
    })
  }

  return (
    <>
      <div className="settings-group">
        <h3 className="settings-heading display">Google Drive</h3>
        <p className="settings-help">
          Add-on: the photos in a Drive folder, and its subfolders, join the screensaver and stay in sync. Add or remove
          photos in Drive and the TV follows within 15 minutes.
        </p>
        <div className="setting-list" data-focus-memory="settings-google-drive">
          {!status.signedIn || !status.driveAllowed ? (
            <ActionRow
              label={status.signedIn ? 'Allow Google Drive' : 'Sign in to Google'}
              detail={
                signingIn
                  ? 'Finish signing in on screen…'
                  : status.signedIn
                    ? 'Sign in again to add Drive access'
                    : 'Opens Google sign-in on the TV'
              }
              onSelect={signIn}
            />
          ) : (
            <>
              <ActionRow label="Drive folder" detail={drive?.folderName ?? '…'} onSelect={() => open(setChoosingFolder)} />
              <ActionRow
                label="Sync now"
                detail={drive ? driveDetail(drive) : '…'}
                onSelect={() => window.steamtv.googleDrive.syncNow()}
              />
            </>
          )}
        </div>
      </div>

      <div className="settings-group">
        <h3 className="settings-heading display">Google Photos</h3>
        <p className="settings-help">
          Pick photos from Google Photos on your phone to add them once. Google doesn't let apps follow albums, so pick again
          for more, or use the Drive folder above.
        </p>
        <div className="setting-list" data-focus-memory="settings-google-photos">
          {!status.signedIn ? (
            <ActionRow label="Sign in to Google" detail="Same sign-in as Drive" onSelect={signIn} />
          ) : (
            <>
              <ActionRow label="Choose photos" detail={`${status.photoCount} saved · uses your phone`} onSelect={() => open(setPicking)} />
              {status.photoCount > 0 && (
                <ActionRow
                  label="Remove saved photos"
                  detail="From the screensaver"
                  onSelect={() => window.steamtv.googlePhotos.clear().then(refresh)}
                />
              )}
              <ActionRow label="Sign out" detail="Drive and Photos" onSelect={() => window.steamtv.googlePhotos.signOut().then(refresh)} />
            </>
          )}
        </div>
      </div>

      {picking && (
        <PhotoPicker
          onClose={() => {
            setPicking(false)
            refresh()
            closed()
          }}
        />
      )}
      {choosingFolder && (
        <FolderPicker
          onClose={() => {
            setChoosingFolder(false)
            closed()
          }}
        />
      )}
    </>
  )
}

/** Choose which Drive folder to sync: the default one, or any top-level or shared folder. B closes. */
function FolderPicker({ onClose }: { onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [folders, setFolders] = useState<DriveFolder[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.steamtv.googleDrive
      .folders()
      .then(setFolders)
      .catch((err: unknown) => setError(errorText(err)))
  }, [])

  useEffect(() => {
    const first = panel.current?.querySelector<HTMLElement>('[data-focusable]')
    if (first) focus(first)
    window.addEventListener(TRAP_CLOSE_EVENT, onClose)
    return () => window.removeEventListener(TRAP_CLOSE_EVENT, onClose)
  }, [folders === null])

  const choose = (folder: DriveFolder | null): void => {
    onClose()
    toast(folder ? `Syncing “${folder.name}”…` : 'Syncing “vaporTV Screensaver”…')
    window.steamtv.googleDrive.choose(folder)
  }

  // Keep the focused folder in view, scrolling only the list (not the page around it).
  const reveal = (el: HTMLElement): void => {
    const box = list.current
    if (!box) return
    if (el.offsetTop < box.scrollTop) box.scrollTop = el.offsetTop
    else if (el.offsetTop + el.offsetHeight > box.scrollTop + box.clientHeight) {
      box.scrollTop = el.offsetTop + el.offsetHeight - box.clientHeight
    }
  }

  const row = (key: string, label: string, detail: string, onSelect: () => void) => (
    <button
      key={key}
      className="setting-row"
      tabIndex={-1}
      aria-label={label}
      data-focusable=""
      data-select-sound="move"
      onFocus={(event) => reveal(event.currentTarget)}
      onClick={onSelect}
    >
      <span className="setting-name display">{label}</span>
      <span className="setting-detail">{detail}</span>
    </button>
  )

  return (
    <OverStage>
      <div className="dialog-backdrop">
        <div className="dialog-panel folder-picker" ref={panel} data-focus-trap="">
          <h2 className="section-label display">Drive folder</h2>
          {error && <p className="dialog-message">Couldn't list folders: {error}</p>}
          {!folders && !error && <p className="dialog-message">Loading your folders…</p>}
          <div className="folder-list" ref={list}>
            {row('default', 'vaporTV Screensaver', 'Default · create it in Drive', () => choose(null))}
            {folders?.map((f) => row(f.id, f.name, FOLDER_WHERE[f.where], () => choose(f)))}
          </div>
        </div>
      </div>
    </OverStage>
  )
}

function PhotoPicker({ onClose }: { onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<GooglePhotosProgress | null>(null)
  const waiting = !progress && !error

  useEffect(() => {
    const off = window.steamtv.googlePhotos.onProgress(setProgress)
    window.steamtv.googlePhotos
      .pick()
      .then((result) => ('error' in result ? setError(result.error) : setQr(result.qr)))
      .catch((err: unknown) => setError(errorText(err)))
    return off
  }, [])

  // Closing while still waiting for the phone cancels; once downloading, it finishes in the background.
  const close = (): void => {
    if (waiting) window.steamtv.googlePhotos.cancel()
    onClose()
  }
  useEffect(() => {
    const button = panel.current?.querySelector<HTMLElement>('[data-focusable]')
    if (button) focus(button)
    window.addEventListener(TRAP_CLOSE_EVENT, close)
    return () => window.removeEventListener(TRAP_CLOSE_EVENT, close)
  })

  const message = error
    ? `Couldn't start: ${error}`
    : progress?.state === 'failed'
      ? `Something went wrong: ${progress.error}`
      : progress?.state === 'done'
        ? `Saved ${progress.done} photo${progress.done === 1 ? '' : 's'} for the screensaver.`
        : progress
          ? `Saving photos… ${progress.done} of ${progress.total}`
          : qr
            ? 'Scan with your phone, choose photos in Google Photos, then tap Done.'
            : 'Connecting to Google Photos…'

  return (
    <OverStage>
      <div className="dialog-backdrop">
        <div className="dialog-panel" ref={panel} data-focus-trap="">
          <h2 className="section-label display">Choose photos</h2>
          {qr && waiting && <img className="gphotos-qr" src={qr} alt="QR code for Google Photos" />}
          <p className="dialog-message">{message}</p>
          <button className="dialog-button display" tabIndex={-1} data-focusable="" data-select-sound="move" onClick={close}>
            {waiting ? 'Cancel' : 'Close'}
          </button>
        </div>
      </div>
    </OverStage>
  )
}
