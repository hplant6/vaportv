import { execFile, spawn } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { copyFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { flatpakInstalled } from '../library/emulators'
import { installFlatpak } from '../appSetup'
import { STEAMTV_APPID } from '../hotkey'
import type { Controls } from '../../shared/controls'
import { MpvIpc, type MpvEvent } from './mpvIpc'
import { readPads, type PadDirection } from './padInput'
import { handle, initialState, tick, type PlayerCommand, type PlayerInput, type PlayerState, type PlayerTrack } from './playerUi'
import { OSD_H, OSD_W, renderOsd, type OsdFonts } from './playerOsd'

// Movies and shows play in mpv (a Flatpak, installed from Flathub the first time): it plays the
// server's file as it is (H.265, any audio, picture subtitles) with the GPU decoding, so the
// server never converts anything. vaporTV runs it over its JSON IPC socket and draws the controls
// on mpv's own screen (playerUi.ts, playerOsd.ts), so it looks and works like vaporTV's player.
//
// Input: mpv has the window, so a remote's or keyboard's keys reach mpv, whose input.conf (written
// here, with every built-in binding off) hands them back to vaporTV as script messages. mpv doesn't
// read controllers any more, and vaporTV's page has lost focus, so controllers are read here
// (padInput.ts).
//
// Gamescope shows a window only if it knows which Steam app it belongs to. mpv runs in Flatpak's
// sandbox, whose process ids gamescope can't trace back to vaporTV's Steam session, so its window
// is tagged with vaporTV's app id (STEAM_GAME), as soon as mpv says which window it is.

const MPV = 'io.mpv.Mpv'
/** mpv's own config folder for vaporTV, inside its Flatpak's data (so the sandbox can read it), apart from the user's own mpv settings. */
const CONFIG_DIR = join(homedir(), '.var', 'app', MPV, 'config', 'vaportv')
const FONTS_DIR = join(CONFIG_DIR, 'fonts')
/** Flatpak shares this folder with the sandbox at the same path: where the IPC socket goes. */
const RUNTIME_DIR = join(process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid?.() ?? 1000}`, 'app', MPV)
const REPORT_MS = 10_000
const CONNECT_TIMEOUT_MS = 20_000
/** mpv gone this soon without playing anything: it didn't work, so the page's player takes over. */
const FAILED_WITHIN_MS = 15_000

/** Keys (a remote's, a keyboard's) → what they do. Everything else does nothing. */
const KEYS: [string, PlayerInput][] = [
  ['UP', 'up'],
  ['DOWN', 'down'],
  ['LEFT', 'left'],
  ['RIGHT', 'right'],
  ['ENTER', 'select'],
  ['KP_ENTER', 'select'],
  ['ESC', 'back'],
  ['BS', 'back'],
  ['SPACE', 'playPause'],
  ['PLAYPAUSE', 'playPause'],
  ['PLAY', 'playPause'],
  ['PAUSE', 'playPause'],
  ['STOP', 'stop'],
  ['FORWARD', 'skipOn'],
  ['REWIND', 'skipBack'],
  ['NEXT', 'skipOn'],
  ['PREV', 'skipBack'],
  ['y', 'tracks'],
  ['t', 'tracks']
]
const INPUT_CONF = `# Written by vaporTV each time it plays something: keys go back to vaporTV, which draws the controls.
${KEYS.map(([key, input]) => `${key} script-message vtv ${input}`).join('\n')}
`

export interface ExternalPlay {
  title: string
  subtitle: string
  url: string
  startSeconds: number
  durationSeconds?: number
  /** The server's tracks, in the file's order (and subtitle files beside it). */
  audioStreams: { index: number; name: string }[]
  subtitleStreams: { index: number; name: string; url?: string }[]
  /** The ones the server would pick (Emby's stream index; subtitle -1: none). */
  audio?: number
  subtitleTrack: number
}

export interface PlayerHooks {
  /** Where it's got to (seconds), as it plays, on pausing, and as it stops. */
  onPosition: (event: 'start' | 'progress' | 'stop', seconds: number, paused: boolean) => void
  controls: Controls
  log: (line: string) => void
  report?: (line: string) => void
}

/** vaporTV's fonts, copied where mpv's sandbox can read them; the families' names for the drawing. */
async function installFonts(log: (line: string) => void): Promise<OsdFonts> {
  const renderer = join(__dirname, '..', 'renderer')
  const assets = join(renderer, 'assets')
  const files = await readdir(assets).catch(() => [] as string[])
  const find = (pattern: RegExp): string | undefined => {
    const name = files.find((f) => pattern.test(f))
    return name ? join(assets, name) : undefined
  }
  const wanted: [string | undefined, string][] = [
    [find(/^bricolage-grotesque-latin-400-normal.*\.woff2$/), 'body-400.woff2'],
    [find(/^bricolage-grotesque-latin-800-normal.*\.woff2$/), 'body-800.woff2'],
    [find(/^TiltWarp.*\.ttf$/), 'tilt-warp.ttf'],
    [join(renderer, 'private', 'display.woff2'), 'display.woff2']
  ]
  await mkdir(FONTS_DIR, { recursive: true })
  for (const [from, to] of wanted) {
    if (!from || !existsSync(from)) continue
    const dest = join(FONTS_DIR, to)
    try {
      if (!existsSync(dest) || statSync(dest).size !== statSync(from).size) await copyFile(from, dest)
    } catch (err) {
      log(`player: couldn't copy the font ${to}: ${err}`)
    }
  }
  return {
    display: existsSync(join(FONTS_DIR, 'display.woff2')) ? 'Marvin Visions Big Bold' : 'Tilt Warp',
    body: 'Bricolage Grotesque 96pt ExtraBold',
    bodyBold: 'Bricolage Grotesque 96pt ExtraBold ExtraBold'
  }
}

