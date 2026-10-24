import { useCallback, useEffect, useRef, useState } from 'react'
import type { BrowseEntry } from '../../../shared/types'
import { DEFAULT_CONTROLS, type Controls } from '../../../shared/controls'
import { focus, OWN_DIRECTION_EVENT, TRAP_CLOSE_EVENT, TRAP_TAB_EVENT, type Direction } from '../input/focus'
import { keepAwake } from '../input/idle'
import { play } from '../input/sounds'
import { ButtonIcon, DpadIcon, useControllerFamily } from './ButtonIcon'
import { errorText } from './GooglePhotos'
import { MUSIC_HOLD_EVENT } from './MusicPreview'

// The Files app (its tile is in Apps): everything in the home folders and on any USB drive or
// SD card, full screen. Places on the left as Settings' categories are; the folder on the
// right, with a look at the file the cursor is on; A on a picture, video or song opens it.

/** AppTile fires this for the Files tile (detail: the tile, to come back to). */
export const FILES_EVENT = 'steamtv:files'

/** Rows L1/R1 jump in the list. */
const PAGE_ROWS = 8
/** Left/right in a video or song. */
const SEEK_S = 10
/** The viewer's bar fades this long after the last press, while something plays. */
const BAR_MS = 3500
/** The preview waits for the cursor to settle, so scrolling a long folder doesn't load every file. */
const PREVIEW_DELAY_MS = 150

const MEDIA_NAME = { image: 'Picture', video: 'Video', audio: 'Song' } as const

function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let n = bytes / 1024
  let i = 0
  for (; n >= 1024 && i < units.length - 1; i++) n /= 1024
  return `${n < 10 ? n.toFixed(1) : Math.round(n)} ${units[i]}`
}

const date = (ms: number): string => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/** "Video", or the extension for what vaporTV can't open ("PDF"), or just "File". */
function typeName(entry: BrowseEntry): string {
  if (entry.media) return MEDIA_NAME[entry.media]
  const ext = /\.([^.]{1,6})$/.exec(entry.name)?.[1]
  return ext ? ext.toUpperCase() : 'File'
}

function detail(entry: BrowseEntry): string {
  if (entry.kind === 'folder') return 'Folder'
  if (entry.kind === 'drive') return 'Drive'
  return [typeName(entry), entry.size !== undefined && size(entry.size)].filter(Boolean).join(' · ')
}

