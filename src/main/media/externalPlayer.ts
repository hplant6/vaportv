import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { flatpakInstalled } from '../library/emulators'
import { installFlatpak } from '../appSetup'

// Movies and shows play in mpv (a Flatpak, installed from Flathub the first time): it plays what the
// server has as it is (H.265, any audio, picture subtitles) with the GPU decoding, so the server
// never has to convert it. It opens full screen over vaporTV, like any other app, and where it had
// got to goes back to the server as it plays.

const MPV = 'io.mpv.Mpv'
/** Where mpv's Flatpak reads its settings (its ~/.config). */
const CONFIG_DIR = join(homedir(), '.var', 'app', MPV, 'config', 'mpv')
const PROGRESS_MS = 10_000

/** Escape and the controller's B close it (mpv's own Escape only leaves full screen). */
const INPUT_CONF = `# Written by vaportV
ESC quit
GAMEPAD_BACK quit
GAMEPAD_ACTION_RIGHT quit
`

export interface ExternalPlay {
  title: string
  url: string
  startSeconds: number
}

/**
 * Plays it in mpv until it's closed, calling `onPosition` (seconds, paused) as it goes.
 * Resolves with where it stopped, or null if mpv couldn't be run (so the caller can play it
 * in the page instead).
 */
export async function playInMpv(
  play: ExternalPlay,
  onPosition: (seconds: number, paused: boolean) => void,
  report: (line: string) => void = () => undefined
): Promise<number | null> {
  try {
    if (!flatpakInstalled(MPV)) await installFlatpak(MPV, 'mpv', report)
    await mkdir(CONFIG_DIR, { recursive: true })
    if (!existsSync(join(CONFIG_DIR, 'input.conf'))) await writeFile(join(CONFIG_DIR, 'input.conf'), INPUT_CONF)
  } catch (err) {
    console.error('steamtv: mpv setup:', err)
    return null
  }
  const args = [
    'run', '--device=all', '--filesystem=/run/udev:ro', MPV,
    '--fullscreen', '--force-window=immediate', '--hwdec=auto-safe', '--input-gamepad=yes', '--keep-open=no',
    '--osd-level=1', '--osd-bar-align-y=0.9', `--force-media-title=${play.title}`,
    ...(play.startSeconds > 5 ? [`--start=${Math.floor(play.startSeconds)}`] : []),
    // One line a second on stdout, "vtv <seconds> <yes|no paused>", for the server's resume point.
    '--term-status-msg=vtv ${=time-pos} ${pause}',
    play.url
  ]
  return new Promise((resolve) => {
    const child = spawn('flatpak', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const opened = Date.now()
    let position = play.startSeconds
    let paused = false
    let last = 0
    child.stdout.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString().split(/[\r\n]+/)) {
        const m = /^vtv (\d+(?:\.\d+)?) (yes|no)/.exec(line)
        if (!m) continue
        position = Number(m[1])
        paused = m[2] === 'yes'
        if (Date.now() - last >= PROGRESS_MS) {
          last = Date.now()
          onPosition(position, paused)
        }
      }
    })
    child.stderr.on('data', (chunk: Buffer) => console.warn('steamtv: mpv:', chunk.toString().trim().replace(/api_key=[^&\s]+/g, 'api_key=***')))
    child.on('error', (err) => {
      console.error('steamtv: could not run mpv:', err)
      resolve(null)
    })
    // Gone within a few seconds with nothing played: it didn't work, so the page's player takes over.
    child.on('exit', (code) => resolve(code !== 0 && position === play.startSeconds && Date.now() - opened < 8000 ? null : position))
  })
}