function xprop(display: string | undefined, args: string[]): Promise<void> {
  return new Promise((resolve, reject) =>
    execFile('xprop', args, { env: { ...process.env, ...(display ? { DISPLAY: display } : {}) } }, (err, _out, stderr) =>
      err ? reject(new Error(stderr.trim() || err.message)) : resolve()
    )
  )
}

/** mpv's track list entry (the parts used). */
interface MpvTrack {
  id: number
  type: 'video' | 'audio' | 'sub'
  title?: string
  lang?: string
  codec?: string
  external?: boolean
  'external-filename'?: string
  'demux-channel-count'?: number
}

const LANGUAGES: Record<string, string> = { eng: 'English', en: 'English', fre: 'French', fra: 'French', ger: 'German', deu: 'German', spa: 'Spanish', ita: 'Italian', jpn: 'Japanese', ja: 'Japanese', kor: 'Korean', chi: 'Chinese', zho: 'Chinese', por: 'Portuguese', rus: 'Russian', dut: 'Dutch', nld: 'Dutch', swe: 'Swedish', nor: 'Norwegian', dan: 'Danish', fin: 'Finnish', pol: 'Polish', ara: 'Arabic', hin: 'Hindi' }

/** mpv's own name for a track, when the server's can't be matched to it. */
function mpvName(track: MpvTrack, n: number): string {
  const language = track.lang ? LANGUAGES[track.lang] ?? track.lang.toUpperCase() : ''
  const channels = track['demux-channel-count'] ? ({ 1: 'Mono', 2: 'Stereo', 6: '5.1', 8: '7.1' } as Record<number, string>)[track['demux-channel-count']] : ''
  const parts = [track.title, language, channels, track.codec?.toUpperCase()].filter(Boolean)
  return parts.length ? [...new Set(parts)].join(' · ') : `${track.type === 'audio' ? 'Track' : 'Subtitles'} ${n}`
}

/**
 * The menu's tracks: mpv's, named as the server names them when the two lists line up (the same
 * tracks in the same order: the file's own, then subtitle files), else as mpv names them.
 */
export function matchTracks(
  tracks: MpvTrack[],
  play: Pick<ExternalPlay, 'audioStreams' | 'subtitleStreams'>
): { audio: PlayerTrack[]; subtitles: PlayerTrack[]; audioIndex: Map<number, number>; subtitleIndex: Map<number, number> } {
  const audio = tracks.filter((t) => t.type === 'audio')
  const subs = tracks.filter((t) => t.type === 'sub')
  const serverSubs = [...play.subtitleStreams.filter((s) => !s.url), ...play.subtitleStreams.filter((s) => s.url)]
  const audioMatch = audio.length === play.audioStreams.length
  const subsMatch = subs.length === serverSubs.length
  const audioIndex = new Map<number, number>()
  const subtitleIndex = new Map<number, number>()
  if (audioMatch) audio.forEach((t, i) => audioIndex.set(play.audioStreams[i].index, t.id))
  if (subsMatch) subs.forEach((t, i) => subtitleIndex.set(serverSubs[i].index, t.id))
  return {
    audio: audio.map((t, i) => ({ id: t.id, name: audioMatch ? play.audioStreams[i].name : mpvName(t, i + 1) })),
    subtitles: subs.map((t, i) => ({ id: t.id, name: subsMatch ? serverSubs[i].name : mpvName(t, i + 1) })),
    audioIndex,
    subtitleIndex
  }
}

/** A controller button (standard index) → what it does in the player, from Settings → Controller. */
function padInput(controls: Controls, button: number): PlayerInput | null {
  if (button === controls.select) return 'select'
  if (button === controls.back) return 'back'
  if (button === controls.favorite) return 'tracks'
  if (button === controls.sideBar) return 'skipBack'
  if (button === controls.controlsGuide) return 'skipOn'
  return null
}