function clock(s: number): string {
  if (!Number.isFinite(s)) return '0:00'
  const total = Math.floor(s)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = String(total % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

// Line icons, 24-unit grid, drawn in the text colour.
const ICONS: Record<string, string> = {
  folder: 'M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2.2h8.4A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z',
  drive: 'M3 13.5 5.6 6h12.8l2.6 7.5v4A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5zM3 13.5h18M17 16.3h.01',
  image: 'M4.5 4h15A1.5 1.5 0 0 1 21 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5v-13A1.5 1.5 0 0 1 4.5 4zM3 16l5-5 4 4 3-3 6 6M15.5 8.5h.01',
  video: 'M4.5 5h11A1.5 1.5 0 0 1 17 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 17.5v-11A1.5 1.5 0 0 1 4.5 5zM17 10l4-2.5v9L17 14',
  audio: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  other: 'M6.5 3H14l5 5v11.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5v-15A1.5 1.5 0 0 1 6.5 3zM14 3v5h5'
}

function FileIcon({ entry, big = false }: { entry: BrowseEntry; big?: boolean }) {
  const shape = entry.kind === 'file' ? (entry.media ?? 'other') : entry.kind
  return (
    <svg className={`files-icon${big ? ' big' : ''}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d={ICONS[shape]} />
    </svg>
  )
}

/**
 * Scrolls the list (only) so `row` sits in its middle. Not scrollIntoView: that scrolls every
 * ancestor that can, the stage included, which then stays shifted up with a gap below.
 */
function centre(box: HTMLElement | null, row: HTMLElement): void {
  if (box) box.scrollTop = row.offsetTop - (box.clientHeight - row.offsetHeight) / 2
}

/** Mounted once in App; shows the browser while it's open. */
export function FilesApp() {
  const [from, setFrom] = useState<HTMLElement | null>(null)
  useEffect(() => {
    const onOpen = (event: Event): void => setFrom((event as CustomEvent<HTMLElement>).detail)
    window.addEventListener(FILES_EVENT, onOpen)
    return () => window.removeEventListener(FILES_EVENT, onOpen)
  }, [])
  const close = useCallback(() => {
    setFrom((tile) => {
      if (tile?.isConnected) requestAnimationFrame(() => focus(tile))
      return null
    })
  }, [])
  return from ? <FilesBrowser onClose={close} /> : null
}

function FilesBrowser({ onClose }: { onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [places, setPlaces] = useState<BrowseEntry[] | null>(null)
  // The place, then the folders walked into from it, innermost last.
  const [trail, setTrail] = useState<BrowseEntry[]>([])
  const [entries, setEntries] = useState<BrowseEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [focused, setFocused] = useState<BrowseEntry | null>(null)
  // The file open in the viewer, as an index into this folder's files.
  const [viewing, setViewing] = useState<number | null>(null)
  // Coming back out of a folder (or the viewer), the cursor goes to what it was on.
  const returnTo = useRef<string | null>(null)
  const here = trail[trail.length - 1] ?? null
  const files = entries?.filter((e) => e.kind === 'file') ?? []

  useEffect(() => {
    window.steamtv
      .browseFiles(null, 'all')
      .then((found) => {
        setPlaces(found)
        if (found[0]) setTrail([found[0]])
      })
      .catch((err: unknown) => setError(errorText(err)))
  }, [])

  // Opening: the cursor on the first place.
  useEffect(() => {
    const first = root.current?.querySelector<HTMLElement>('.files-place')
    if (first) focus(first)
  }, [places])

  useEffect(() => {
    if (!here) return
    setEntries(null)
    setError(null)
    window.steamtv
      .browseFiles(here.path, 'all')
      .then(setEntries)
      .catch((err: unknown) => setError(errorText(err)))
  }, [here])

  // Back in a folder: the cursor on the folder (or file) just left. Into a new one, its first row.
  useEffect(() => {
    if (!entries || viewing !== null) return
    const back = returnTo.current && list.current?.querySelector<HTMLElement>(`[data-path="${CSS.escape(returnTo.current)}"]`)
    returnTo.current = null
    // Only if the cursor is in the list already: moving between places, it stays on the place.
    const inList = list.current?.contains(document.activeElement)
    if (back) focus(back)
    else if (inList || !root.current?.contains(document.activeElement)) {
      const first = list.current?.querySelector<HTMLElement>('[data-focusable]')
      if (first) focus(first)
      else root.current?.querySelector<HTMLElement>('.files-place.active')?.focus()
    }
  }, [entries, viewing])

  const placeButton = (): HTMLElement | null => root.current?.querySelector<HTMLElement>('.files-place.active') ?? null

  useEffect(() => {
    const onBack = (): void => {
      if (viewing !== null) {
        returnTo.current = files[viewing]?.path ?? null
        return setViewing(null)
      }
      const inList = list.current?.contains(document.activeElement)
      if (inList && trail.length > 1) {
        returnTo.current = here!.path
        return setTrail((t) => t.slice(0, -1))
      }
      const place = placeButton()
      if (inList && place) return focus(place)
      onClose()
    }
    // L1/R1: a page up or down the list.
    const onPage = (event: Event): void => {
      if (viewing !== null) return
      const rows = [...(list.current?.querySelectorAll<HTMLElement>('[data-focusable]') ?? [])]
      const at = rows.indexOf(document.activeElement as HTMLElement)
      if (at < 0) return
      const next = rows[Math.max(0, Math.min(rows.length - 1, at + (event as CustomEvent<number>).detail * PAGE_ROWS))]
      if (next && next !== rows[at]) {
        focus(next)
        play('move')
      }
    }
    window.addEventListener(TRAP_CLOSE_EVENT, onBack)
    window.addEventListener(TRAP_TAB_EVENT, onPage)
    return () => {
      window.removeEventListener(TRAP_CLOSE_EVENT, onBack)
      window.removeEventListener(TRAP_TAB_EVENT, onPage)
    }
  }, [viewing, files, trail, here, onClose])

  const open = (entry: BrowseEntry): void => {
    if (entry.kind !== 'file') return setTrail((t) => [...t, entry])
    setViewing(files.indexOf(entry))
  }

  return (
    <div className="files-app" ref={root} data-focus-trap="">
      <div className="settings-scrim" aria-hidden="true" />
      <div className="settings-sidebar files-sidebar">
        <h2 className="settings-title display">Files</h2>
        <div className="settings-categories files-places" data-nav-scope="">
          {places?.map((p) => (
            <button
              key={p.path}
              className={`settings-category files-place display${trail[0]?.path === p.path ? ' active' : ''}`}
              tabIndex={-1}
              data-focusable=""
              data-select-sound="move"
              data-nav-right=".files-list [data-focusable]"
              // The right side follows the cursor, as in Settings; A (or right) steps into it.
              onFocus={() => {
                if (trail[0]?.path !== p.path) setTrail([p])
              }}
              onClick={() => {
                const first = list.current?.querySelector<HTMLElement>('[data-focusable]')
                if (first) focus(first)
              }}
            >
              <span className="files-place-name">{p.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="files-pane">
        <div className="settings-group files-group">
          <h3 className="settings-heading display">{here?.name ?? 'Files'}</h3>
          <p className="settings-help files-path">{here ? `${here.path}${entries ? ` · ${entries.length} ${entries.length === 1 ? 'item' : 'items'}` : ''}` : ''}</p>
          <div className="files-body">
            <div className="files-list browse-list" ref={list} data-nav-scope="" data-nav-left=".files-place.active">
              {error && <p className="settings-help">{error}</p>}
              {entries && entries.length === 0 && !error && <p className="settings-help">Nothing here.</p>}
              {entries?.map((e) => (
                <button
                  key={e.path}
                  className="setting-row files-row"
                  tabIndex={-1}
                  data-focusable=""
                  data-select-sound="move"
                  data-path={e.path}
                  onFocus={(event) => {
                    centre(list.current, event.currentTarget)
                    setFocused(e)
                  }}
                  onClick={() => open(e)}
                >
                  <FileIcon entry={e} />
                  <span className="setting-name display">{e.name}</span>
                  <span className="setting-detail">{detail(e)}</span>
                </button>
              ))}
            </div>
            <Preview entry={focused && entries?.includes(focused) ? focused : null} />
          </div>
        </div>
      </div>

      {viewing !== null && files[viewing] && <Viewer files={files} index={viewing} onStep={setViewing} />}
    </div>
  )
}

/** A file's own address, once the cursor has settled on it (null while it loads, or for a folder). */
function useFileUrl(entry: BrowseEntry | null, delay = 0): string | null {
  const [url, setUrl] = useState<{ path: string; url: string } | null>(null)
  useEffect(() => {
    if (!entry?.media) return
    let live = true
    const timer = setTimeout(() => {
      window.steamtv
        .openFile(entry.path)
        .then((u) => live && setUrl({ path: entry.path, url: u }))
        .catch(() => undefined)
    }, delay)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [entry, delay])
  return entry && url?.path === entry.path ? url.url : null
}

/** Beside the list: the picture, a silent look at the video, or what the file is. */
function Preview({ entry }: { entry: BrowseEntry | null }) {
  const url = useFileUrl(entry, PREVIEW_DELAY_MS)
  if (!entry) return <div className="files-preview" />
  return (
    <div className="files-preview">
      <div className="files-preview-frame">
        {entry.media === 'image' && url && <img key={url} src={url} alt="" />}
        {entry.media === 'video' && url && <video key={url} src={url} muted autoPlay loop playsInline />}
        {(entry.kind !== 'file' || entry.media === 'audio' || !entry.media) && (
          <FileIcon entry={entry} big />
        )}
      </div>
      <p className="files-preview-name display">{entry.name}</p>
      <p className="settings-help">
        {entry.kind === 'file'
          ? [typeName(entry), entry.size !== undefined && size(entry.size), entry.modified && date(entry.modified)].filter(Boolean).join(' · ')
          : detail(entry)}
      </p>
    </div>
  )
}

/**
 * A file full screen. Pictures: left/right (or L1/R1) for the folder's others. Videos and
 * songs: A pauses, left/right skip 10 seconds, L1/R1 the previous or next file; a song
 * that ends goes on to the next if that's a song too. Anything else: what it is.
 */
function Viewer({ files, index, onStep }: { files: BrowseEntry[]; index: number; onStep: (index: number) => void }) {
  const entry = files[index]
  const url = useFileUrl(entry)
  const self = useRef<HTMLButtonElement>(null)
  const media = useRef<HTMLVideoElement & HTMLAudioElement>(null)
  const [paused, setPaused] = useState(false)
  const [time, setTime] = useState({ at: 0, length: 0 })
  const [barShown, setBarShown] = useState(true)
  const barTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [controls, setControls] = useState<Controls>(DEFAULT_CONTROLS)
  const family = useControllerFamily()
  const playable = entry.media === 'video' || entry.media === 'audio'

  useEffect(() => {
    window.steamtv.getSettings().then((s) => setControls(s.controls))
    // Holds the cursor itself, so A comes here.
    if (self.current) focus(self.current)
  }, [])

  // The bar shows on any press, and fades while something plays.
  const showBar = useCallback(() => {
    setBarShown(true)
    clearTimeout(barTimer.current)
    barTimer.current = setTimeout(() => setBarShown(false), BAR_MS)
  }, [])
  useEffect(() => () => clearTimeout(barTimer.current), [])
  useEffect(() => {
    setPaused(false)
    setTime({ at: 0, length: 0 })
    showBar()
  }, [index, showBar])

  // A video or song holds the background music, and keeps the screensaver off while it plays.
  useEffect(() => {
    if (!playable) return
    window.dispatchEvent(new CustomEvent(MUSIC_HOLD_EVENT, { detail: true }))
    return () => void window.dispatchEvent(new CustomEvent(MUSIC_HOLD_EVENT, { detail: false }))
  }, [playable])
  useEffect(() => {
    const holder = {}
    keepAwake(holder, playable && !paused)
    return () => keepAwake(holder, false)
  }, [playable, paused])

  // A game or app coming to the front pauses it, as it does the music.
  useEffect(() => {
    const onBlur = (): void => media.current?.pause()
    window.addEventListener('blur', onBlur)
    return () => window.removeEventListener('blur', onBlur)
  }, [])

  const step = useCallback(
    (by: number): void => {
      const next = index + by
      if (next < 0 || next >= files.length) return
      play('move')
      onStep(next)
    },
    [index, files.length, onStep]
  )

  useEffect(() => {
    const onDirection = (event: Event): void => {
      const direction = (event as CustomEvent<Direction>).detail
      showBar()
      const el = media.current
      if (playable && el && (direction === 'left' || direction === 'right')) {
        el.currentTime = Math.max(0, Math.min(el.duration || 0, el.currentTime + (direction === 'right' ? SEEK_S : -SEEK_S)))
        return
      }
      if (!playable && direction === 'left') step(-1)
      if (!playable && direction === 'right') step(1)
    }
    const onTab = (event: Event): void => {
      showBar()
      step((event as CustomEvent<number>).detail)
    }
    window.addEventListener(OWN_DIRECTION_EVENT, onDirection)
    window.addEventListener(TRAP_TAB_EVENT, onTab)
    return () => {
      window.removeEventListener(OWN_DIRECTION_EVENT, onDirection)
      window.removeEventListener(TRAP_TAB_EVENT, onTab)
    }
  }, [playable, step, showBar])

  const toggle = (): void => {
    showBar()
    const el = media.current
    if (!el) return
    if (el.paused) el.play().catch(() => undefined)
    else el.pause()
  }

  const onEnded = (): void => {
    setPaused(true)
    setBarShown(true)
    if (entry.media === 'audio' && files[index + 1]?.media === 'audio') step(1)
  }

  const mediaEvents = {
    ref: media,
    src: url ?? undefined,
    autoPlay: true,
    onPlay: () => setPaused(false),
    onPause: () => setPaused(true),
    onEnded,
    onTimeUpdate: () => media.current && setTime({ at: media.current.currentTime, length: media.current.duration })
  }

  return (
    <button
      ref={self}
      className={`files-viewer${barShown || paused || !playable ? ' bar-shown' : ''}`}
      tabIndex={-1}
      data-focusable=""
      data-own-directions=""
      data-select-sound="move"
      onClick={playable ? toggle : showBar}
    >
      {entry.media === 'image' && url && <img key={url} className="files-viewer-media" src={url} alt="" />}
      {entry.media === 'video' && url && <video key={url} className="files-viewer-media" playsInline {...mediaEvents} />}
      {entry.media === 'audio' && (
        <div className="files-viewer-song">
          <FileIcon entry={entry} big />
          <p className="files-viewer-title display">{entry.name.replace(/\.[^.]+$/, '')}</p>
          {url && <audio key={url} {...mediaEvents} />}
        </div>
      )}
      {!entry.media && (
        <div className="files-viewer-song">
          <FileIcon entry={entry} big />
          <p className="files-viewer-title display">{entry.name}</p>
          <p className="settings-help">
            {[typeName(entry), entry.size !== undefined && size(entry.size), entry.modified && date(entry.modified)].filter(Boolean).join(' · ')}
          </p>
          <p className="settings-help">vaporTV can only open pictures, videos and songs.</p>
        </div>
      )}

      <div className="files-viewer-bar">
        <div className="files-viewer-line">
          <span className="files-viewer-name display">{entry.name}</span>
          <span className="files-viewer-count">
            {index + 1} of {files.length}
          </span>
        </div>
        {playable && (
          <div className="files-viewer-line">
            <span className="files-viewer-time">{clock(time.at)}</span>
            <span className="files-progress">
              <span className="files-progress-fill" style={{ width: `${time.length ? (time.at / time.length) * 100 : 0}%` }} />
            </span>
            <span className="files-viewer-time">{clock(time.length)}</span>
          </div>
        )}
        <div className="files-viewer-hints">
          {playable && (
            <span className="files-hint">
              <ButtonIcon button={controls.select} family={family} /> {paused ? 'Play' : 'Pause'}
            </span>
          )}
          <span className="files-hint">
            <DpadIcon /> {playable ? `${SEEK_S} seconds` : 'Previous / next'}
          </span>
          {playable && (
            <span className="files-hint">
              <ButtonIcon button={controls.previousTab} family={family} />
              <ButtonIcon button={controls.nextTab} family={family} /> Previous / next
            </span>
          )}
          <span className="files-hint">
            <ButtonIcon button={controls.back} family={family} /> Back
          </span>
        </div>
      </div>
    </button>
  )
}