/**
 * Plays it in mpv until it's closed. Resolves with where it stopped, or null if mpv couldn't be
 * run or didn't play anything (so the caller can play it in the page instead).
 */
export async function playInMpv(play: ExternalPlay, hooks: PlayerHooks): Promise<number | null> {
  const { log } = hooks
  let fonts: OsdFonts
  try {
    if (!flatpakInstalled(MPV)) await installFlatpak(MPV, 'mpv', hooks.report ?? (() => undefined))
    await mkdir(CONFIG_DIR, { recursive: true })
    await writeFile(join(CONFIG_DIR, 'input.conf'), INPUT_CONF)
    await writeFile(join(CONFIG_DIR, 'mpv.conf'), '# vaporTV passes its settings on the command line.\n')
    fonts = await installFonts(log)
    await mkdir(RUNTIME_DIR, { recursive: true })
  } catch (err) {
    log(`player: mpv setup failed: ${err}`)
    return null
  }
  const socket = join(RUNTIME_DIR, `vaportv-${process.pid}.sock`)
  await rm(socket, { force: true })

  const start = play.startSeconds > 5 ? Math.floor(play.startSeconds) : 0
  const args = [
    'run',
    // X11, not Wayland: gamescope tells apps apart by X window properties (see above).
    '--nosocket=wayland',
    '--die-with-parent',
    MPV,
    `--config-dir=${CONFIG_DIR}`,
    `--input-ipc-server=${socket}`,
    '--input-default-bindings=no',
    '--input-builtin-bindings=no',
    '--input-cursor=no',
    '--cursor-autohide=always',
    '--osc=no',
    '--osd-level=0',
    '--x11-name=vaportv-player',
    '--title=vaporTV',
    '--fullscreen',
    '--force-window=immediate',
    '--background-color=#000000',
    '--keep-open=no',
    '--idle=no',
    '--hwdec=auto-safe',
    '--vo=gpu-next',
    // Reads well ahead (two minutes, up to 1 GiB), so a slow stretch of the network doesn't stop the picture.
    '--cache=yes',
    '--cache-secs=120',
    '--demuxer-max-bytes=1GiB',
    '--demuxer-readahead-secs=120',
    '--network-timeout=30',
    `--osd-fonts-dir=${FONTS_DIR}`,
    `--sub-fonts-dir=${FONTS_DIR}`,
    `--sub-font=${fonts.body}`,
    '--sub-bold=no',
    '--sub-font-size=31',
    '--sub-border-style=background-box',
    '--sub-back-color=#9E000000',
    '--sub-margin-y=40',
    '--msg-level=all=warn',
    `--force-media-title=${play.title}`,
    ...(start ? [`--start=${start}`] : []),
    ...play.subtitleStreams.filter((s) => s.url).map((s) => `--sub-file=${s.url}`),
    play.url
  ]
  const child = spawn('flatpak', args, { stdio: ['ignore', 'pipe', 'pipe'] })
  const opened = Date.now()
  let running = true
  const quiet = (line: string): string => line.replace(/api_key=[^&\s]+/g, 'api_key=***')
  const logOutput = (chunk: Buffer): void => {
    for (const line of chunk.toString().split(/[\r\n]+/)) {
      if (line.trim() && !/Not sharing "\/esp"|radv is not a conformant/.test(line)) log(`player: mpv: ${quiet(line.trim())}`)
    }
  }
  child.stdout.on('data', logOutput)
  child.stderr.on('data', logOutput)
  const exited = new Promise<number | null>((resolve) => {
    child.on('error', (err) => {
      log(`player: could not run mpv: ${err}`)
      resolve(-1)
    })
    child.on('exit', (code) => resolve(code))
  })
  void exited.then(() => (running = false))

  let state: PlayerState = initialState(play.title, play.subtitle, Date.now())
  if (play.durationSeconds) state.duration = play.durationSeconds
  state.position = start
  let started = false
  let lastReport = 0
  let shown = ''
  let tracksPicked = false
  let stopPads = (): void => undefined
  let timer: ReturnType<typeof setTimeout> | undefined

  const ipc = new MpvIpc(
    (event) => onEvent(event),
    () => undefined
  )

  const draw = (): void => {
    const ass = renderOsd(state, Date.now(), fonts)
    if (ass === shown) return
    shown = ass
    ipc.send('osd-overlay', 1, ass ? 'ass-events' : 'none', ass, OSD_W, OSD_H, 0, false, false)
  }

  const run = (commands: PlayerCommand[]): void => {
    for (const c of commands) {
      if ('seek' in c) {
        state = { ...state, loading: true }
        ipc.send('seek', c.seek, 'absolute')
      } else if ('pause' in c) {
        ipc.send('set_property', 'pause', c.pause)
        if (started) hooks.onPosition('progress', state.position, c.pause)
      } else if ('audio' in c) ipc.send('set_property', 'aid', c.audio)
      else if ('subtitle' in c) ipc.send('set_property', 'sid', c.subtitle ?? 'no')
      else if ('stop' in c) ipc.send('quit')
    }
  }

  const input = (what: PlayerInput): void => {
    const [next, commands] = handle(state, what, Date.now())
    state = next
    run(commands)
    draw()
  }

  // Time passing: the bar hiding, a scrub settling, the spinner turning (quicker while it shows).
  const loop = (): void => {
    const [next, commands] = tick(state, Date.now())
    state = next
    run(commands)
    draw()
    timer = setTimeout(loop, state.loading ? 40 : 200)
  }

  const onEvent = (event: MpvEvent): void => {
    if (event.event === 'client-message' && event.args?.[0] === 'vtv') {
      input(event.args[1] as PlayerInput)
      return
    }
    if (event.event === 'playback-restart') {
      state = { ...state, loading: false }
      if (!started) {
        started = true
        lastReport = Date.now()
        hooks.onPosition('start', state.position, state.paused)
        log(`player: playing ${play.title} in mpv`)
      }
      return
    }
    if (event.event === 'seek') {
      state = { ...state, loading: true }
      return
    }
    if (event.event !== 'property-change') return
    const data = event.data
    switch (event.name) {
      case 'time-pos':
        if (typeof data === 'number') {
          state = { ...state, position: data }
          if (started && Date.now() - lastReport >= REPORT_MS) {
            lastReport = Date.now()
            hooks.onPosition('progress', data, state.paused)
          }
        }
        break
      case 'duration':
        if (typeof data === 'number' && data > 0) state = { ...state, duration: data }
        break
      case 'pause':
        state = { ...state, paused: data === true }
        break
      case 'paused-for-cache':
        if (data === true) state = { ...state, loading: true }
        else if (data === false && started) state = { ...state, loading: false }
        break
      case 'aid':
        state = { ...state, aid: typeof data === 'number' ? data : null }
        break
      case 'sid':
        state = { ...state, sid: typeof data === 'number' ? data : null }
        break
      case 'track-list': {
        if (!Array.isArray(data)) break
        const matched = matchTracks(data as MpvTrack[], play)
        state = { ...state, audio: matched.audio, subtitles: matched.subtitles }
        // Once the file's open: the server's picks (the user's language preferences), where they can be matched.
        if (!tracksPicked && (matched.audio.length || matched.subtitles.length)) {
          tracksPicked = true
          const aid = play.audio !== undefined ? matched.audioIndex.get(play.audio) : undefined
          if (aid !== undefined) ipc.send('set_property', 'aid', aid)
          if (play.subtitleTrack === -1) ipc.send('set_property', 'sid', 'no')
          else {
            const sid = matched.subtitleIndex.get(play.subtitleTrack)
            if (sid !== undefined) ipc.send('set_property', 'sid', sid)
          }
        }
        break
      }
      case 'window-id':
        if (typeof data === 'number' && STEAMTV_APPID !== null) {
          xprop(process.env.DISPLAY, ['-id', String(data), '-f', 'STEAM_GAME', '32c', '-set', 'STEAM_GAME', String(STEAMTV_APPID)])
            .then(() => log(`player: mpv's window ${data} tagged as vaporTV's`))
            .catch((err) => log(`player: couldn't tag mpv's window: ${err}`))
        }
        break
    }
    draw()
  }

  try {
    await ipc.connect(socket, CONNECT_TIMEOUT_MS, () => running)
  } catch (err) {
    log(`player: couldn't reach mpv: ${err}`)
    child.kill('SIGTERM')
    const code = await exited
    log(`player: mpv exited (${code}) before it could be reached`)
    return null
  }
  ;['time-pos', 'duration', 'pause', 'paused-for-cache', 'aid', 'sid', 'track-list', 'window-id'].forEach((name, i) => ipc.observe(i + 1, name))
  draw()
  loop()
  stopPads = readPads(
    {
      button: (button) => {
        const what = padInput(hooks.controls, button)
        if (what) input(what)
      },
      direction: (direction: PadDirection) => input(direction)
    },
    log
  )

  const code = await exited
  stopPads()
  clearTimeout(timer)
  ipc.close()
  await rm(socket, { force: true }).catch(() => undefined)
  log(`player: mpv closed (exit ${code}) at ${Math.round(state.position)} s`)
  if (!started) return code !== 0 && Date.now() - opened < FAILED_WITHIN_MS ? null : start
  hooks.onPosition('stop', state.position, false)
  return state.position
}
